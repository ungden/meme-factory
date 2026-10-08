import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, latestChannelProfile } from "@/lib/short-film/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { spendProjectPoints } from "@/lib/project-points";
import { POINT_LABELS } from "@/lib/point-pricing";
import { assertPriceCoversCost, getPointCost } from "@/lib/point-pricing.server";
import { estimateImageGenerationPrice } from "@/lib/ai-pricing";
import { generateFilmReferenceView, IMAGE_MODEL } from "@/lib/gemini-image";
import {
  FILM_REFERENCE_VIEWS,
  filmMediumFor,
  filmPackReady,
  filmReferencePrompt,
  isFilmReferenceView,
} from "@/lib/short-film/channel-setup";

const BUCKET = "character-poses";

type CharacterRow = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  continuity_asset_id: string | null;
};

async function loadCharacters(a: Awaited<ReturnType<typeof access>>) {
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
        .select("asset_id,version,reference_images(role,image_url)")
        .in("asset_id", assetIds)
        .eq("status", "locked")
        .order("version", { ascending: false })
    : { data: [] };
  return (characters as CharacterRow[]).map((character) => {
    const latest = (versions || []).find((version) => version.asset_id === character.continuity_asset_id);
    const references = (latest?.reference_images || []) as Array<{ role: string; image_url: string }>;
    const artDirection = dna?.find((row) => row.character_id === character.id)?.art_direction || "soft_3d";
    return {
      id: character.id,
      name: character.name,
      description: character.description || "",
      avatarUrl: character.avatar_url,
      artDirection,
      medium: filmMediumFor(artDirection),
      ready: filmPackReady(references.map((reference) => reference.role)),
      references: Object.fromEntries(references.map((reference) => [reference.role, reference.image_url])),
    };
  });
}

/** Trạng thái thiết lập kênh phim: hồ sơ kênh và bộ ảnh chuẩn của từng nhân vật. */
export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    const [profile, characters] = await Promise.all([latestChannelProfile(a), loadCharacters(a)]);
    const roleIds = (profile?.roles || []).map((role: { characterId: string }) => role.characterId);
    const cast = characters.filter((character) => roleIds.includes(character.id));
    return NextResponse.json({
      profile,
      characters,
      pointsPerImage: await getPointCost("character"),
      owner: a.project.user_id === a.user.id,
      ready: Boolean(profile) && cast.length > 0 && cast.every((character) => character.ready),
    });
  } catch (error) {
    return fail(error);
  }
}

async function imageInput(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new FilmError("Không đọc được ảnh gốc của nhân vật.");
  return {
    mimeType: response.headers.get("content-type") || "image/png",
    base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
  };
}

/** Ảnh trong bộ phải là ảnh vừa tạo cho đúng nhân vật này, không phải URL tuỳ ý. */
function ownsPackUrl(projectId: string, characterId: string, url: unknown): url is string {
  return (
    typeof url === "string" &&
    /^https:\/\//i.test(url) &&
    url.includes(`/${BUCKET}/${projectId}/film-pack/${characterId}/`)
  );
}

