/**
 * Số điểm đã hoàn cho một bước phim hỏng, đọc lại đúng điều kiện của
 * `settle_film_failures()` (migration 20260908115016): bước đã được quyết toán,
 * có thu điểm, và chưa gửi đi hoặc bên làm video đã báo hỏng hẳn. Bước đang gửi
 * dở thì chưa hoàn, vì có thể vẫn ra kết quả và bị tính tiền.
 */
export function taskRefundedPoints(task: {
  status: string;
  points?: number | null;
  checkpoint?: Record<string, unknown> | null;
}): number {
  if (!["failed", "cancelled"].includes(task.status)) return 0;
  const checkpoint = task.checkpoint || {};
  if (checkpoint.settled !== true) return 0;
  const points = Number(task.points || 0);
  if (!(points > 0)) return 0;
  const submitting = checkpoint.submitting === true || checkpoint.submitting === "true";
  const definitive = checkpoint.definitiveFailure === true || checkpoint.definitiveFailure === "true";
  return !submitting || definitive ? points : 0;
}
