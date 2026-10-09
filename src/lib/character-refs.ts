/**
 * Ảnh tham chiếu của một nhân vật khi được gắn vào bài. Bộ ảnh chuẩn đã khoá
 * (cận mặt, toàn thân) giữ gương mặt và dáng người tốt hơn ảnh đại diện, nên
 * dùng trước; nhân vật chưa có bộ thì dùng ảnh đại diện.
 */
export type TaggableCharacter = {
  id: string;
  name: string;
  avatarUrl: string | null;
  references?: Record<string, string>;
};

export function characterReferenceUrls(character: TaggableCharacter): string[] {
  const pack = [character.references?.identity_face, character.references?.identity_body].filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  if (pack.length) return pack;
  return character.avatarUrl ? [character.avatarUrl] : [];
}

export function isTaggable(character: TaggableCharacter) {
  return characterReferenceUrls(character).length > 0;
}

/** Ảnh tham chiếu của nhiều nhân vật, không trùng, tối đa `limit` ảnh. */
export function referencesFor(characters: TaggableCharacter[], limit = 9): string[] {
  return [...new Set(characters.flatMap(characterReferenceUrls))].slice(0, limit);
}
