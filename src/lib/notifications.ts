/**
 * Những việc đang chờ người dùng, gom từ các bảng sẵn có.
 *
 * Một tập phim chạy 30–45 phút và dừng lại giữa chừng khi cần một quyết định.
 * Trước đây người dùng chỉ biết điều đó nếu tự mở đúng kênh, đúng tab — nên
 * cách dùng thực tế là ngồi canh màn hình. Chuông thông báo trả lời đúng một câu
 * hỏi: "có gì đang đợi tôi không?"
 *
 * Không có bảng `notifications` riêng: trạng thái đã nằm trong lượt sản xuất và
 * tác vụ, và một bảng nữa chỉ là một nguồn sự thật nữa có thể lệch.
 */
import { errorCode, humanizeError } from "./error-messages";
import { filmBudgetCause } from "./short-film/budget-cause";

/**
 * - `points`: kênh hết điểm, mọi việc đứng yên cho tới khi có thêm điểm.
 * - `budget`: tập phim chạm mức chi chính người dùng đặt.
 * - `decision`: tập phim cần một quyết định.
 * - `ready`: phim xong, chờ duyệt.
 * - `failed`: meme không làm được vì lý do khác tiền.
 * - `done`: tin tốt — meme theo lịch đã xong.
 */
export type NotificationKind = "points" | "budget" | "decision" | "ready" | "failed" | "done";

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
  workspace_version?: number | null;
  plan_id?: string | null;
  status: string;
  phase: string | null;
  error: string | null;
  updated_at: string;
};

export type NotificationFilm = {
  id: string;
  project_id: string;
  workspace_version?: number | null;
  plan_id?: string | null;
  created_at: string;
};

export type NotificationMemeRun = {
  id: string;
  project_id: string;
  workspace_version?: number | null;
  status: string;
  source: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  memes?: { image_url?: string | null; generated_content?: { headline?: string | null } | null } | null;
};

export type NotificationProject = {
  slug: string | null;
  name: string;
  workspace_version?: number | null;
  /** Người xem thông báo có phải chủ kênh không; thiếu thì coi như chủ kênh. */
  owned?: boolean;
};

const MAX_ITEMS = 20;
/** Câu lỗi kỹ thuật dài không giúp được gì trong một danh sách ngắn. */
const MAX_DETAIL = 120;
const HOUR = 60 * 60 * 1000;
/** Meme hỏng quá ba ngày thì người dùng đã thấy ở thư viện, hoặc không còn quan tâm. */
export const MEME_FAILURE_WINDOW_MS = 3 * 24 * HOUR;
export const MEME_DIGEST_WINDOW_MS = 24 * HOUR;
const WALLET_HREF = "/wallet";

/**
 * Bài trừ vào điểm của kênh, nhưng với chủ kênh thì hết điểm kênh là AIDA tự
 * chuyển điểm từ ví cá nhân sang (`project-points.ts`). Vậy chỗ chủ kênh gỡ
 * được là Ví: mua thêm điểm là bài chạy tiếp. Thành viên được mời thì không
 * chuyển được điểm của mình vào kênh người khác, nên đưa họ tới trang điểm của
 * kênh, nơi nói rõ phải nhờ chủ kênh.
 */
export function pointsFix(project: NotificationProject, projectId: string): { href: string; action: string } {
  if (project.owned === false) {
    return { href: `/projects/${project.slug || projectId}/wallet`, action: "nhờ chủ kênh thêm điểm để làm tiếp" };
  }
  return { href: WALLET_HREF, action: "mua thêm điểm để làm tiếp" };
}

/**
 * Thứ tự hiện: việc người dùng phải tự gỡ lên trước, rồi tới tin hỏng chỉ để
 * biết, cuối cùng là tin tốt. Trong cùng một bậc thì mới nhất lên trước.
 */
const TIER: Record<NotificationKind, number> = {
  points: 0,
  budget: 0,
  decision: 0,
  ready: 0,
  failed: 1,
  done: 2,
};

function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > MAX_DETAIL ? `${clean.slice(0, MAX_DETAIL - 1)}…` : clean;
}

