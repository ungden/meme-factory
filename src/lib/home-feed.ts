/**
 * Trang chính gom việc của mọi kênh vào một dòng: phim, video và meme đang
 * làm, cần người dùng xem, hoặc vừa xong. Người dùng không phải mở từng kênh để
 * biết AIDA đang làm gì cho họ.
 */
import { stripStoryGenreMarker } from "@/lib/story-genre";
import { filmFormatFromIntent, stripFilmFormatMarker, type FilmFormat } from "@/lib/film-camera-language";

export type FeedStatus = "working" | "attention" | "ready" | "stopped";

export type FeedItem = {
  id: string;
  kind: "film" | "video" | "meme";
  projectId: string;
  projectName: string;
  title: string;
  status: FeedStatus;
  label: string;
  href: string;
  imageUrl: string | null;
  /** Video xong mà không có ảnh mở đầu: thẻ hiện khung hình đầu của chính video. */
  videoUrl: string | null;
  /** Cách quay của tập, để "Làm bài tương tự" giữ đúng kiểu. */
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

/** Một video lẻ (content_outputs kind video) kèm kênh của nó. */
export type FeedVideo = {
  id: string;
  status: string;
  script: string | null;
  caption: string | null;
  poster_url: string | null;
  created_at: string;
  updated_at: string | null;
  content_sets?: { project_id: string; brief?: string | null } | null;
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
  working: "Đang làm phim",
  attention: "Cần bạn xem",
  ready: "Đã xong",
  stopped: "Đã dừng",
};

function memeStatus(run: FeedMemeRun): FeedStatus {
  if (run.status === "queued" || run.status === "running") return "working";
  if (run.status === "completed" && run.memes?.image_url) return "ready";
  return "stopped";
}

const MEME_LABEL: Record<FeedStatus, string> = {
  working: "Đang làm meme",
  attention: "Cần bạn xem",
  ready: "Đã xong",
  stopped: "Chưa làm được",
};

function videoStatus(status: string): FeedStatus | null {
  if (status === "queued" || status === "running") return "working";
  if (status === "completed" || status === "approved") return "ready";
  if (status === "rejected") return "attention";
  if (status === "failed") return "stopped";
  // Bản nháp chỉ là ô nhập đang gõ dở, chưa phải bài.
  return null;
}

const VIDEO_LABEL: Record<FeedStatus, string> = {
  working: "Đang làm video",
  attention: "Cần sửa",
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
  videos: FeedVideo[] = [],
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
      title: clip(run.video_plans?.title || intent || "Tập mới"),
      status,
      label: FILM_LABEL[status],
      href: `/projects/${projectRef(project)}/short-films?tap=${run.plan_id || run.id}`,
      imageUrl: null,
      videoUrl: null,
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
      title: clip(run.memes?.generated_content?.headline || run.intent || "Meme mới"),
      status,
      label: MEME_LABEL[status],
      // Thư viện chưa mở thẳng được một meme, nên meme xong dẫn về Thư viện; meme
      // đang làm hoặc hỏng thì trang Meme mới có tiến độ và nút thử lại.
      href: `/projects/${projectRef(project)}/${status === "ready" ? "gallery" : "generate"}`,
      imageUrl: status === "ready" ? run.memes?.image_url || null : null,
      videoUrl: null,
      format: null,
      scheduled: run.source === "scheduled",
      at: run.completed_at || run.created_at,
    });
  }
  for (const video of videos) {
    const project = video.content_sets ? byId.get(video.content_sets.project_id) : null;
    const status = videoStatus(video.status);
    if (!project || !status) continue;
    const done = status === "ready" || status === "attention";
    const poster = video.poster_url && /^https:\/\//.test(video.poster_url) ? video.poster_url : null;
    items.push({
      id: video.id,
      kind: "video",
      projectId: project.id,
      projectName: project.name,
      title: clip(video.caption || video.script || video.content_sets?.brief || "Video mới"),
      status,
      label: VIDEO_LABEL[status],
      href: `/projects/${projectRef(project)}/video?video=${video.id}`,
      imageUrl: poster,
      videoUrl: done && !poster ? `/api/content-outputs/${video.id}/media` : null,
      format: null,
      scheduled: false,
      at: video.updated_at || video.created_at,
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
