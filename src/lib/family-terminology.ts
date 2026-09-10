const FATHER_AFTER =
  "ơi|à|ạ|nha|nhé|nhỉ|dậy|ngủ|đi|về|làm|chở|đưa|đón|cho|giúp|quên|nhớ|nói|bảo|hỏi|đang|đã|sẽ|có|không|chưa|vẫn|còn|cứ|muốn|cần|thích|thương|ăn|uống|mặc|nghe|xem|đọc|cầm|lấy|để|ngồi|nằm|đứng";
const FATHER_BEFORE =
  "gọi|kêu|nhắc|đánh thức|chờ|đợi|hỏi|bảo|thưa|nói với|của|với|cùng|theo|đưa cho|lấy cho|để cho";

/**
 * Canonical terminology for the Bánh Bao & Đậu Đỏ family.
 *
 * We only rewrite clear parent references. Vietnamese "ba" is also the
 * number three and occurs in phrases such as "ba cảnh", "ba ngón tay" and
 * "ba lô", which must remain untouched.
 */
export function normalizeFamilyFatherText(value: string) {
  return value
    .replace(/\bba mẹ\b/giu, (match) => (match[0] === "B" ? "Bố mẹ" : "bố mẹ"))
    .replace(
      new RegExp(`\\bba(?=\\s+(?:${FATHER_AFTER})\\b)`, "giu"),
      (match) => (match[0] === "B" ? "Bố" : "bố"),
    )
    .replace(
      new RegExp(`\\b((?:${FATHER_BEFORE})\\s+)ba\\b`, "giu"),
      (match, prefix: string) => `${prefix}${/^[A-ZÀ-Ỹ]/u.test(match) ? "Bố" : "bố"}`,
    )
    .replace(/(^|[\n.!?…]\s*)Ba(?=\s+(?!cảnh\b|người\b|lần\b|phút\b|giờ\b|ngày\b|món\b|việc\b|hướng\b|phương án\b|tập\b|câu\b|đứa\b|chiếc\b|cái\b|bước\b|ngón\b|lô\b))/gu, "$1Bố");
}

export function normalizeFamilyFatherTerms<T>(value: T): T {
  if (typeof value === "string")
    return normalizeFamilyFatherText(value) as T;
  if (Array.isArray(value))
    return value.map((item) => normalizeFamilyFatherTerms(item)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeFamilyFatherTerms(item),
      ]),
    ) as T;
  return value;
}
