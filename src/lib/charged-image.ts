import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/admin";
import { spendProjectPoints } from "@/lib/project-points";
import { POINT_LABELS } from "@/lib/point-pricing";
import { assertPriceCoversCost, getPointCost } from "@/lib/point-pricing.server";
import type { ImagePriceEstimate } from "@/lib/ai-pricing";

export class InsufficientPointsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Không đủ điểm. Mỗi ảnh cần ${required} điểm, bạn đang có ${available} điểm.`);
  }
}

/**
 * Một lần tạo ảnh nhân vật có tính tiền, theo đúng luật tiền của app: trừ qua
 * RPC có request_id, ghi job trước lời gọi AI để sweeper hoàn nếu tiến trình
 * chết, và hoàn ngay nếu lời gọi lỗi. Mọi chỗ tạo ảnh nhân vật ngoài route
 * Tạo ảnh (ảnh chuẩn phim, trang phục theo tập) đi qua đây thay vì gọi Gemini
 * trần.
 */
export async function chargedCharacterImage<T extends { usage?: unknown }>(input: {
  project: { id: string; user_id: string; name?: string | null };
  actorUserId: string;
  description: string;
  workflowVersion: string;
  model: string;
  provider: "google" | "openai";
  prompt: string;
  references: unknown[];
  estimate: ImagePriceEstimate;
  requestedOutput: Record<string, unknown>;
  sourceEntity?: { type: string; id: string };
  generate: () => Promise<T>;
}): Promise<{ result: T; requestId: string; cost: number }> {
  const admin = getSupabaseAdmin();
  const cost = await getPointCost("character");
  if (cost > 0) await assertPriceCoversCost("character", cost);
  const requestId = crypto.randomUUID();
  if (cost > 0) {
    const spent = await spendProjectPoints(async (name, args) => admin.rpc(name, args), {
      projectId: input.project.id,
      projectOwnerId: String(input.project.user_id),
      actorUserId: input.actorUserId,
      cost,
      description: `${POINT_LABELS.character} — ${input.description} (-${cost} điểm)`,
      requestId,
      aiAction: "character",
      metadata: { type: input.workflowVersion, ...input.requestedOutput },
      projectName: String(input.project.name || ""),
    });
    if (!spent.ok && spent.code === "INSUFFICIENT_POINTS") throw new InsufficientPointsError(cost, spent.available);
    if (!spent.ok) throw new Error("CHARACTER_IMAGE_CHARGE_FAILED");
  }
  try {
    const { error: jobError } = await admin.from("generation_jobs").insert({
      id: requestId,
      project_id: input.project.id,
      creation_kind: "character_reference",
      source_entity_type: input.sourceEntity?.type ?? null,
      source_entity_id: input.sourceEntity?.id ?? null,
      workflow_version: input.workflowVersion,
      provider: input.provider,
      model: input.model,
      status: "running",
      compiled_prompt: input.prompt,
      reference_manifest: input.references,
      manifest_hash: crypto.createHash("sha256").update(input.prompt + JSON.stringify(input.references)).digest("hex"),
      requested_output: input.requestedOutput,
      estimated_points: cost,
      estimated_cost_usd: input.estimate.providerCostUsd,
      created_by: input.actorUserId,
      started_at: new Date().toISOString(),
    });
    if (jobError) throw jobError;
    const result = await input.generate();
    await admin
      .from("generation_jobs")
      .update({ status: "completed", actual_points: cost, usage: result.usage ?? null, completed_at: new Date().toISOString() })
      .eq("id", requestId);
    return { result, requestId, cost };
  } catch (error) {
    if (cost > 0) {
      const { error: refundError } = await admin.rpc("atomic_refund_project_points", {
        _project_id: input.project.id,
        _actor_user_id: input.actorUserId,
        _cost: cost,
        _description: `Hoàn ${cost} điểm — lỗi tạo ảnh nhân vật`,
        _request_id: requestId,
        _ai_action: "character",
        _metadata: { reason: "generation_failed" },
      });
      if (refundError) console.error("Character image refund failed:", refundError.message);
    }
    // Job còn "running" thì sweeper coi là treo và hoàn thêm lần nữa.
    await admin
      .from("generation_jobs")
      .update({ status: "failed", error: { code: "GENERATION_FAILED" }, completed_at: new Date().toISOString() })
      .eq("id", requestId);
    throw error;
  }
}
