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
