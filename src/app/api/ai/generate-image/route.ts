import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabase/request-auth";
import {
  compileMemeImagePrompt,
  generateMemeImage,
  generateCharacterPose,
  generateBackground,
  IMAGE_MODEL,
  type GeneratedImageResult,
  type GenerateMemeImageParams,
} from "@/lib/gemini-image";
import { POINT_COSTS, POINT_LABELS, type PointAction } from "@/lib/point-pricing";
import {
  calculateGoogleImageActualCost,
  estimateImageGenerationPrice,
  type ImagePriceEstimate,
} from "@/lib/ai-pricing";
import { buildMemeManifest } from "@/lib/continuity/meme-manifest";
import type { GenerationRecipe } from "@/lib/continuity/types";

let supabaseAdminClient: SupabaseClient | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabaseAdminClient;
}

export const maxDuration = 60;

function getPointAction(type: string): PointAction {
  switch (type) {
    case "character": return "character";
    case "background": return "background";
    case "meme": return "meme";
    default: return "meme";
  }
}

export async function POST(request: NextRequest) {
  let actorUserId: string | null = null;
  let projectId: string | null = null;
  let generationRequestId: string | null = null;
  let generationJobPersisted = false;
  let generationRecipe: GenerationRecipe | null = null;
  let priceEstimate: ImagePriceEstimate | null = null;
  let deductedCost = 0;
  let deductedAction: PointAction | null = null;

  try {
    const { supabase, user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để sử dụng tính năng này" },
        { status: 401 }
      );
    }

    actorUserId = user.id;

    const body = await request.json();
    const { type, project_id } = body;

    if (!type || !["meme", "character", "background"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'meme', 'character', or 'background'." },
        { status: 400 }
      );
    }

    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "Thiếu project_id" }, { status: 400 });
    }

    // Verify user can access this project (owner or shared member via RLS)
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ error: "Project không hợp lệ hoặc bạn không có quyền" }, { status: 403 });
    }

    projectId = project_id;

    // ============================================
    // Point System — Atomic Deduct via RPC
    // ============================================
    const action = getPointAction(type);
    generationRequestId = crypto.randomUUID();
    const cost = POINT_COSTS[action];

    if (cost > 0) {
      const { data: deductResult, error: deductRpcErr } = await getSupabaseAdmin().rpc("atomic_deduct_project_points", {
        _project_id: projectId,
        _actor_user_id: user.id,
        _cost: cost,
        _description: `${POINT_LABELS[action]} (-${cost} points) từ ví dự án`,
        _request_id: generationRequestId,
        _ai_action: type,
        _metadata: {
          type,
          project_id: projectId,
        },
      });

      if (deductRpcErr) {
        throw new Error(`Lỗi trừ points: ${deductRpcErr.message}`);
      }

      if (!deductResult?.success) {
        const currentPoints = deductResult?.points ?? 0;
        return NextResponse.json(
          {
            error: `Ví dự án không đủ points. ${POINT_LABELS[action]} cần ${cost} points, hiện có ${currentPoints} points.`,
            code: "INSUFFICIENT_POINTS",
            required: cost,
            current: currentPoints,
          },
          { status: 402 }
        );
      }

      deductedCost = cost;
      deductedAction = action;
    }

    let result: GeneratedImageResult;

    switch (type) {
      case "meme": {
        const {
          headline, subtext, tone, textPosition, characters: chars,
          format, style, backgroundDescription, referenceImages, customPrompt, watermark,
        } = body;

        if (!headline && !customPrompt) {
          throw new Error("VALIDATION_HEADLINE_REQUIRED");
        }

        const unfilteredParams: GenerateMemeImageParams = {
          headline, subtext, tone: tone || "hài hước",
          textPosition: textPosition || "top", characters: chars || [],
          format: format || "1:1", style, backgroundDescription, referenceImages, customPrompt, watermark,
        };
        const initialPlan = buildMemeManifest({
          prompt: "",
          model: IMAGE_MODEL,
          policy: "balanced",
          aspectRatio: unfilteredParams.format,
          characters: unfilteredParams.characters,
          referenceImages: unfilteredParams.referenceImages,
          watermark: unfilteredParams.watermark,
          sourceMemeId: body.source_meme_id,
        });
        const selectedCharacterIndexes = new Set(initialPlan.selectedCharacterIndexes);
        const selectedContextIndexes = new Set(initialPlan.selectedContextIndexes);
        const providerParams: GenerateMemeImageParams = {
          ...unfilteredParams,
          characters: unfilteredParams.characters.map((character, index) =>
            character.poseImageBase64 && !selectedCharacterIndexes.has(index)
              ? { ...character, poseImageBase64: undefined, poseMimeType: undefined }
              : character
          ),
          referenceImages: unfilteredParams.referenceImages?.filter((_, index) =>
            selectedContextIndexes.has(index)
          ),
          watermark: unfilteredParams.watermark
            ? {
                ...unfilteredParams.watermark,
                logoBase64: initialPlan.includeWatermarkLogo
                  ? unfilteredParams.watermark.logoBase64
                  : undefined,
                logoMimeType: initialPlan.includeWatermarkLogo
                  ? unfilteredParams.watermark.logoMimeType
                  : undefined,
              }
            : undefined,
        };
        const compiledPrompt = compileMemeImagePrompt(providerParams);
        const manifestPlan = buildMemeManifest({
          prompt: compiledPrompt,
          model: IMAGE_MODEL,
          policy: "balanced",
          aspectRatio: unfilteredParams.format,
          characters: unfilteredParams.characters,
          referenceImages: unfilteredParams.referenceImages,
          watermark: unfilteredParams.watermark,
          sourceMemeId: body.source_meme_id,
        });
        generationRecipe = manifestPlan.recipe;
        priceEstimate = estimateImageGenerationPrice({
          model: IMAGE_MODEL,
          resolution: "1K",
          inputImageCount: manifestPlan.recipe.references.length,
          prompt: compiledPrompt,
        });

        const { error: jobInsertError } = await getSupabaseAdmin()
          .from("generation_jobs")
          .insert({
            id: generationRequestId,
            project_id: projectId,
            creation_kind: "meme",
            source_entity_type: body.source_meme_id ? "meme" : null,
            source_entity_id: body.source_meme_id || null,
            workflow_version: manifestPlan.recipe.workflowVersion,
            provider: manifestPlan.recipe.provider,
            model: manifestPlan.recipe.model,
            continuity_policy: manifestPlan.recipe.policy,
            status: "running",
            compiled_prompt: manifestPlan.recipe.prompt,
            reference_manifest: manifestPlan.recipe.references,
            dropped_references: manifestPlan.recipe.droppedReferences,
            manifest_hash: manifestPlan.recipe.manifestHash,
            requested_output: manifestPlan.recipe.output,
            estimated_points: cost,
            estimated_cost_usd: priceEstimate.providerCostUsd,
            created_by: user.id,
            started_at: new Date().toISOString(),
          });
        if (jobInsertError) {
          throw new Error(`GENERATION_JOB_PERSIST_FAILED:${jobInsertError.message}`);
        }
        generationJobPersisted = true;
        result = await generateMemeImage(providerParams);
        break;
      }

      case "character": {
        const { characterName, characterDescription, emotion, style, existingPoseImages } = body;

        if (!characterName || !characterDescription) {
          throw new Error("VALIDATION_CHARACTER_REQUIRED");
        }

        result = await generateCharacterPose({
          characterName,
          characterDescription,
          emotion: emotion || "neutral",
          style,
          existingPoseImages,
        });
        break;
      }

      case "background": {
        const { description, mood, format } = body;

        if (!description) {
          throw new Error("VALIDATION_BACKGROUND_REQUIRED");
        }

        result = await generateBackground({
          description, mood, format: format || "1:1",
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    const actualCostUsd = priceEstimate
      ? calculateGoogleImageActualCost({
          model: IMAGE_MODEL,
          usage: result.usage,
          fallback: priceEstimate,
        })
      : undefined;

    if (generationJobPersisted && generationRequestId) {
      const { error: completeJobError } = await getSupabaseAdmin()
        .from("generation_jobs")
        .update({
          status: "completed",
          actual_points: deductedCost,
          actual_cost_usd: actualCostUsd,
          usage: result.usage ?? null,
          provider_response: {
            image_count: 1,
            has_text_response: Boolean(result.text),
            pricing: priceEstimate ? {
              effective_date: priceEstimate.effectiveDate,
              provider_cost_usd: actualCostUsd ?? priceEstimate.providerCostUsd,
              customer_points: deductedCost,
              markup_multiplier: priceEstimate.markupMultiplier,
              source_url: priceEstimate.sourceUrl,
            } : undefined,
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationRequestId);
      if (completeJobError) {
        // The provider output already exists and was billed. Do not turn a
        // bookkeeping failure into a user-visible generation failure/refund.
        console.error("Generation job completion persistence failed:", completeJobError);
      }
    }

    return NextResponse.json({
      image: result.image,
      text: result.text,
      generation_request_id: generationRequestId,
      generation_job_id: generationJobPersisted ? generationRequestId : undefined,
      reference_manifest: generationRecipe
        ? {
            selected: generationRecipe.references.length,
            dropped: generationRecipe.droppedReferences.map((reference) => ({
              imageId: reference.imageId,
              role: reference.role,
              reason: reference.reason,
            })),
            manifestHash: generationRecipe.manifestHash,
          }
        : undefined,
      pointsUsed: cost,
      pricing: priceEstimate ? {
        providerCostUsd: actualCostUsd ?? priceEstimate.providerCostUsd,
        customerPoints: cost,
        markupMultiplier: priceEstimate.markupMultiplier,
        effectiveDate: priceEstimate.effectiveDate,
      } : undefined,
    });
  } catch (error) {
    console.error("Image generation error:", error);

    const rawMessage =
      error instanceof Error ? error.message : "";

    if (generationJobPersisted && generationRequestId) {
      await getSupabaseAdmin()
        .from("generation_jobs")
        .update({
          status: "failed",
          error: { code: "GENERATION_FAILED", message: rawMessage.slice(0, 500) },
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationRequestId);
    }

    // Guarantee: if points were deducted and request fails, refund immediately
    if (actorUserId && projectId && deductedCost > 0 && deductedAction) {
      const { error: refundError } = await getSupabaseAdmin().rpc("atomic_refund_project_points", {
        _project_id: projectId,
        _actor_user_id: actorUserId,
        _cost: deductedCost,
        _description: `Hoàn ${deductedCost} pts vào ví dự án — lỗi tạo ${POINT_LABELS[deductedAction]}`,
        _request_id: generationRequestId,
        _ai_action: deductedAction,
        _metadata: {
          reason: "generation_failed",
        },
      });
      if (refundError) {
        console.error("Point refund failed:", refundError.message);
      }
    }

    // Sanitize: only return safe, user-facing messages — never leak model names, API keys, or internal details
    let userMessage = "Không thể tạo ảnh. Vui lòng thử lại.";

    if (rawMessage.includes("not configured") || rawMessage.includes("AI_KEY_NOT_CONFIGURED")) {
      return NextResponse.json(
        { error: "Hệ thống AI chưa được cấu hình. Vui lòng liên hệ admin.", code: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    if (rawMessage.includes("VALIDATION_HEADLINE_REQUIRED")) {
      return NextResponse.json({ error: "Cần headline hoặc prompt mô tả để tạo meme" }, { status: 400 });
    }
    if (rawMessage.includes("VALIDATION_CHARACTER_REQUIRED")) {
      return NextResponse.json({ error: "characterName và characterDescription là bắt buộc" }, { status: 400 });
    }
    if (rawMessage.includes("VALIDATION_BACKGROUND_REQUIRED")) {
      return NextResponse.json({ error: "description is required for background generation" }, { status: 400 });
    }
    if (rawMessage.includes("Không nhận được kết quả")) {
      userMessage = "AI không trả về kết quả. Vui lòng thử lại.";
    } else if (rawMessage.includes("không tạo được ảnh")) {
      userMessage = "AI không tạo được ảnh. Vui lòng thử mô tả khác.";
    } else if (rawMessage.includes("Không đủ points") || rawMessage.includes("INSUFFICIENT_POINTS")) {
      userMessage = rawMessage; // Point messages are safe to show
    } else if (rawMessage.includes("Lỗi trừ points")) {
      userMessage = "Lỗi hệ thống khi xử lý points. Vui lòng thử lại.";
    } else if (rawMessage.includes("SAFETY") || rawMessage.includes("blocked")) {
      userMessage = "Nội dung bị từ chối bởi bộ lọc an toàn. Vui lòng thử ý tưởng khác.";
    } else if (rawMessage.includes("quota") || rawMessage.includes("rate limit") || rawMessage.includes("429") || rawMessage.includes("RESOURCE_EXHAUSTED")) {
      return NextResponse.json(
        { error: "Hệ thống AI đang quá tải (hết quota ngày). Vui lòng thử lại sau vài giờ.", code: "RATE_LIMIT" },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
