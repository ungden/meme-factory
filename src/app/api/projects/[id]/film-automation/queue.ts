/**
 * Hàng chờ của lịch "Tự làm mỗi ngày": các tập chủ kênh muốn lịch làm trước
 * khi tự nghĩ ý mới. Lượt chạy hằng ngày (schedule_due_film_automations) chỉ
 * nhận kịch bản cùng kênh, cùng workspace và chưa xong/duyệt/huỷ, nên ở đây
 * lọc theo đúng các điều kiện đó để thứ người dùng thấy khớp thứ máy sẽ làm.
 */
export const QUEUE_LIMIT = 24;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE_STATUSES = new Set(["completed", "approved", "cancelled"]);

export type QueuePlanRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  archived_at?: string | null;
  audio_mode?: string | null;
  video_model?: string | null;
};

/** null khi người gửi không kèm hàng chờ: khi đó máy chủ giữ hàng chờ đã lưu. */
export function parseQueuedPlanIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((x): x is string => typeof x === "string"))];
}

/** Chuỗi không phải uuid làm truy vấn `in` của Postgres lỗi 500, nên bỏ trước. */
export function queryableIds(ids: string[]) {
  return ids.filter((id) => UUID.test(id));
}

export function planIsQueueable(row: QueuePlanRow) {
  return !row.archived_at && !DONE_STATUSES.has(String(row.status || "draft"));
}

/**
 * `rows` là kết quả truy vấn đã giới hạn trong kênh và workspace hiện tại, nên
 * id không có trong `rows` là id của kênh khác (hoặc workspace cũ).
 *
 * `strict` cho dữ liệu người dùng gửi lên: lẫn id lạ là từ chối cả lần lưu.
 * Hàng chờ đã lưu thì lặng lẽ bỏ id hết hiệu lực, để một tập đã bị xoá hay
 * kênh vừa làm lại không khoá luôn việc lưu lịch.
 *
 * Tập đã xong, đã duyệt hoặc đã huỷ thì bỏ qua không báo lỗi: lượt chạy hằng
 * ngày cũng bỏ qua chúng, giữ lại chỉ làm hàng chờ hiện những tập sẽ không
 * bao giờ được làm.
 */
export function resolveQueue<T extends QueuePlanRow>(
  ids: string[],
  rows: T[],
  { strict }: { strict: boolean },
): { ok: true; plans: T[] } | { ok: false } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const plans: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      if (strict) return { ok: false };
      continue;
    }
    if (planIsQueueable(row)) plans.push(row);
  }
  return { ok: true, plans: plans.slice(0, QUEUE_LIMIT) };
}
