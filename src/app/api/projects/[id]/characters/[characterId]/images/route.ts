import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { estimateImageGenerationPrice } from "@/lib/ai-pricing";
import { compileCharacterPosePrompt, generateCharacterPose, IMAGE_MODEL, type GenerateCharacterPoseParams } from "@/lib/gemini-image";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import { chargedCharacterImage, DuplicateRequestError, InsufficientPointsError } from "@/lib/charged-image";
import { isDrawRequestId } from "@/lib/meme-draw";
import { decideExtraDrawReplay, extraDrawPath, readExtraDrawPrior } from "./replay";

const BUCKET = "character-poses";
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

const busy = () =>
  NextResponse.json(
    { error: "Ảnh này vẫn đang vẽ. Lát nữa tải lại trang là thấy nhé.", code: "DRAW_IN_PROGRESS" },
    { status: 409 },
  );

/**
 * Vẽ thêm một ảnh cho nhân vật và lưu ngay vào kho của nhân vật.
 *
 * Trước đây trang nhân vật gọi route Tạo ảnh, nhận ảnh base64 về trình duyệt,
 * rồi chờ người dùng bấm "Lưu" mới đưa lên kho. Điểm đã trừ lúc vẽ xong, nên
 * đóng tab hay quên bấm lưu là mất ảnh đã trả tiền. Ở đây ảnh được lưu bên
 * trong bước tính tiền: lưu hỏng thì hoàn điểm như vẽ hỏng.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  try {
    const { id, characterId } = await params;
    const a = await access(request, id);
    const body = await request.json().catch(() => ({}));
    const note = String(body?.note || "").replace(/\s+/g, " ").trim().slice(0, 300);
    const requestId = isDrawRequestId(body?.request_id) ? body.request_id : null;

    const { data: character } = await a.admin
      .from("characters")
      .select("id,name,description,personality,avatar_url")
      .eq("id", characterId)
      .eq("project_id", a.project.id)
      .maybeSingle();
    if (!character) throw new FilmError("Không tìm thấy nhân vật này trong kênh.", 404);
    const path = extraDrawPath(a.project.id, character.id, requestId ?? crypto.randomUUID());

    if (requestId) {
      const prior = await readExtraDrawPrior(a.admin, {
        characterId: character.id,
        imageUrl: a.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        requestId,
      });
      const decision = decideExtraDrawReplay(prior);
      if (decision === "replay") return NextResponse.json({ pose: prior.pose, pointsUsed: 0, replayed: true });
      if (decision === "busy") return busy();
      if (decision === "used")
        return NextResponse.json(
          { error: "Lần vẽ trước đã dừng. Bạn bấm Thử lại để vẽ lần mới nhé.", code: "REQUEST_USED" },
          { status: 409 },
        );
    }

    const { data: dna } = await a.admin
      .from("character_dna")
      .select("art_direction,summary")
      .eq("character_id", character.id)
      .maybeSingle();

    // Ảnh đại diện là gương mặt chuẩn của nhân vật; chỉ đọc từ kho của app,
    // không tải URL lạ.
    const identity: Array<{ mimeType: string; base64: string }> = [];
    const avatar = typeof character.avatar_url === "string" ? character.avatar_url : "";
    if (avatar.includes(PUBLIC_MARKER)) {
      const avatarPath = decodeURIComponent(avatar.split(PUBLIC_MARKER)[1].split("?")[0]);
      const { data } = await a.admin.storage.from(BUCKET).download(avatarPath);
      if (data) identity.push({ mimeType: data.type || "image/png", base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
    }

    const description = [character.description, dna?.summary, character.personality && `Tính cách: ${character.personality}`]
      .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
      .join(". ");
    const input: GenerateCharacterPoseParams = {
      characterName: character.name,
      characterDescription: description || character.name,
      emotion: note || "neutral",
      artDirection: isArtDirectionId(dna?.art_direction) ? dna!.art_direction : undefined,
      existingPoseImages: identity.length ? identity : undefined,
    };
    const prompt = compileCharacterPosePrompt(input);
    const { result, cost } = await chargedCharacterImage({
      project: a.project,
      actorUserId: a.user.id,
      description: `ảnh thêm của ${character.name}`,
      workflowVersion: "character-extra-v1",
      model: IMAGE_MODEL,
      provider: "google",
      prompt,
      references: avatar ? [{ url: avatar }] : [],
      estimate: estimateImageGenerationPrice({ model: IMAGE_MODEL, resolution: "1K", inputImageCount: identity.length, prompt }),
      requestedOutput: { characterId: character.id, note, path },
      sourceEntity: { type: "character", id: character.id },
      requestId: requestId ?? undefined,
      generate: async () => {
        const image = await generateCharacterPose(input);
        const { error: uploadError } = await a.admin.storage
          .from(BUCKET)
          .upload(path, Buffer.from(image.image, "base64"), { contentType: "image/png", cacheControl: "31536000" });
        if (uploadError) throw uploadError;
        const url = a.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const { data: pose, error: poseError } = await a.admin
          .from("character_poses")
          .insert({
            character_id: character.id,
            name: note ? note.slice(0, 60) : "Ảnh vẽ thêm",
            emotion: "neutral",
            description: note || null,
            image_url: url,
          })
          .select("*")
          .single();
        if (poseError || !pose) throw poseError || new Error("CHARACTER_POSE_INSERT_FAILED");
        return { usage: image.usage, pose };
      },
    });

    if (!character.avatar_url) {
      await a.admin.from("characters").update({ avatar_url: result.pose.image_url }).eq("id", character.id);
    }
    return NextResponse.json({ pose: result.pose, pointsUsed: cost });
  } catch (error) {
    if (error instanceof DuplicateRequestError) return busy();
    if (error instanceof InsufficientPointsError)
      return NextResponse.json(
        { error: error.message, code: "INSUFFICIENT_POINTS", required: error.required, current: error.available },
        { status: 402 },
      );
    return fail(error);
  }
}