export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let refund: null | (() => Promise<void>) = null;
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

    if (body.action === "lock") {
      const images = Array.isArray(body.images) ? body.images : [];
      const pack = FILM_REFERENCE_VIEWS.flatMap((item) => {
        const image = images.find((candidate: { view?: string }) => candidate?.view === item.view);
        if (!image || !ownsPackUrl(a.project.id, character.id, image.url)) return [];
        return [{
          role: item.role,
          url: image.url,
          hash: String(image.hash || "").slice(0, 128),
          width: Number(image.width) || null,
          height: Number(image.height) || null,
        }];
      });
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
    // để cả bộ là đúng một người.
    let sources: string[];
    if (view.view === "face") {
      const { data: poses } = await a.admin
        .from("character_poses")
        .select("image_url")
        .eq("character_id", character.id)
        .order("created_at", { ascending: true })
        .limit(2);
      sources = [character.avatar_url, ...(poses || []).map((pose) => pose.image_url)].filter(
        (url): url is string => typeof url === "string" && /^https:\/\//i.test(url),
      );
      if (!sources.length)
        throw new FilmError(`${character.name} chưa có ảnh nào. Tạo một ảnh nhân vật trước.`);
    } else {
      if (!ownsPackUrl(a.project.id, character.id, body.faceUrl))
        throw new FilmError("Tạo ảnh cận mặt trước.");
      sources = [body.faceUrl, character.avatar_url].filter(
        (url): url is string => typeof url === "string" && /^https:\/\//i.test(url),
      );
    }
    const prompt = filmReferencePrompt(
      view.view,
      { name: character.name, description: character.description || "" },
      medium,
    );

    const cost = await getPointCost("character");
    if (cost > 0) await assertPriceCoversCost("character", cost);
    const requestId = crypto.randomUUID();
    const admin = getSupabaseAdmin();
    if (cost > 0) {
      const spent = await spendProjectPoints(async (name, args) => admin.rpc(name, args), {
        projectId: a.project.id,
        projectOwnerId: String(a.project.user_id),
        actorUserId: a.user.id,
        cost,
        description: `${POINT_LABELS.character} cho phim (-${cost} điểm)`,
        requestId,
        aiAction: "character",
        metadata: { type: "film_reference", view: view.view, character_id: character.id },
        projectName: String(a.project.name || ""),
      });
      if (!spent.ok && spent.code === "FAILED") throw new Error(spent.message);
      if (!spent.ok)
        return NextResponse.json(
          {
            error: `Không đủ điểm. Mỗi ảnh chuẩn cần ${cost} điểm, bạn đang có ${spent.available} điểm.`,
            code: "INSUFFICIENT_POINTS",
          },
          { status: 402 },
        );
      refund = async () => {
        const { error } = await admin.rpc("atomic_refund_project_points", {
          _project_id: a.project.id,
          _actor_user_id: a.user.id,
          _cost: cost,
          _description: `Hoàn ${cost} điểm — lỗi tạo ảnh chuẩn phim`,
          _request_id: requestId,
          _ai_action: "character",
          _metadata: { reason: "generation_failed" },
        });
        if (error) console.error("Film reference refund failed:", error.message);
        // Job còn "running" thì sweeper sẽ coi là treo và hoàn thêm một lần nữa.
        await admin
          .from("generation_jobs")
          .update({
            status: "failed",
            error: { code: "GENERATION_FAILED" },
            completed_at: new Date().toISOString(),
          })
          .eq("id", requestId);
      };
    }
    const estimate = estimateImageGenerationPrice({
      model: IMAGE_MODEL,
      resolution: "1K",
      inputImageCount: sources.length,
      prompt,
    });
    // Bản ghi job có trước lời gọi AI: tiến trình chết giữa chừng thì sweeper
    // thấy job treo và hoàn điểm.
    const { error: jobError } = await admin.from("generation_jobs").insert({
      id: requestId,
      project_id: a.project.id,
      creation_kind: "character_reference",
      source_entity_type: "character",
      source_entity_id: character.id,
      workflow_version: "film-pack-v1",
      provider: "google",
      model: IMAGE_MODEL,
      status: "running",
      compiled_prompt: prompt,
      reference_manifest: sources.map((url) => ({ url })),
      manifest_hash: crypto.createHash("sha256").update(prompt + sources.join("|")).digest("hex"),
      requested_output: { view: view.view, aspectRatio: view.aspectRatio },
      estimated_points: cost,
      estimated_cost_usd: estimate.providerCostUsd,
      created_by: a.user.id,
      started_at: new Date().toISOString(),
    });
    if (jobError) throw jobError;

    const generated = await generateFilmReferenceView({
      prompt,
      identityImages: await Promise.all(sources.slice(0, 3).map(imageInput)),
      aspectRatio: view.aspectRatio,
    });
    const bytes = Buffer.from(generated.image, "base64");
    const { default: sharp } = await import("sharp");
    const info = await sharp(bytes).metadata();
    const path = `${a.project.id}/film-pack/${character.id}/${view.view}-${requestId}.png`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await admin
      .from("generation_jobs")
      .update({ status: "completed", actual_points: cost, usage: generated.usage ?? null, completed_at: new Date().toISOString() })
      .eq("id", requestId);
    refund = null;
    return NextResponse.json({
      view: view.view,
      url,
      hash: crypto.createHash("sha256").update(bytes).digest("hex"),
      width: info.width,
      height: info.height,
    });
  } catch (error) {
    if (refund) await refund();
    return fail(error);
  }
}
