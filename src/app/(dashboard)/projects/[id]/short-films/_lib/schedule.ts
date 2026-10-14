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
};

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
): FilmSchedule {
  const perFilm = Number(automation?.max_points_per_film);
  const perDay = Number(automation?.films_per_day);
  return {
    enabled: automation?.enabled === true,
    filmsPerDay: Number.isInteger(perDay) && perDay >= 1 && perDay <= 6 ? perDay : 1,
    localTime: String(automation?.local_time || "09:00").slice(0, 5),
    maxPointsPerFilm: Number.isInteger(perFilm) && perFilm > 0 ? perFilm : fallback.maxPointsPerFilm,
    videoModel: automation?.default_config?.videoModel || fallback.videoModel,
  };
}

/**
 * Đủ mọi trường API cần. Không gửi hàng đợi kịch bản: máy chủ giữ nguyên hàng
 * đợi đã có thay vì xoá trắng.
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
  };
}
