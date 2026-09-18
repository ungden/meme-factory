/**
 * Những việc đang chờ người dùng, gom từ các bảng sẵn có.
 *
 * Một tập phim chạy 30–45 phút và dừng lại giữa chừng khi cần một quyết định.
 * Trước đây người dùng chỉ biết điều đó nếu tự mở đúng dự án, đúng tab — nên
 * cách dùng thực tế là ngồi canh màn hình. Chuông thông báo trả lời đúng một câu
 * hỏi: "có gì đang đợi tôi không?"
 *
 * Không có bảng `notifications` riêng: trạng thái đã nằm trong lượt sản xuất và
 * tác vụ, và một bảng nữa chỉ là một nguồn sự thật nữa có thể lệch.
 */

export type NotificationKind = "decision" | "budget" | "ready";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
  at: string;
};

export type NotificationRun = {
  id: string;
  project_id: string;
  status: string;
  phase: string | null;
  error: string | null;
  updated_at: string;
};

export type NotificationFilm = {
  id: string;
  project_id: string;
  created_at: string;
};

export type NotificationProject = { slug: string | null; name: string };

const MAX_ITEMS = 20;
/** Câu lỗi kỹ thuật dài không giúp được gì trong một danh sách ngắn. */
const MAX_DETAIL = 120;

function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > MAX_DETAIL ? `${clean.slice(0, MAX_DETAIL - 1)}…` : clean;
}

export function buildNotifications(input: {
  runs: NotificationRun[];
  films: NotificationFilm[];
  projects: Record<string, NotificationProject>;
}): NotificationItem[] {
  const items: NotificationItem[] = [];

  for (const run of input.runs) {
    const project = input.projects[run.project_id];
    // Dự án đã bị xoá hoặc người dùng mất quyền: bỏ qua thay vì hiện một dòng
    // bấm vào không đi đâu cả.
    if (!project) continue;
    const href = `/projects/${project.slug || run.project_id}/short-films`;
    if (run.status === "budget_blocked") {
      items.push({
        id: `run:${run.id}`,
        kind: "budget",
        title: "Tập phim chạm hạn mức điểm",
        detail: shorten(`${project.name} — cần nâng hạn mức để chạy tiếp.`),
        href,
        at: run.updated_at,
      });
      continue;
    }
    items.push({
      id: `run:${run.id}`,
      kind: "decision",
      title: "Tập phim đang chờ bạn quyết định",
      detail: shorten(run.error ? `${project.name} — ${run.error}` : project.name),
      href,
      at: run.updated_at,
    });
  }

  for (const film of input.films) {
    const project = input.projects[film.project_id];
    if (!project) continue;
    items.push({
      id: `film:${film.id}`,
      kind: "ready",
      title: "Phim đã xong, chờ bạn duyệt",
      detail: shorten(project.name),
      href: `/projects/${project.slug || film.project_id}/short-films`,
      at: film.created_at,
    });
  }

  return items
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_ITEMS);
}

/** Nhãn tương đối, đủ dùng cho một danh sách ngắn. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}
