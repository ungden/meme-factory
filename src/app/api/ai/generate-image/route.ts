import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabase/request-auth";
import {
  compileCharacterPosePrompt,
  compileBackgroundPrompt,
  generateCharacterPose,
  generateBackground,
  IMAGE_MODEL,
  type GeneratedImageResult,
  type GenerateMemeImageParams,
  type GenerateCharacterPoseParams,
  type GenerateBackgroundParams,
} from "@/lib/gemini-image";
import { POINT_LABELS, type PointAction } from "@/lib/point-pricing";
import { spendProjectPoints } from "@/lib/project-points";
import { formatPoints } from "@/lib/format";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { assertPriceCoversCost, getPointCost } from "@/lib/point-pricing.server";
import {
  calculateGoogleImageActualCost,
  estimateImageGenerationPrice,
  type ImagePriceEstimate,
} from "@/lib/ai-pricing";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import {
  calculateOpenAiActualCost,
} from "@/lib/openai-image";
import { planMemeImage, runMemeImage } from "@/lib/meme-image";
import {
  buildBackgroundManifest,
  buildCharacterManifest,
} from "@/lib/continuity/asset-manifest";
import type { GenerationRecipe } from "@/lib/continuity/types";
import {
  decideDrawReplay,
  isDrawRequestId,
  persistDrawnMeme,
  readDrawPrior,
  readDrawSave,
} from "@/lib/meme-draw";

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
  let useOpenAi = false;

  try {
    const { supabase, user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé." },
        { status: 401 }
      );
    }

    actorUserId = user.id;

    const throttle = await checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.generateImage, user.id);
    if (!throttle.allowed)
      return NextResponse.json(
        { error: rateLimitMessage(throttle), code: "RATE_LIMITED" },
        { status: 429, headers: { "retry-after": String(Math.ceil(throttle.resetIn)) } },
      );

    const body = await request.json();
    const { type, project_id } = body;

    if (!type || !["meme", "character", "background"].includes(type)) {
      return NextResponse.json(
        { error: "Không rõ cần vẽ gì. Bạn tải lại trang rồi thử lại nhé." },
        { status: 400 }
      );
    }

    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "Chưa chọn kênh. Bạn tải lại trang rồi thử lại nhé." }, { status: 400 });
    }

    // Verify user can access this project (owner or shared member via RLS)
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, user_id")
      .eq("id", project_id)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy kênh hoặc bạn không còn quyền với kênh này." }, { status: 403 });
    }

    projectId = project_id;

    // ============================================
    // Point System — Atomic Deduct via RPC
    // ============================================
    const action = getPointAction(type);
    // Meme Chỉnh tay gửi kèm mã của lần bấm để gửi lại sau khi rớt mạng không
    // trừ điểm hai lần. Ứng dụng di động và ảnh nhân vật chưa gửi mã này.
    const drawSave = type === "meme" ? readDrawSave(body) : null;
    generationRequestId = type === "meme" && isDrawRequestId(body.request_id) ? body.request_id : crypto.randomUUID();
    if (type === "meme" && generationRequestId === body.request_id) {
      const prior = await readDrawPrior(getSupabaseAdmin(), project_id, generationRequestId);
      const decision = decideDrawReplay(prior);
      if (decision === "replay")
        return NextResponse.json({
          image: "",
          image_url: prior.meme!.image_url,
          meme_id: prior.meme!.id,
          generation_request_id: generationRequestId,
          pointsUsed: 0,
          replayed: true,
        });
      if (decision === "busy")
        return NextResponse.json(
          { error: "Ảnh này vẫn đang vẽ. Lát nữa mở Thư viện là thấy nhé.", code: "DRAW_IN_PROGRESS" },
          { status: 409 },
        );
      if (decision === "used")
        return NextResponse.json(
          { error: "Lần vẽ trước chưa xong. Bạn bấm vẽ lại nhé.", code: "REQUEST_USED" },
          { status: 409 },
        );
    }
    // Price comes from the admin-configured table, falling back to the compiled
    // constants, and is checked against the worst call this action can make before
    // a single point is taken.
    const cost = await getPointCost(action);
    if (cost > 0) await assertPriceCoversCost(action, cost);

    if (cost > 0) {
      const admin = getSupabaseAdmin();
      const spent = await spendProjectPoints(
        async (name, args) => admin.rpc(name, args),
        {
          projectId,
          projectOwnerId: String(project.user_id),
          actorUserId: user.id,
          cost,
          description: `${POINT_LABELS[action]} (-${cost} điểm)`,
          requestId: generationRequestId,
          aiAction: type,
          metadata: { type, project_id: projectId },
          projectName: String(project.name || ""),
        },
      );

      if (!spent.ok && spent.code === "FAILED") {
        throw new Error(`Lỗi trừ points: ${spent.message}`);
      }

      if (!spent.ok) {
        return NextResponse.json(
          {
            error: `Không đủ điểm. ${POINT_LABELS[action]} cần ${formatPoints(cost)}, bạn đang có ${formatPoints(spent.available)}.`,
            code: "INSUFFICIENT_POINTS",
            required: cost,
            current: spent.available,
          },
          { status: 402 }
        );
      }

      deductedCost = cost;
      deductedAction = action;
    }

    // Every billed provider call gets a job row before the call happens, so a
    // crash or provider failure still leaves an auditable record of what was sent.
    const persistGenerationJob = async (
      recipe: GenerationRecipe,
      estimate: ImagePriceEstimate,
      source?: { type: string | null; id: string | null }
    ): Promise<boolean> => {
      const { error: jobInsertError } = await getSupabaseAdmin()
        .from("generation_jobs")
        .insert({
          id: generationRequestId,
          project_id: projectId,
          creation_kind: recipe.creationKind,
          source_entity_type: source?.type ?? null,
          source_entity_id: source?.id ?? null,
          workflow_version: recipe.workflowVersion,
          provider: recipe.provider,
          model: recipe.model,
          continuity_policy: recipe.policy,
          status: "running",
          compiled_prompt: recipe.prompt,
          reference_manifest: recipe.references,
          dropped_references: recipe.droppedReferences,
          manifest_hash: recipe.manifestHash,
          requested_output: recipe.output,
          estimated_points: cost,
          estimated_cost_usd: estimate.providerCostUsd,
          created_by: user.id,
          started_at: new Date().toISOString(),
        });
      if (jobInsertError) {
        // Hai lần gửi cùng mã chạy song song: lần thua không được hoàn điểm,
        // vì khoản trừ (theo mã) thuộc về lần đang vẽ.
        if (jobInsertError.code === "23505") throw new Error("DRAW_IN_PROGRESS");
        // Rollout tolerance: `character_reference` and `background` only became
        // valid creation kinds in 20260818135130. While that migration is still
        // rolling out, keep the paid generation working instead of failing it
        // over bookkeeping. Meme generation predates the constraint change and
        // still fails hard.
        const isPendingCreationKindMigration =
          recipe.creationKind !== "meme" &&
          jobInsertError.message.includes("creation_kind");
        if (isPendingCreationKindMigration) {
          console.error(
            `Generation job persistence skipped for ${recipe.creationKind}; apply migration 20260818135130_extend_generation_job_creation_kinds.sql`
          );
          return false;
        }
        throw new Error(`GENERATION_JOB_PERSIST_FAILED:${jobInsertError.message}`);
      }
      return true;
    };

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
        const plan = planMemeImage(unfilteredParams, body.source_meme_id);
        useOpenAi = plan.useOpenAi;
        generationRecipe = plan.recipe;
        priceEstimate = plan.priceEstimate;
        generationJobPersisted = await persistGenerationJob(generationRecipe, priceEstimate, {
          type: body.source_meme_id ? "meme" : null,
          id: body.source_meme_id || null,
        });
        result = await runMemeImage(plan);
        break;
      }

      case "character": {
        const {
          characterName,
          characterDescription,
          emotion,
          style,
          existingPoseImages,
          character_id,
          layoutGroup,
          subjectSide,
          aspectRatio,
          artDirection,
        } = body;

        if (!characterName || !characterDescription) {
          throw new Error("VALIDATION_CHARACTER_REQUIRED");
        }

        const unfilteredParams: GenerateCharacterPoseParams = {
          characterName,
          characterDescription,
          emotion: emotion || "neutral",
          style,
          existingPoseImages,
          layoutGroup: ["tight_closeup", "medium_portrait", "offset_composition"].includes(layoutGroup)
            ? layoutGroup
            : undefined,
          subjectSide: subjectSide === "left" || subjectSide === "right" ? subjectSide : undefined,
          aspectRatio: ["1:1", "9:16", "16:9", "4:5"].includes(aspectRatio) ? aspectRatio : undefined,
          artDirection: isArtDirectionId(artDirection) ? artDirection : undefined,
        };
        const manifestInput = {
          model: IMAGE_MODEL,
          policy: "balanced" as const,
          characterName,
          characterId: typeof character_id === "string" ? character_id : undefined,
          existingPoseImages: unfilteredParams.existingPoseImages,
        };
        const initialPlan = buildCharacterManifest({ ...manifestInput, prompt: "" });
        const selectedPoseIndexes = new Set(initialPlan.selectedPoseIndexes);
        const providerParams: GenerateCharacterPoseParams = {
          ...unfilteredParams,
          existingPoseImages: unfilteredParams.existingPoseImages?.filter(
            (_: unknown, index: number) => selectedPoseIndexes.has(index)
          ),
        };
        const compiledPrompt = compileCharacterPosePrompt(providerParams);
        const manifestPlan = buildCharacterManifest({ ...manifestInput, prompt: compiledPrompt });

        generationRecipe = manifestPlan.recipe;
        priceEstimate = estimateImageGenerationPrice({
          model: IMAGE_MODEL,
          resolution: "1K",
          inputImageCount: manifestPlan.recipe.references.length,
          prompt: compiledPrompt,
        });
        generationJobPersisted = await persistGenerationJob(generationRecipe, priceEstimate);
        result = await generateCharacterPose(providerParams);
        break;
      }

      case "background": {
        const { description, mood, format } = body;

        if (!description) {
          throw new Error("VALIDATION_BACKGROUND_REQUIRED");
        }

        const providerParams: GenerateBackgroundParams = {
          description,
          mood,
          format: format || "1:1",
        };
        const compiledPrompt = compileBackgroundPrompt(providerParams);
        const manifestPlan = buildBackgroundManifest({
          prompt: compiledPrompt,
          model: IMAGE_MODEL,
          policy: "balanced",
          aspectRatio: providerParams.format,
          description,
        });

        generationRecipe = manifestPlan.recipe;
        priceEstimate = estimateImageGenerationPrice({
          model: IMAGE_MODEL,
          resolution: "2K",
          inputImageCount: 0,
          prompt: compiledPrompt,
        });
        generationJobPersisted = await persistGenerationJob(generationRecipe, priceEstimate);
        result = await generateBackground(providerParams);
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    const actualCostUsd = !priceEstimate
      ? undefined
      : useOpenAi
        ? calculateOpenAiActualCost({
            usage: result.usage
              ? {
                  input_tokens: result.usage.promptTokenCount,
                  output_tokens: result.usage.candidatesTokenCount,
                  input_tokens_details: {
                    text_tokens: result.usage.promptTokensDetails?.find((entry) => entry.modality === "TEXT")?.tokenCount,
                    image_tokens: result.usage.promptTokensDetails?.find((entry) => entry.modality === "IMAGE")?.tokenCount,
                  },
                }
              : undefined,
            fallbackUsd: priceEstimate.providerCostUsd,
          })
        : calculateGoogleImageActualCost({
            model: IMAGE_MODEL,
            usage: result.usage,
            fallback: priceEstimate,
          });

    let savedMeme: { id: string; image_url: string } | null = null;
    if (drawSave && generationRequestId && actorUserId && result.image) {
      try {
        savedMeme = await persistDrawnMeme(getSupabaseAdmin(), {
          projectId: project_id,
          actorUserId,
          requestId: generationRequestId,
          imageBase64: result.image,
          save: drawSave,
        });
      } catch (saveError) {
        // Ảnh đã vẽ và đã tính điểm: vẫn trả về để trình duyệt tự lưu như cũ,
        // không biến lỗi ghi sổ thành một lần vẽ hỏng rồi hoàn điểm.
        console.error("Drawn meme persistence failed:", saveError);
      }
    }

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
      meme_id: savedMeme?.id,
      image_url: savedMeme?.image_url,
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

    if (rawMessage === "DRAW_IN_PROGRESS") {
      return NextResponse.json(
        { error: "Ảnh này vẫn đang vẽ. Lát nữa mở Thư viện là thấy nhé.", code: "DRAW_IN_PROGRESS" },
        { status: 409 },
      );
    }

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
    let refundedPoints = 0;
    if (actorUserId && projectId && deductedCost > 0 && deductedAction) {
      const { error: refundError } = await getSupabaseAdmin().rpc("atomic_refund_project_points", {
        _project_id: projectId,
        _actor_user_id: actorUserId,
        _cost: deductedCost,
        _description: `Hoàn ${deductedCost} điểm vào kênh — ${POINT_LABELS[deductedAction]} chưa thành`,
        _request_id: generationRequestId,
        _ai_action: deductedAction,
        _metadata: {
          reason: "generation_failed",
        },
      });
      if (refundError) {
        console.error("Point refund failed:", refundError.message);
      } else {
        refundedPoints = deductedCost;
      }
    }

    // Sanitize: only return safe, user-facing messages — never leak model names, API keys, or internal details
    const refunded = refundedPoints > 0 ? refundedPoints : undefined;
    let userMessage = "Chưa vẽ được. Bạn thử lại nhé.";

    if (rawMessage.includes("not configured") || rawMessage.includes("AI_KEY_NOT_CONFIGURED")) {
      return NextResponse.json(
        { error: "Chức năng vẽ đang tạm dừng. Bạn quay lại sau nhé.", code: "NOT_CONFIGURED", refundedPoints: refunded },
        { status: 503 }
      );
    }
    if (rawMessage.includes("VALIDATION_HEADLINE_REQUIRED")) {
      return NextResponse.json({ error: "Cần chữ trên ảnh hoặc mô tả cảnh để vẽ meme.", refundedPoints: refunded }, { status: 400 });
    }
    if (rawMessage.includes("VALIDATION_CHARACTER_REQUIRED")) {
      return NextResponse.json({ error: "Cần tên và mô tả nhân vật để vẽ.", refundedPoints: refunded }, { status: 400 });
    }
    if (rawMessage.includes("VALIDATION_BACKGROUND_REQUIRED")) {
      return NextResponse.json({ error: "Cần mô tả cảnh để vẽ nền.", refundedPoints: refunded }, { status: 400 });
    }
    if (rawMessage.includes("Không nhận được kết quả")) {
      userMessage = "Chưa nhận được ảnh. Bạn thử lại nhé.";
    } else if (rawMessage.includes("không tạo được ảnh")) {
      userMessage = "Chưa vẽ được ảnh này. Bạn thử mô tả khác nhé.";
    } else if (rawMessage.includes("Lỗi trừ points")) {
      userMessage = "Chưa trừ được điểm. Bạn thử lại nhé.";
    } else if (rawMessage.includes("SAFETY") || rawMessage.includes("blocked")) {
      userMessage = "Nội dung này bị bộ lọc an toàn chặn. Bạn thử ý tưởng khác nhé.";
    } else if (rawMessage.includes("quota") || rawMessage.includes("rate limit") || rawMessage.includes("429") || rawMessage.includes("RESOURCE_EXHAUSTED")) {
      return NextResponse.json(
        { error: "Đang có quá nhiều người vẽ cùng lúc. Bạn thử lại sau ít phút nhé.", code: "RATE_LIMIT", refundedPoints: refunded },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: userMessage, refundedPoints: refunded }, { status: 500 });
  }
}
