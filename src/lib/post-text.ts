/**
 * Ghép nội dung một bài đăng từ caption và hashtag.
 *
 * Đích cuối của người dùng không phải là một file trong thư viện mà là một bài
 * trên fanpage. Khi chưa đăng trực tiếp được, thứ gần nhất là một khối chữ họ
 * dán thẳng vào Facebook — nên nó phải sạch: không lặp hashtag đã nằm trong
 * caption, không có dòng trống thừa, không có dấu # rỗng.
 */

/** Chuẩn hoá một hashtag: bỏ #, bỏ khoảng trắng, giữ chữ và số. */
export function normalizeHashtag(tag: string): string {
  const text = tag
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "");
  return text ? `#${text}` : "";
}

export function buildPostText(caption: string, hashtags: string[] = []): string {
  const body = (caption || "").trim();
  const existing = new Set(
    (body.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLocaleLowerCase("vi")),
  );
  const extra: string[] = [];
  for (const raw of hashtags) {
    const tag = normalizeHashtag(raw);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase("vi");
    if (existing.has(key)) continue;
    existing.add(key);
    extra.push(tag);
  }
  if (!extra.length) return body;
  return body ? `${body}\n\n${extra.join(" ")}` : extra.join(" ");
}

/**
 * Hashtag gợi ý từ tên dự án và lĩnh vực.
 *
 * Tiếng Việt có dấu không dùng được trong hashtag Facebook một cách đáng tin,
 * nên bỏ dấu và viết liền.
 */
export function suggestHashtags(...sources: (string | null | undefined)[]): string[] {
  const tags: string[] = [];
  for (const source of sources) {
    const text = (source || "").trim();
    if (!text) continue;
    const ascii = text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9\s]/g, " ")
      .trim();
    if (!ascii) continue;
    const joined = ascii
      .split(/\s+/)
      .map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
      .join("");
    if (joined.length > 1) tags.push(`#${joined}`);
  }
  return Array.from(new Set(tags)).slice(0, 5);
}