// Chuông báo và Studio phim phải hiểu "budget_blocked" giống hệt nhau.
export { filmBudgetCause };

/**
 * Meme hỏng lưu lý do dưới hai dạng: câu tiếng Việt viết sẵn ở máy chủ ("Không
 * đủ điểm: …", "… sau ba lần thử") hoặc mã đặt thẳng trong SQL khi lượt bị bỏ
 * (MEME_RUN_GAVE_UP). Đọc cả hai.
 */
export function memeFailureCause(error: string | null): "wallet" | "gave_up" | "other" {
  const text = (error || "").toLowerCase();
  const code = errorCode(error);
  if (code === "INSUFFICIENT_POINTS" || text.includes("không đủ điểm")) return "wallet";
  if (code === "MEME_RUN_GAVE_UP" || text.includes("ba lần thử")) return "gave_up";
  return "other";
}

export function buildNotifications(input: {
  runs: NotificationRun[];
  films: NotificationFilm[];
  memes?: NotificationMemeRun[];
  projects: Record<string, NotificationProject>;
  now?: number;
}): NotificationItem[] {
  const now = input.now ?? Date.now();
  const items: NotificationItem[] = [];

  // Kênh đã bị xoá, người dùng mất quyền, hoặc lượt thuộc phiên bản trước khi
  // đặt lại không gian làm việc: bỏ qua thay vì hiện một dòng bấm vào không đi
  // đâu cả.
  const projectFor = (projectId: string, version?: number | null) => {
    const project = input.projects[projectId];
    if (!project) return null;
    if (project.workspace_version != null && version != null && project.workspace_version !== version) return null;
    return project;
  };
  const ref = (project: NotificationProject, projectId: string) => project.slug || projectId;

  for (const run of input.runs) {
    const project = projectFor(run.project_id, run.workspace_version);
    if (!project) continue;
    const href = `/projects/${ref(project, run.project_id)}/short-films?tap=${run.plan_id || run.id}`;
    if (run.status === "budget_blocked") {
      const wallet = filmBudgetCause(run.error) === "wallet";
      const fix = pointsFix(project, run.project_id);
      items.push({
        id: `run:${run.id}`,
        kind: wallet ? "points" : "budget",
        title: wallet ? "Kênh hết điểm" : "Tập phim chạm mức chi bạn đặt",
        detail: shorten(
          wallet
            ? `${project.name} — tập phim đang dừng, ${fix.action}.`
            : `${project.name} — nâng mức chi để làm tiếp.`,
        ),
        href: wallet ? fix.href : href,
        at: run.updated_at,
      });
      continue;
    }
    // Lý do dừng đôi khi là mã kỹ thuật; chỉ hiện khi dịch được ra câu thường.
    const reason = humanizeError(run.error, "");
    items.push({
      id: `run:${run.id}`,
      kind: "decision",
      title: "Tập phim đang chờ bạn quyết định",
      detail: shorten(reason ? `${project.name} — ${reason}` : project.name),
      href,
      at: run.updated_at,
    });
  }

  for (const film of input.films) {
    const project = projectFor(film.project_id, film.workspace_version);
    if (!project) continue;
    items.push({
      id: `film:${film.id}`,
      kind: "ready",
      title: "Phim đã xong, chờ bạn duyệt",
      detail: shorten(project.name),
      href: `/projects/${ref(project, film.project_id)}/short-films${film.plan_id ? `?tap=${film.plan_id}` : ""}`,
      at: film.created_at,
    });
  }

  items.push(...memeNotifications(input.memes || [], projectFor, now));

  return items
    .sort((a, b) => TIER[a.kind] - TIER[b.kind] || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, MAX_ITEMS);
}

