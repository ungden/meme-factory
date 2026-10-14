import { isLocked, type PackCharacter } from "./character-pack";

export type CharacterFilter = "all" | "locked" | "unfinished";
export type CharacterSort = "usage" | "newest" | "name";

export const CHARACTER_FILTER_LABEL: Record<CharacterFilter, string> = {
  all: "Tất cả",
  locked: "Đã chốt bộ ảnh",
  unfinished: "Chưa xong",
};

export const CHARACTER_SORT_LABEL: Record<CharacterSort, string> = {
  usage: "Dùng nhiều nhất",
  newest: "Mới nhất",
  name: "Tên A–Z",
};

/** Ít nhân vật thì nhìn là thấy hết, thanh lọc chỉ thêm rối. */
export const CHARACTER_TOOLBAR_MIN = 5;

export type CharacterUsage = { ready: number; memes: number; baseId: string };

/**
 * Mức dùng của từng nhân vật: số biểu cảm dùng được và số meme đã làm từ các
 * biểu cảm đó.
 */
export function characterUsage(
  baseImages: ReadonlyArray<{ id: string; character_id: string | null }>,
  memes: ReadonlyArray<{ base_image_id?: string | null }>,
): Map<string, CharacterUsage> {
  const memesByImage = new Map<string, number>();
  for (const meme of memes) {
    if (meme.base_image_id) memesByImage.set(meme.base_image_id, (memesByImage.get(meme.base_image_id) ?? 0) + 1);
  }
  const usage = new Map<string, CharacterUsage>();
  for (const image of baseImages) {
    if (!image.character_id) continue;
    const entry = usage.get(image.character_id) ?? { ready: 0, memes: 0, baseId: image.id };
    entry.ready += 1;
    entry.memes += memesByImage.get(image.id) ?? 0;
    usage.set(image.character_id, entry);
  }
  return usage;
}

/** Meme đã làm nặng hơn biểu cảm có sẵn: đó mới là nhân vật kênh thật sự dùng. */
export function usageScore(usage: CharacterUsage | undefined) {
  return usage ? usage.memes * 10 + usage.ready : 0;
}

/** Tìm tên không cần gõ dấu: "meo" tìm ra "Mèo", "dau" ra "Đậu". */
export function foldName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/**
 * Lọc và xếp danh sách nhân vật đã tải. Danh sách vào theo thứ tự tạo (cũ
 * trước), nên "Mới nhất" là đảo thứ tự đó; các mức bằng nhau giữ thứ tự cũ.
 */
export function arrangeCharacters<T extends PackCharacter>(
  characters: readonly T[],
  options: { query: string; filter: CharacterFilter; sort: CharacterSort; usage: Map<string, CharacterUsage> },
): T[] {
  const query = foldName(options.query);
  const rows = characters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => !query || foldName(character.name).includes(query))
    .filter(({ character }) =>
      options.filter === "all" ? true : options.filter === "locked" ? isLocked(character) : !isLocked(character),
    );
  rows.sort((a, b) => {
    if (options.sort === "newest") return b.index - a.index;
    if (options.sort === "name") return a.character.name.localeCompare(b.character.name, "vi") || a.index - b.index;
    return usageScore(options.usage.get(b.character.id)) - usageScore(options.usage.get(a.character.id)) || a.index - b.index;
  });
  return rows.map(({ character }) => character);
}
