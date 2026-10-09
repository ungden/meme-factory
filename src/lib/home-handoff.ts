/**
 * Trang chính chuyển ý tưởng phim sang Studio phim của kênh qua sessionStorage
 * thay vì URL: tải lại trang không được làm thêm một phim, và ý tưởng không
 * nằm trong lịch sử trình duyệt.
 */
export type FilmHandoff = { idea: string; format: string | null; key: string; at: number };

// Quá hạn này thì chỉ điền sẵn ý tưởng chứ không tự làm: người dùng mở lại tab
// cũ không mong một phim tốn điểm tự chạy.
const FRESH_MS = 10 * 60 * 1000;
const storageKey = (projectRef: string) => `aida:film-handoff:${projectRef}`;

export function giveFilmHandoff(projectRef: string, handoff: Omit<FilmHandoff, "at">) {
  try {
    window.sessionStorage.setItem(storageKey(projectRef), JSON.stringify({ ...handoff, at: Date.now() }));
  } catch {
    // Không lưu được thì Studio mở trống; người dùng gõ lại, không mất tiền.
  }
}

/** Đọc một lần rồi xoá. `key` rỗng nghĩa là chỉ điền sẵn, không tự làm. */
export function takeFilmHandoff(projectRef: string, now = Date.now()): FilmHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(projectRef));
    window.sessionStorage.removeItem(storageKey(projectRef));
    return parseFilmHandoff(raw, now);
  } catch {
    return null;
  }
}

export function parseFilmHandoff(raw: string | null, now: number): FilmHandoff | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<FilmHandoff>;
  if (typeof value.idea !== "string" || typeof value.key !== "string" || typeof value.at !== "number") return null;
  return {
    idea: value.idea.slice(0, 2000),
    format: typeof value.format === "string" ? value.format : null,
    key: now - value.at <= FRESH_MS ? value.key : "",
    at: value.at,
  };
}

/**
 * Video lẻ từ trang chính: mô tả và ảnh tham chiếu (bộ ảnh nhân vật được gắn).
 * Trang video còn phải báo giá trước khi làm nên không cần khoá chống trùng;
 * chỉ cần không để một lần mở tab cũ điền đè lên việc người dùng đang làm.
 */
export type VideoHandoff = { prompt: string; references: string[]; at: number };

const videoKey = (projectRef: string) => `aida:video-handoff:${projectRef}`;

export function giveVideoHandoff(projectRef: string, handoff: Omit<VideoHandoff, "at">) {
  try {
    window.sessionStorage.setItem(videoKey(projectRef), JSON.stringify({ ...handoff, at: Date.now() }));
  } catch {
    // Không lưu được thì trang video mở trống.
  }
}

export function takeVideoHandoff(projectRef: string, now = Date.now()): VideoHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(videoKey(projectRef));
    window.sessionStorage.removeItem(videoKey(projectRef));
    return parseVideoHandoff(raw, now);
  } catch {
    return null;
  }
}

export function parseVideoHandoff(raw: string | null, now: number): VideoHandoff | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<VideoHandoff>;
  if (typeof value.prompt !== "string" || typeof value.at !== "number" || now - value.at > FRESH_MS) return null;
  const references = Array.isArray(value.references)
    ? value.references.filter((url): url is string => typeof url === "string" && /^https:\/\//.test(url)).slice(0, 9)
    : [];
  return { prompt: value.prompt.slice(0, 2000), references, at: value.at };
}
