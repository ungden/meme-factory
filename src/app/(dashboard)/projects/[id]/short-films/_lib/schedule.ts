import type { EpisodeSummary } from "./studio";

/**
 * Lịch "Tự làm mỗi ngày" của phim. Chỉ Studio phim sửa lịch; trước đây trang
 * Chỉnh tay cũng có một bảng lịch riêng, hai nơi gửi hai bộ trường khác nhau
 * nên lưu ở nơi này là ghi đè mức chi hoặc số phim mỗi ngày của nơi kia.
 */
export type FilmSchedule = {
  enabled: boolean;
  filmsPerDay: number;
  /** HH:mm theo giờ Việt Nam. */
  localTime: string;
  maxPointsPerFilm: number;
  videoModel: string;
  /** Tập làm trước khi tự nghĩ ý mới, đúng thứ tự lịch sẽ làm. */
  queue: QueuedEpisode[];
};

export type QueuedEpisode = { id: string; title: string };

type ApiAutomation = {
  enabled?: boolean | null;
  films_per_day?: number | null;
  local_time?: string | null;
  max_points_per_film?: number | null;
  default_config?: { videoModel?: string | null } | null;
} | null | undefined;

/**
 * Đọc lịch đã lưu. Chưa có lịch thì lấy mức chi và chất lượng đang chọn ở
 * Studio, để bật lần đầu không phải chọn lại.
 */
export function scheduleFromApi(
  automation: ApiAutomation,
  fallback: { maxPointsPerFilm: number; videoModel: string },
  queue: QueuedEpisode[] = [],
): FilmSchedule {
  const perFilm = Number(automation?.max_points_per_film);
  const perDay = Number(automation?.films_per_day);
  return {
    enabled: automation?.enabled === true,
    filmsPerDay: Number.isInteger(perDay) && perDay >= 1 && perDay <= 6 ? perDay : 1,
    localTime: String(automation?.local_time || "09:00").slice(0, 5),
    maxPointsPerFilm: Number.isInteger(perFilm) && perFilm > 0 ? perFilm : fallback.maxPointsPerFilm,
    videoModel: automation?.default_config?.videoModel || fallback.videoModel,
    queue,
  };
}

/**
 * Đủ mọi trường API cần, kể cả hàng chờ: máy chủ lưu đúng thứ được gửi, nên
 * thiếu trường nào là trường đó về mặc định.
 */
export function scheduleBody(schedule: FilmSchedule) {
  const maxPointsPerFilm = Math.max(1, Math.round(schedule.maxPointsPerFilm));
  return {
    enabled: schedule.enabled,
    filmsPerDay: schedule.filmsPerDay,
    localTime: schedule.localTime,
    maxPointsPerFilm,
    maxPointsPerDay: maxPointsPerFilm * schedule.filmsPerDay,
    videoModel: schedule.videoModel,
    queuedPlanIds: schedule.queue.map((item) => item.id),
  };
}

export function scheduleChanged(draft: FilmSchedule, saved: FilmSchedule) {
  return (
    draft.enabled !== saved.enabled ||
    draft.filmsPerDay !== saved.filmsPerDay ||
    draft.localTime !== saved.localTime ||
    draft.maxPointsPerFilm !== saved.maxPointsPerFilm ||
    draft.queue.map((item) => item.id).join() !== saved.queue.map((item) => item.id).join()
  );
}

/**
 * Tập xếp được vào hàng chờ: đã có kịch bản và chưa ra phim. Tập đang làm hay
 * đang chờ bạn xem thì không, vì lịch sẽ mở thêm một lượt chồng lên lượt đó.
 */
export function queueCandidates(episodes: EpisodeSummary[], queue: QueuedEpisode[]): QueuedEpisode[] {
  const queued = new Set(queue.map((item) => item.id));
  return episodes
    .filter((episode) => episode.planId && ["draft", "stopped"].includes(episode.status) && !queued.has(episode.planId))
    .map((episode) => ({ id: episode.planId!, title: episode.title }));
}

export function moveInQueue<T>(queue: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= queue.length || target < 0 || target >= queue.length) return queue;
  const next = [...queue];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
