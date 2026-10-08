import type { FilmCast } from "./contracts";

/**
 * Trang phục riêng của một tập.
 *
 * Ở kênh mẫu, bộ đồ là một nửa cú hài: em bé mặc vest đi phỏng vấn, mặc đồ gấu
 * đi chợ, đội mũ đầu bếp dạy nấu. Ảnh chuẩn thân/lưng khoá bộ đồ mặc định, nên
 * nếu chỉ ghi "mặc vest" trong chữ, Seedance vẫn trả về chiếc tạp dề. Tập có
 * trang phục riêng vì vậy nhận một ảnh toàn thân mới mặc đúng bộ đó, và ảnh này
 * thay chỗ ảnh thân/lưng trong cast của riêng tập đó.
 */
export type EpisodeWardrobe = { characterId: string; outfit: string };

export const MAX_OUTFIT_LENGTH = 300;

export function normalizeWardrobe(value: unknown, allowedIds: string[]): EpisodeWardrobe[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("STORY_WARDROBE_INVALID");
  const seen = new Set<string>();
  const result: EpisodeWardrobe[] = [];
  for (const item of value) {
    const characterId = String((item as EpisodeWardrobe)?.characterId || "").trim();
    const outfit = String((item as EpisodeWardrobe)?.outfit || "").replace(/\s+/g, " ").trim();
    // Model hay trả một mục rỗng khi tập không cần đồ riêng; đó không phải lỗi.
    if (!characterId && !outfit) continue;
    if (
      !allowedIds.includes(characterId) ||
      seen.has(characterId) ||
      outfit.length < 6 ||
      outfit.length > MAX_OUTFIT_LENGTH
    )
      throw new Error("STORY_WARDROBE_INVALID");
    seen.add(characterId);
    result.push({ characterId, outfit });
  }
  return result;
}

/**
 * Cùng bộ đồ trong cùng tập thì cùng một file: lưu lại kịch bản không vẽ lại.
 * Nhận sẵn hàm băm vì file này cũng được kiểm ở phía trình duyệt.
 */
export function wardrobeStoragePath(
  projectId: string,
  planId: string,
  characterId: string,
  outfit: string,
  digest: (value: string) => string,
) {
  return `${projectId}/film-wardrobe/${planId}/${characterId}-${digest(outfit).slice(0, 16)}.png`;
}

/** Ảnh mặt dùng để vẽ bộ đồ mới: cận mặt nếu có, không thì ảnh chính. */
export function wardrobeFaceSource(cast: FilmCast): string {
  const roles = cast.referenceRoles || [];
  const images = cast.referenceImages || [];
  const face = roles.length === images.length ? images[roles.indexOf("identity_face")] : undefined;
  return face || cast.imageUrl || images[0] || "";
}

/**
 * Cast của tập mặc đồ riêng: giữ cận mặt để khoá khuôn mặt, ảnh mới khoá vóc
 * dáng và bộ đồ. Bỏ ảnh lưng/tạo hình cũ vì chúng vẫn mặc đồ mặc định.
 */
export function dressCast(cast: FilmCast, outfit: string, outfitImage: string): FilmCast {
  const face = wardrobeFaceSource(cast);
  return {
    ...cast,
    episodeOutfit: outfit,
    referenceImages: face ? [face, outfitImage] : [outfitImage],
    referenceRoles: face ? ["identity_face", "identity_body"] : ["identity_body"],
  };
}
