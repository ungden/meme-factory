import type { SupabaseClient } from "@supabase/supabase-js";

export type ExtraDrawPrior = {
  pose: Record<string, unknown> | null;
  job: { status: string } | null;
  payment: { created_at: string } | null;
};

// Giữa lúc trừ điểm và lúc ghi job chỉ vài trăm mili giây. Quá mốc này mà vẫn
// chưa có job thì lần gọi kia đã chết, không còn "đang vẽ" nữa.
const CHARGE_TO_JOB_GRACE_MS = 2 * 60 * 1000;

/**
 * Trình duyệt gửi lại cùng mã khi bấm hai lần hoặc mạng rớt giữa chừng:
 * - replay: ảnh đã vẽ và lưu, trả lại đúng ảnh đó, không trừ thêm;
 * - busy: lần gọi kia đang vẽ, báo chờ thay vì vẽ song song;
 * - used: lần kia đã kết thúc mà không có ảnh (đã hoặc sẽ được hoàn). Không
 *   dùng lại mã: RPC trừ điểm coi mã cũ là "đã trừ", vẽ tiếp sẽ thành miễn phí.
 */
export function decideExtraDrawReplay(prior: ExtraDrawPrior, now = Date.now()): "replay" | "busy" | "used" | "fresh" {
  if (prior.pose) return "replay";
  if (prior.job) return prior.job.status === "running" || prior.job.status === "queued" ? "busy" : "used";
  if (prior.payment) return now - Date.parse(prior.payment.created_at) < CHARGE_TO_JOB_GRACE_MS ? "busy" : "used";
  return "fresh";
}

/** Đường dẫn cố định theo mã: lần gọi lại tìm đúng ảnh đã lưu của lần trước. */
export function extraDrawPath(projectId: string, characterId: string, requestId: string) {
  return `${projectId}/${characterId}/extra-${requestId}.png`;
}

export async function readExtraDrawPrior(
  admin: SupabaseClient,
  input: { characterId: string; imageUrl: string; requestId: string },
): Promise<ExtraDrawPrior> {
  // Job và giao dịch không lọc theo kênh: mã đã dùng ở bất kỳ đâu cũng không
  // được dùng lại, kẻo RPC trừ điểm coi là "đã trừ" và vẽ không mất điểm.
  const [pose, job, payment] = await Promise.all([
    admin
      .from("character_poses")
      .select("*")
      .eq("character_id", input.characterId)
      .eq("image_url", input.imageUrl)
      .maybeSingle(),
    admin.from("generation_jobs").select("status").eq("id", input.requestId).maybeSingle(),
    admin
      .from("project_transactions")
      .select("created_at")
      .eq("request_id", input.requestId)
      .eq("type", "payment")
      .maybeSingle(),
  ]);
  return {
    pose: (pose.data as ExtraDrawPrior["pose"]) ?? null,
    job: (job.data as ExtraDrawPrior["job"]) ?? null,
    payment: (payment.data as ExtraDrawPrior["payment"]) ?? null,
  };
}
