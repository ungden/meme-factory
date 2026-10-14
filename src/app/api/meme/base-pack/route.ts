import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { estimateImageGenerationPrice } from "@/lib/ai-pricing";
import { compileCharacterPosePrompt, generateCharacterPose, IMAGE_MODEL, type GenerateCharacterPoseParams } from "@/lib/gemini-image";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import { chargedCharacterImage, InsufficientPointsError } from "@/lib/charged-image";
import { recipeById } from "@/lib/base-pack";
import { stripImageMetadata } from "@/lib/image-metadata";
import { DEFAULT_FRAME } from "@/lib/template-upload";
import { FORMAT_DIMENSIONS, type MemeFormat } from "@/types/database";

export const maxDuration = 60;

const BUCKET = "base-images";
const FORMATS: MemeFormat[] = ["1:1", "4:5", "9:16", "16:9"];
// Phác thảo gửi kèm ảnh đầu tiên; giới hạn để một file lớn không làm nghẽn lời gọi vẽ.
const MAX_SKETCH_BASE64 = 8 * 1024 * 1024;

/**
 * Vẽ một biểu cảm trong bộ ảnh ghép chữ của nhân vật và lưu ngay thành mẫu meme.
 *
 * Trước đây trình hướng dẫn nhận base64 về trình duyệt rồi mới tự lưu: ảnh
 * đầu tiên (đã trả điểm) chỉ được lưu khi người dùng bấm vẽ cả loạt, và đóng tab
 * giữa chừng là mất ảnh đang vẽ. Ở đây ảnh được lưu bên trong bước tính tiền:
 * lưu hỏng thì hoàn điểm như vẽ hỏng.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const a = await access(request, String(body.projectRef || ""));
    const recipe = recipeById(String(body.recipeId || ""));
    if (!recipe) throw new FilmError("Không rõ cần vẽ biểu cảm nào. Bạn tải lại trang nhé.");
    const aspectRatio: MemeFormat = FORMATS.includes(body.aspectRatio) ? body.aspectRatio : "1:1";

    const { data: character } = await a.admin
      .from("characters")
      .select("id,name,description,personality,avatar_url")
      .eq("id", String(body.characterId || ""))
      .eq("project_id", a.project.id)
      .maybeSingle();
    if (!character) throw new FilmError("Không tìm thấy nhân vật này trong kênh.", 404);

    // Ảnh sau bám theo ảnh đầu đã duyệt; đọc nó từ kho của kênh thay vì nhận
    // base64 từ trình duyệt, để mọi ảnh trong bộ cùng một gương mặt đã lưu.
    const references: { base64: string; mimeType: string }[] = [];
    if (typeof body.anchorBaseImageId === "string") {
      const { data: anchor } = await a.admin
        .from("mascot_base_images")
        .select("storage_bucket,storage_path")
        .eq("id", body.anchorBaseImageId)
        .eq("project_id", a.project.id)
        .eq("character_id", character.id)
        .maybeSingle();
      if (!anchor?.storage_path) throw new FilmError("Không tìm thấy ảnh đầu của bộ. Bạn vẽ lại ảnh đầu nhé.", 404);
      const { data } = await a.admin.storage.from(anchor.storage_bucket || BUCKET).download(anchor.storage_path);
      if (!data) throw new FilmError("Chưa đọc được ảnh đầu của bộ. Bạn thử lại nhé.", 503);
      references.push({ mimeType: data.type || "image/png", base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
    } else if (
      body.sketch &&
      typeof body.sketch.base64 === "string" &&
      body.sketch.base64.length <= MAX_SKETCH_BASE64 &&
      /^image\/(png|jpeg|webp)$/.test(String(body.sketch.mimeType))
    ) {
      references.push({ base64: body.sketch.base64, mimeType: body.sketch.mimeType });
    }

    const [{ data: project }, { data: preset }] = await Promise.all([
      a.admin.from("projects").select("style_prompt").eq("id", a.project.id).maybeSingle(),
      a.admin
        .from("layout_presets")
        .select("default_safe_zones,default_text_style,recommended_chars")
        .eq("id", recipe.layoutGroup)
        .maybeSingle(),
    ]);

    const input: GenerateCharacterPoseParams = {
      characterName: character.name,
      characterDescription: [character.description, character.personality].filter(Boolean).join(". ") || character.name,
      emotion: recipe.poseBrief,
      artDirection: isArtDirectionId(body.artDirection) ? body.artDirection : undefined,
      style: project?.style_prompt || undefined,
      existingPoseImages: references.length ? references : undefined,
      layoutGroup: recipe.layoutGroup,
      subjectSide: recipe.subjectSide,
      aspectRatio,
    };
    const prompt = compileCharacterPosePrompt(input);
    // Phần đầu đường dẫn là id người dùng: quyền xoá của kho này khoá theo nó.
    const path = `${a.user.id}/${character.id}/${crypto.randomUUID()}-${recipe.expressionSlug}.png`;
    const dimensions = FORMAT_DIMENSIONS[aspectRatio];
    const safeZones = (preset?.default_safe_zones as Record<string, unknown> | null | undefined)?.[aspectRatio];

    const { result, requestId, cost } = await chargedCharacterImage({
      project: a.project,
      actorUserId: a.user.id,
      description: `biểu cảm ${recipe.label} của ${character.name}`,
      workflowVersion: "meme-base-pack-v1",
      model: IMAGE_MODEL,
      provider: "google",
      prompt,
      references: references.map((_, index) => ({ role: index === 0 && body.anchorBaseImageId ? "anchor" : "sketch" })),
      estimate: estimateImageGenerationPrice({ model: IMAGE_MODEL, resolution: "1K", inputImageCount: references.length, prompt }),
      requestedOutput: { characterId: character.id, recipeId: recipe.id, aspectRatio, path },
      sourceEntity: { type: "character", id: character.id },
      generate: async () => {
        const image = await generateCharacterPose(input);
        const stripped = stripImageMetadata(new Uint8Array(Buffer.from(image.image, "base64")));
        const { error: uploadError } = await a.admin.storage
          .from(BUCKET)
          .upload(path, Buffer.from(stripped.bytes), { contentType: "image/png", upsert: false });
        if (uploadError) throw uploadError;
        const url = a.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const { data: row, error: rowError } = await a.admin
          .from("mascot_base_images")
          .insert({
            project_id: a.project.id,
            character_id: character.id,
            source: "ai_base_pack",
            expression_slug: recipe.expressionSlug,
            expression_label: recipe.label,
            layout_preset_id: recipe.layoutGroup,
            image_url: url,
            storage_bucket: BUCKET,
            storage_path: path,
            aspect_ratio: aspectRatio,
            width: dimensions.width,
            height: dimensions.height,
            source_width: dimensions.width,
            source_height: dimensions.height,
            frame: DEFAULT_FRAME,
            safe_zones: safeZones ?? {},
            safe_zones_source: "layout_default",
            default_text_style: preset?.default_text_style ?? {},
            recommended_chars: preset?.recommended_chars ?? 60,
            // Vẽ sẵn chỗ trống cho chữ nên dùng được ngay.
            status: "ready",
            created_by: a.user.id,
          })
          .select("*")
          .single();
        if (rowError || !row) throw rowError || new Error("BASE_IMAGE_INSERT_FAILED");
        return { usage: image.usage, row };
      },
    });

    await a.admin.from("mascot_base_images").update({ generation_job_id: requestId }).eq("id", result.row.id);
    if (!character.avatar_url) {
      await a.admin.from("characters").update({ avatar_url: result.row.image_url }).eq("id", character.id);
    }
    // Vẽ lại ảnh đầu: ảnh cũ đã trả điểm nên không xoá, chỉ ẩn khỏi danh sách dùng được.
    if (typeof body.replacesBaseImageId === "string") {
      await a.admin
        .from("mascot_base_images")
        .update({ status: "archived" })
        .eq("id", body.replacesBaseImageId)
        .eq("project_id", a.project.id)
        .eq("character_id", character.id)
        .eq("source", "ai_base_pack");
    }
    return NextResponse.json({ baseImage: { ...result.row, generation_job_id: requestId }, pointsUsed: cost });
  } catch (error) {
    if (error instanceof InsufficientPointsError)
      return NextResponse.json(
        { error: error.message, code: "INSUFFICIENT_POINTS", required: error.required, current: error.available },
        { status: 402 },
      );
    return fail(error);
  }
}
