/**
 * Phần thuần của luồng meme tự làm: đọc tuỳ chọn, dựng đề bài khi người dùng
 * không đưa ý tưởng, và chọn phương án không lặp các meme gần đây.
 */

export const MEME_FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
export type MemeFormat = (typeof MEME_FORMATS)[number];

export type MemeRunOptions = {
  format?: MemeFormat;
  characterIds?: string[];
  noCharacters?: boolean;
};

export function normalizeMemeOptions(value: unknown): MemeRunOptions {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const options: MemeRunOptions = {};
  if (MEME_FORMATS.includes(raw.format as MemeFormat)) options.format = raw.format as MemeFormat;
  if (Array.isArray(raw.characterIds))
    options.characterIds = raw.characterIds
      .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 4);
  if (raw.noCharacters === true) options.noCharacters = true;
  return options;
}

/**
 * Đề bài cho người viết meme. Không có ý tưởng thì AI tự chọn trong khuôn khổ
 * kênh và tránh các chủ đề vừa đăng — tự sản xuất mỗi ngày mà lặp ý là hỏng kênh.
 */
export function buildMemeIdea(input: {
  intent: string;
  positioning?: string;
  audience?: string;
  tone?: string;
  recentHeadlines: string[];
}): string {
  const intent = input.intent.trim();
  const avoid = input.recentHeadlines.filter(Boolean).slice(0, 20);
  if (intent) return intent;
  return [
    "Tự chọn MỘT tình huống đời thường mới, đúng chất kênh, khiến người xem bật cười vì thấy chính mình và muốn tag bạn bè.",
    input.positioning ? `Kênh nói về: ${input.positioning}` : "",
    input.audience ? `Người xem: ${input.audience}` : "",
    input.tone ? `Giọng kênh: ${input.tone}` : "",
    avoid.length ? `Không lặp lại các ý đã đăng gần đây: ${avoid.map((h) => `"${h}"`).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalized(text: string) {
  return text
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lấy phương án đầu (người viết đã tự xếp hạng), bỏ phương án trùng chữ với meme gần đây. */
export function pickMemeVariation<T extends { headline?: string }>(
  variations: T[],
  recentHeadlines: string[],
): T | null {
  const recent = new Set(recentHeadlines.map(normalized).filter(Boolean));
  const usable = variations.filter((variation) => normalized(variation.headline || "").length > 0);
  return usable.find((variation) => !recent.has(normalized(variation.headline!))) || usable[0] || null;
}

/** Thời gian chờ trước lần thử lại: lỗi mạng hay quá tải thường qua sau vài phút. */
export function memeRetryDelaySeconds(attempts: number): number {
  return Math.min(15 * 60, 120 * Math.max(1, attempts));
}