function memeNotifications(
  runs: NotificationMemeRun[],
  projectFor: (projectId: string, version?: number | null) => NotificationProject | null,
  now: number,
): NotificationItem[] {
  const finishedAt = (run: NotificationMemeRun) => run.completed_at || run.created_at;
  // So bằng số chứ không bằng chuỗi: Postgres trả "+00:00", JS viết "Z".
  const ms = (run: NotificationMemeRun) => Date.parse(finishedAt(run)) || 0;
  const within = (run: NotificationMemeRun, windowMs: number) => {
    const at = ms(run);
    return at > 0 && now - at <= windowMs;
  };

  // Một meme làm được sau lần hỏng nghĩa là chuyện đã qua (kênh đã có điểm,
  // việc làm meme đã chạy lại được): báo lại lỗi cũ chỉ làm người dùng đi sửa
  // thứ đã ổn.
  const lastSuccess = new Map<string, number>();
  for (const run of runs) {
    if (run.status !== "completed") continue;
    lastSuccess.set(run.project_id, Math.max(lastSuccess.get(run.project_id) || 0, ms(run)));
  }

  // Lịch tự động làm tới mười meme một ngày; hết điểm thì cả mười cùng hỏng.
  // Gom theo kênh và lý do để chuông không thành mười dòng giống hệt nhau.
  const failures = new Map<string, { project: NotificationProject; projectId: string; cause: ReturnType<typeof memeFailureCause>; latest: NotificationMemeRun; count: number }>();
  const digests = new Map<string, { project: NotificationProject; projectId: string; latest: NotificationMemeRun; count: number }>();

  for (const run of runs) {
    const project = projectFor(run.project_id, run.workspace_version);
    if (!project) continue;
    if (run.status === "failed") {
      if (!within(run, MEME_FAILURE_WINDOW_MS)) continue;
      if ((lastSuccess.get(run.project_id) || 0) > ms(run)) continue;
      const cause = memeFailureCause(run.error);
      const key = `${run.project_id}:${cause}`;
      const group = failures.get(key);
      if (!group) failures.set(key, { project, projectId: run.project_id, cause, latest: run, count: 1 });
      else {
        group.count += 1;
        if (ms(group.latest) < ms(run)) group.latest = run;
      }
      continue;
    }
    // Meme người dùng tự bấm làm thì họ đã thấy ngay trên màn hình; chỉ meme
    // do lịch tự động làm mới là tin người dùng chưa biết.
    if (run.status === "completed" && run.source === "scheduled" && within(run, MEME_DIGEST_WINDOW_MS)) {
      const group = digests.get(run.project_id);
      if (!group) digests.set(run.project_id, { project, projectId: run.project_id, latest: run, count: 1 });
      else {
        group.count += 1;
        if (ms(group.latest) < ms(run)) group.latest = run;
      }
    }
  }

  const items: NotificationItem[] = [];
  for (const group of failures.values()) {
    const generate = `/projects/${group.project.slug || group.projectId}/generate`;
    const many = group.count > 1 ? `${group.count} meme` : "meme";
    const fix = pointsFix(group.project, group.projectId);
    const detail =
      group.cause === "wallet"
        ? `${group.project.name} hết điểm — ${fix.action}.`
        : group.cause === "gave_up"
          ? `${group.project.name} — ${many} chưa làm được sau 3 lần thử. Bạn thử lại nhé.`
          : `${group.project.name} — ${many} chưa làm được. Bạn thử lại nhé.`;
    items.push({
      id: `meme-failed:${group.projectId}:${group.cause}`,
      // Hết điểm là việc phải làm ngay (mọi thứ khác cũng sẽ dừng), nên xếp
      // chung bậc với việc đang chờ chứ không nằm cùng tin hỏng để biết.
      kind: group.cause === "wallet" ? "points" : "failed",
      title: "Meme chưa làm được",
      detail: shorten(detail),
      href: group.cause === "wallet" ? fix.href : generate,
      at: finishedAt(group.latest),
    });
  }

  for (const group of digests.values()) {
    const headline = group.latest.memes?.generated_content?.headline?.trim();
    items.push({
      id: `meme-digest:${group.projectId}`,
      kind: "done",
      title: `${group.project.name} có ${group.count} meme mới hôm nay`,
      detail: shorten(headline ? `Mới nhất: “${headline}”` : "Bấm để xem và tải ảnh."),
      href: `/projects/${group.project.slug || group.projectId}/generate`,
      at: finishedAt(group.latest),
    });
  }
  return items;
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
