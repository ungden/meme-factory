import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, latestChannelProfile } from "@/lib/short-film/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { getPointCost } from "@/lib/point-pricing.server";
import { estimateImageGenerationPrice } from "@/lib/ai-pricing";
import { compileCharacterPosePrompt, generateCharacterPose, generateFilmReferenceView, IMAGE_MODEL } from "@/lib/gemini-image";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import { chargedCharacterImage, InsufficientPointsError } from "@/lib/charged-image";
import {
  FILM_REFERENCE_VIEWS,
  filmMediumFor,
  filmPackReady,
  filmReferencePrompt,
  isFilmReferenceView,
  type FilmReferenceView,
} from "@/lib/short-film/channel-setup";

const BUCKET = "character-poses";

type Access = Awaited<ReturnType<typeof access>>;

/** Ảnh của bộ phải nằm đúng thư mục bộ ảnh của nhân vật này trong kho của dự án. */
function packFolder(projectId: string, characterId: string) {
  return `${projectId}/film-pack/${characterId}`;
}
function ownsPackPath(projectId: string, characterId: string, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`${packFolder(projectId, characterId)}/`) &&
    !path.includes("..") &&
    /\/(face|body|back)-[0-9a-f-]{36}\.png$/i.test(path)
  );
}

async function download(path: string) {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
  if (error || !data) throw new FilmError("Không đọc được ảnh nhân vật. Hãy tạo lại.");
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Ảnh đã tạo mà chưa khoá (lần trước dừng giữa chừng): trả về để lần sau dùng
 * lại thay vì trả tiền vẽ lại góc đã có.
 */
async function draftViews(projectId: string, characterId: string) {
  const bucket = getSupabaseAdmin().storage.from(BUCKET);
  const { data } = await bucket.list(packFolder(projectId, characterId), {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
  const drafts: Partial<Record<FilmReferenceView, { path: string; url: string }>> = {};
  for (const file of data || []) {
    const view = file.name.split("-")[0];
    if (!isFilmReferenceView(view) || drafts[view]) continue;
    const path = `${packFolder(projectId, characterId)}/${file.name}`;
    drafts[view] = { path, url: bucket.getPublicUrl(path).data.publicUrl };
  }
  return drafts;
}

async function loadCharacters(a: Access) {
  const { data: characters, error } = await a.admin
    .from("characters")
    .select("id,name,description,avatar_url,continuity_asset_id")
    .eq("project_id", a.project.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ids = (characters || []).map((c) => c.id);
  const { data: dna } = ids.length
    ? await a.admin.from("character_dna").select("character_id,art_direction").in("character_id", ids)
    : { data: [] };
  const assetIds = (characters || []).map((c) => c.continuity_asset_id).filter(Boolean) as string[];
  const { data: versions } = assetIds.length
    ? await a.admin
        .from("asset_versions")
        .select("asset_id,version,reference_images(role,image_url,is_primary)")
        .in("asset_id", assetIds)
        .eq("status", "locked")
        .order("version", { ascending: false })
    : { data: [] };
  return Promise.all(
    (characters || []).map(async (character) => {
      const latest = (versions || []).find((version) => version.asset_id === character.continuity_asset_id);
      const references = (latest?.reference_images || []) as Array<{ role: string; image_url: string; is_primary: boolean }>;
      const artDirection = dna?.find((row) => row.character_id === character.id)?.art_direction || "soft_3d";
      const packComplete = filmPackReady(references.map((reference) => reference.role));
      return {
        id: character.id,
        name: character.name,
        description: character.description || "",
        avatarUrl: character.avatar_url,
        artDirection,
        medium: filmMediumFor(artDirection),
        // Khâu quay chỉ cần một phiên bản khoá có ảnh chính (freezeCast); bộ đủ
        // ba góc là nâng cấp, không phải điều kiện để được làm phim.
        ready: references.some((reference) => reference.is_primary),
        packComplete,
        references: Object.fromEntries(references.map((reference) => [reference.role, reference.image_url])),
        drafts: packComplete ? {} : await draftViews(a.project.id, character.id),
      };
    }),
  );
}

/** Trạng thái thiết lập kênh phim: hồ sơ kênh và bộ ảnh chuẩn của từng nhân vật. */
export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    const [profile, characters, { data: project }] = await Promise.all([
      latestChannelProfile(a),
      loadCharacters(a),
      a.admin.from("projects").select("description").eq("id", a.project.id).single(),
    ]);
    const roleIds = (profile?.roles || []).map((role: { characterId: string }) => role.characterId);
    const cast = characters.filter((character) => roleIds.includes(character.id));
    return NextResponse.json({
      profile,
      characters,
      pointsPerImage: await getPointCost("character"),
      owner: a.project.user_id === a.user.id,
      projectId: a.project.id,
      workspaceVersion: a.project.workspace_version,
      // Hồ sơ kênh lấy từ bước tạo kênh, dùng khi lưu dàn nhân vật lần đầu.
      channel: {
        audience: profile?.audience || a.project.audience || "",
        tone: profile?.tone || a.project.brand_voice || "",
        positioning: profile?.positioning || project?.description || "",
      },
      ready: Boolean(profile) && cast.length > 0 && cast.every((character) => character.ready),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    const body = await r.json().catch(() => ({}));
    if (Number(body.workspaceVersion) !== a.project.workspace_version)
      throw new FilmError("Dự án vừa thay đổi. Tải lại trang rồi thử lại.", 409);
    const { data: character } = await a.admin
      .from("characters")
      .select("id,name,description,avatar_url")
      .eq("id", String(body.characterId || ""))
      .eq("project_id", a.project.id)
      .maybeSingle();
    if (!character) throw new FilmError("Chọn nhân vật của kênh.");
    const { data: dna } = await a.admin
      .from("character_dna")
      .select("art_direction")
      .eq("character_id", character.id)
      .maybeSingle();
    const medium = filmMediumFor(dna?.art_direction);

    // Ảnh gốc vẽ từ mô tả chữ: nhân vật AI vừa nghĩ ra chưa có ảnh nào, mà bộ ảnh
    // chuẩn phải dựng từ một ảnh của chính nhân vật. Ảnh này cũng là ảnh đại diện
    // và là tham chiếu cho meme.
    if (body.action === "origin") {
      const params = {
        characterName: character.name,
        characterDescription: character.description || character.name,
        emotion: "neutral",
        artDirection: isArtDirectionId(dna?.art_direction) ? dna!.art_direction : undefined,
      };
      const prompt = compileCharacterPosePrompt(params);
      const { result, requestId } = await chargedCharacterImage({
        project: a.project,
        actorUserId: a.user.id,
        description: `ảnh gốc của ${character.name}`,
        workflowVersion: "character-origin-v1",
        model: IMAGE_MODEL,
        provider: "google",
        prompt,
        references: [],
        estimate: estimateImageGenerationPrice({ model: IMAGE_MODEL, resolution: "1K", inputImageCount: 0, prompt }),
        requestedOutput: { characterId: character.id, emotion: "neutral" },
        sourceEntity: { type: "character", id: character.id },
        generate: () => generateCharacterPose(params),
      });
      const path = `${a.project.id}/${character.id}/origin-${requestId}.png`;
      const { error: uploadError } = await a.admin.storage
        .from(BUCKET)
        .upload(path, Buffer.from(result.image, "base64"), { contentType: "image/png", cacheControl: "31536000" });
      if (uploadError) throw uploadError;
      const url = a.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error: poseError } = await a.admin
        .from("character_poses")
        .insert({ character_id: character.id, name: "Ảnh gốc", emotion: "neutral", image_url: url });
      if (poseError) throw poseError;
      // Vẽ lại ảnh gốc nghĩa là người dùng chưa ưng gương mặt cũ: thay luôn ảnh đại diện.
      const { error: avatarError } = await a.admin.from("characters").update({ avatar_url: url }).eq("id", character.id);
      if (avatarError) throw avatarError;
      // Ảnh gốc cũ bị loại khỏi danh sách ảnh để meme không lấy nhầm gương mặt cũ
      // làm tham chiếu. Chỉ xoá đúng ảnh do bước này vẽ (tên file "origin-").
      await a.admin
        .from("character_poses")
        .delete()
        .eq("character_id", character.id)
        .like("image_url", "%/origin-%")
        .neq("image_url", url);
      return NextResponse.json({ url });
    }

    if (body.action === "lock") {
      const paths = (body.paths || {}) as Record<string, unknown>;
      const { default: sharp } = await import("sharp");
      const pack = [];
      for (const item of FILM_REFERENCE_VIEWS) {
        const path = paths[item.view];
        if (!ownsPackPath(a.project.id, character.id, path)) continue;
        // Hash và kích thước tính từ chính file trong kho, không tin số client gửi.
        const bytes = await download(path);
        const info = await sharp(bytes).metadata();
        pack.push({
          role: item.role,
          url: a.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
          hash: crypto.createHash("sha256").update(bytes).digest("hex"),
          width: info.width || null,
          height: info.height || null,
        });
      }
      const { data, error } = await a.admin.rpc("lock_film_reference_pack", {
        p_project: a.project.id,
        p_actor: a.user.id,
        p_workspace: a.project.workspace_version,
        p_character: character.id,
        p_images: pack,
        p_profile_type: medium === "photoreal" ? "human" : "mascot",
        p_summary: character.description || character.name,
      });
      if (error) {
        if (error.message.includes("FILM_PACK_INCOMPLETE"))
          throw new FilmError("Bộ ảnh cần ít nhất ảnh cận mặt và ảnh toàn thân.");
        throw error;
      }
      return NextResponse.json({ locked: data });
    }

    if (body.action !== "generate" || !isFilmReferenceView(body.view))
      throw new FilmError("Yêu cầu không hợp lệ.");
    const view = FILM_REFERENCE_VIEWS.find((item) => item.view === body.view)!;
    // Ảnh mặt dựng từ ảnh gốc của nhân vật; thân và lưng dựng từ ảnh mặt vừa tạo
    // để cả bộ là đúng một người. Mọi ảnh đầu vào đọc từ kho của app, không tải
    // URL do client gửi.
    const identity: Array<{ mimeType: string; base64: string }> = [];
    const references: Array<Record<string, string>> = [];
    if (view.view === "face") {
      const { data: poses } = await a.admin
        .from("character_poses")
        .select("image_url")
        .eq("character_id", character.id)
        .order("created_at", { ascending: true })
        .limit(2);
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      // Ảnh gốc bị vẽ lại vẫn còn trong danh sách ảnh; chỉ ảnh gốc đang là ảnh
      // đại diện được dùng, không thì bộ ảnh trộn hai gương mặt.
      const own = [character.avatar_url, ...(poses || []).map((pose) => pose.image_url)]
        .filter((url): url is string => typeof url === "string" && url.includes(marker))
        .filter((url, index, all) => all.indexOf(url) === index && (url === character.avatar_url || !/\/origin-[0-9a-f-]{36}\.png/.test(url)))
        .slice(0, 3);
      if (!own.length) throw new FilmError(`${character.name} chưa có ảnh nào. Tạo một ảnh nhân vật trước.`);
      for (const url of own) {
        const path = decodeURIComponent(url.split(marker)[1].split("?")[0]);
        identity.push({ mimeType: "image/png", base64: (await download(path)).toString("base64") });
        references.push({ url });
      }
    } else {
      if (!ownsPackPath(a.project.id, character.id, body.facePath)) throw new FilmError("Tạo ảnh cận mặt trước.");
      identity.push({ mimeType: "image/png", base64: (await download(body.facePath)).toString("base64") });
      references.push({ path: body.facePath });
    }
    const prompt = filmReferencePrompt(
      view.view,
      { name: character.name, description: character.description || "" },
      medium,
    );
    const { result, requestId } = await chargedCharacterImage({
      project: a.project,
      actorUserId: a.user.id,
      description: `ảnh chuẩn phim của ${character.name}`,
      workflowVersion: "film-pack-v1",
      model: IMAGE_MODEL,
      provider: "google",
      prompt,
      references,
      estimate: estimateImageGenerationPrice({
        model: IMAGE_MODEL,
        resolution: "1K",
        inputImageCount: identity.length,
        prompt,
      }),
      requestedOutput: { view: view.view, aspectRatio: view.aspectRatio, characterId: character.id },
      sourceEntity: { type: "character", id: character.id },
      generate: () => generateFilmReferenceView({ prompt, identityImages: identity, aspectRatio: view.aspectRatio }),
    });
    const path = `${packFolder(a.project.id, character.id)}/${view.view}-${requestId}.png`;
    const { error: uploadError } = await a.admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(result.image, "base64"), { contentType: "image/png", cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    return NextResponse.json({
      view: view.view,
      path,
      url: a.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    });
  } catch (error) {
    if (error instanceof InsufficientPointsError)
      return NextResponse.json({ error: error.message, code: "INSUFFICIENT_POINTS" }, { status: 402 });
    return fail(error);
  }
}
