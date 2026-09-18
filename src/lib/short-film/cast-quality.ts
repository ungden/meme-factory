import type { FilmCast } from "./contracts";

/**
 * Bộ ảnh chuẩn có đủ để giữ nguyên một con người qua nhiều cảnh không.
 *
 * Ngày 12/09/2026 bốn nhân vật lõi được dựng lại theo phong cách người thật, và
 * phiên bản khoá mới chỉ có đúng một ảnh toàn thân — không còn ảnh cận mặt.
 * Từ đó mọi tập phim được dựng mà không có tham chiếu khuôn mặt nào, và mặt
 * nhân vật đổi giữa các cảnh. Không có chỗ nào trong hệ thống phát hiện được:
 * ảnh vẫn "có", chỉ là không đúng loại cần.
 */

/** Ảnh cận mặt là thứ quyết định người xem có nhận ra cùng một nhân vật không. */
const FACE_ROLE = "identity_face";

export type CastGap = {
  characterId: string;
  name: string;
  /** Câu nói thẳng cho người dùng, không phải mã lỗi. */
  message: string;
};

export function castIdentityGaps(cast: FilmCast[]): CastGap[] {
  const gaps: CastGap[] = [];
  for (const character of cast) {
    // Khách mời được sinh riêng cho một tập, chỉ có một ảnh là đúng thiết kế.
    if (character.isGuest) continue;
    const roles = character.referenceRoles;
    // Kịch bản cũ lưu cast không kèm vai trò; im lặng còn hơn cảnh báo sai.
    if (!Array.isArray(roles) || roles.length === 0) continue;
    if (roles.includes(FACE_ROLE)) continue;
    gaps.push({
      characterId: character.characterId,
      name: character.name,
      message:
        `${character.name} chưa có ảnh chuẩn cận mặt, nên khuôn mặt sẽ đổi giữa các cảnh. ` +
        `Thêm một ảnh cận mặt vào bộ ảnh chuẩn rồi khoá lại trước khi làm tập tiếp theo.`,
    });
  }
  return gaps;
}
