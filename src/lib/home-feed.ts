/**
 * Trang chính gom việc của mọi kênh vào một dòng: phim và meme đang làm, cần
 * người dùng xem, hoặc vừa xong. Người dùng không phải mở từng dự án để biết
 * AI đang làm gì cho họ.
 */
import { stripStoryGenreMarker } from "@/lib/story-genre";
import { filmFormatFromIntent, stripFilmFormatMarker, type FilmFormat } from "@/lib/film-camera-language";

export type FeedStatus = "working" | "attention" | "ready" | "stopped";

export type FeedItem = {
  id: string;
  kind: "film" | "meme";
  projectId: string;
  projectName: string;
  title: string;
  status: FeedStatus;
  label: string;
  href: string;
  imageUrl: string | null;
  /** Cách quay của tập, để "Làm thêm kiểu này" giữ đúng kiểu. */
  format: FilmFormat | null;
  scheduled: boolean;
  at: string;
};

export type FeedProject = { id: string; slug: string | null; name: string; workspace_version: number | null };

export type FeedFilmRun = {
  id: string;
  project_id: string;
  workspace_version: number;
  plan_id: string | null;
  intent: string | null;
  status: string;
  source: string;
  updated_at: string;
  video_plans?: { title?: string | null } | null;
};

export type FeedMemeRun = {
  id: string;
  project_id: string;
  workspace_version: number;
  intent: string | null;
  status: string;
  source: string;
  created_at: string;
  completed_at: string | null;
  memes?: { image_url?: string | null; generated_content?: { headline?: string } | null } | null;
};

function clip(text: string, max = 60) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function filmStatus(status: string): FeedStatus {
  if (["queued", "scripting", "running"].includes(status)) return "working";
  if (["needs_review", "budget_blocked", "paused"].includes(status)) return "attention";
  if (status === "completed") return "ready";
  return "stopped";
}

const FILM_LABEL: Record<FeedStatus, string> = {
  working: "AI đang làm phim",
  attention: "Cần bạn xem",
  ready: "Đã có phim",
  stopped: "Đã dừng",
};

function memeStatus(run: FeedMemeRun): FeedStatus {
  if (run.status === "queued" || run.status === "running") return "working";
  if (run.status === "completed" && run.memes?.image_url) return "ready";
  return "stopped";
}

const MEME_LABEL: Record<FeedStatus, string> = {
  working: "AI đang làm meme",
  attention: "Cần bạn xem",
  ready: "Đã xong",
  stopped: "Chưa làm được",
};

function projectRef(project: FeedProject) {
  return project.slug || project.id;
}

/**
 * Lượt thuộc phiên bản dự án cũ (đã đặt lại không gian làm việc) bị bỏ: mở ra
 * sẽ báo không tìm thấy.
 */
export function homeFeed(
  projects: FeedProject[],
  films: FeedFilmRun[],
  memes: FeedMemeRun[],
  limit = 12,
): FeedItem[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const current = (projectId: string, version: number) => {
    const project = byId.get(projectId);
    return project && (project.workspace_version ?? version) === version ? project : null;
  };
  const items: FeedItem[] = [];
  for (const run of films) {
    const project = current(run.project_id, run.workspace_version);
    if (!project) continue;
    const status = filmStatus(run.status);
    const intent = stripFilmFormatMarker(stripStoryGenreMarker(run.intent || ""));
    items.push({
      id: run.id,
      kind: "film",
      projectId: project.id,
      projectName: project.name,
      title: clip(run.video_plans?.title || intent || "Tập do AI tự nghĩ"),
      status,
      label: FILM_LABEL[status],
      href: `/projects/${projectRef(project)}/short-films?tap=${run.plan_id || run.id}`,
      imageUrl: null,
      format: filmFormatFromIntent(run.intent),
      scheduled: run.source === "scheduled",
      at: run.updated_at,
    });
  }
  for (const run of memes) {
    const project = current(run.project_id, run.workspace_version);
    if (!project) continue;
    const status = memeStatus(run);
    items.push({
      id: run.id,
      kind: "meme",
      projectId: project.id,
      projectName: project.name,
      title: clip(run.memes?.generated_content?.headline || run.intent || "Meme do AI tự nghĩ"),
      status,
      label: MEME_LABEL[status],
      href: `/projects/${projectRef(project)}/generate`,
      imageUrl: status === "ready" ? run.memes?.image_url || null : null,
      format: null,
      scheduled: run.source === "scheduled",
      at: run.completed_at || run.created_at,
    });
  }
  // Việc cần người dùng xem lên đầu, rồi việc đang làm, rồi mới tới cái đã xong.
  const rank: Record<FeedStatus, number> = { attention: 0, working: 1, ready: 2, stopped: 3 };
  return items
    .sort((a, b) => rank[a.status] - rank[b.status] || b.at.localeCompare(a.at))
    .slice(0, limit);
}

export function feedIsBusy(items: FeedItem[]) {
  return items.some((item) => item.status === "working");
}

export type AutopilotRow = {
  project_id: string;
  workspace_version: number;
  enabled: boolean;
  local_time: string;
  films_per_day?: number;
  memes_per_day?: number;
};

/** Một dòng cho mỗi kênh đang tự sản xuất, ví dụ "Tự làm 2 phim, 3 meme mỗi ngày từ 09:00". */
export function autopilotLines(
  projects: FeedProject[],
  films: AutopilotRow[],
  memes: AutopilotRow[],
): Record<string, string> {
  const lines: Record<string, string> = {};
  for (const project of projects) {
    const live = (row: AutopilotRow) =>
      row.project_id === project.id && row.enabled && (project.workspace_version ?? row.workspace_version) === row.workspace_version;
    const film = films.find(live);
    const meme = memes.find(live);
    const parts = [
      film ? `${film.films_per_day || 1} phim` : "",
      meme ? `${meme.memes_per_day || 1} meme` : "",
    ].filter(Boolean);
    if (!parts.length) continue;
    const times = [film?.local_time, meme?.local_time].filter(Boolean).map((time) => String(time).slice(0, 5)).sort();
    lines[project.id] = `Tự làm ${parts.join(", ")} mỗi ngày từ ${times[0]}`;
  }
  return lines;
}
