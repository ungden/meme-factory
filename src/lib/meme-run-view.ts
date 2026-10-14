/**
 * Phần thuần của thẻ "Meme gần đây" ở luồng AIDA làm: đọc trạng thái lượt,
 * nhận ra lượt hỏng vì hết điểm, và điền lại ô nhập cho "Làm bài tương tự".
 */

export type MemeRunCard = {
  id: string;
  source: "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "failed";
  phase: string;
  error: string | null;
  intent?: string | null;
  options?: { format?: string } | null;
  created_at: string;
  /** Số điểm đã hoàn cho lần thử cuối, khi lượt hỏng sau lúc trừ điểm. */
  refunded_points?: number | null;
  memes: {
    id: string;
    image_url: string | null;
    generated_content: { headline?: string; caption?: string; hashtags?: string[] } | null;
  } | null;
};

export const MEME_PHASE_LABEL: Record<string, string> = {
  queued: "Đang chờ tới lượt",
  copy: "Đang nghĩ ý tưởng và viết chữ",
  charge: "Đang chuẩn bị vẽ",
  image: "Đang vẽ ảnh",
};

export function memeRunPhaseLabel(phase: string) {
  return MEME_PHASE_LABEL[phase] || "Đang làm meme";
}

/**
 * Lượt hỏng vì hết điểm. Câu lỗi do `meme-production.ts` viết và chuông thông
 * báo cũng dò theo nó, nên đọc số từ câu thay vì đổi câu.
 */
export function memeRunShortfall(error: string | null | undefined): { required: number | null; current: number | null } | null {
  if (!error || !error.toLocaleLowerCase("vi").includes("không đủ điểm")) return null;
  const numbers = [...error.matchAll(/(\d[\d.]*)\s*điểm/g)].map((match) => Number(match[1].replace(/\./g, "")));
  return { required: numbers[0] ?? null, current: numbers[1] ?? null };
}

/** Lượt hỏng đáng nhắc: trong 24 giờ qua, chưa được thử lại từ trang này. */
export function recentFailedRuns<T extends Pick<MemeRunCard, "id" | "status" | "created_at">>(
  runs: T[],
  retried: ReadonlySet<string>,
  now = Date.now(),
): T[] {
  return runs
    .filter((run) => run.status === "failed" && !retried.has(run.id))
    .filter((run) => now - new Date(run.created_at).getTime() < 24 * 60 * 60 * 1000)
    .slice(0, 3);
}

const FORMATS = ["1:1", "4:5", "9:16", "16:9"];

/**
 * "Làm bài tương tự": giữ ý tưởng và khung của lượt cũ. Lượt để AIDA tự nghĩ
 * ý thì không có ý tưởng để giữ, nên lấy chữ trên ảnh làm mẫu — nếu điền lại ô
 * trống, lần sau ra một meme chẳng liên quan.
 */
export function similarMemeDraft(run: Pick<MemeRunCard, "intent" | "options" | "memes">): { idea: string; format: string } {
  const format = FORMATS.includes(String(run.options?.format)) ? String(run.options!.format) : "";
  const intent = (run.intent || "").trim();
  if (intent) return { idea: intent, format };
  const headline = run.memes?.generated_content?.headline?.trim();
  return { idea: headline ? `Cùng kiểu với meme “${headline}”, nhưng tình huống khác.` : "", format };
}

/** Giá luồng AIDA làm: mỗi meme một lần vẽ. */
export function quickMemeCost(unitPoints: number, count: number) {
  return unitPoints * Math.min(4, Math.max(1, Math.floor(count) || 1));
}
