/**
 * Chọn ảnh chuẩn nào được gửi kèm cho mô hình dựng ảnh.
 *
 * Chỉ gửi được vài ảnh cho mỗi nhân vật: mỗi ảnh là chi phí đầu vào thật, và
 * quá nhiều ảnh cũng làm loãng tín hiệu. Bản cũ lấy hai ảnh ĐẦU DANH SÁCH, mà
 * danh sách chỉ sắp theo cờ "ảnh chính" — nên với một bộ năm ảnh, hai ảnh được
 * gửi có thể là hai khung toàn thân, và mô hình không có gì để giữ khuôn mặt.
 *
 * Ở đây chọn theo VAI TRÒ: mỗi vai một ảnh, ưu tiên mặt trước. Bộ ảnh nào không
 * ghi vai trò (kịch bản cũ) thì giữ nguyên thứ tự cũ.
 */

/** Mặt giữ nhận diện, thân giữ dáng và trang phục, "look" giữ tinh thần tạo hình. */
const ROLE_PRIORITY = ["identity_face", "identity_body", "look"];

/** Ba ảnh là chỗ vừa đủ cho mặt + thân + tạo hình mà không phình chi phí. */
export const MAX_CHARACTER_REFERENCES = 3;

/**
 * @param {{referenceImages?: string[], referenceRoles?: string[], imageUrl?: string}} character
 * @returns {string[]} đường dẫn ảnh, nhiều nhất MAX_CHARACTER_REFERENCES
 */
export function characterReferenceSources(character) {
  const images = Array.isArray(character?.referenceImages)
    ? character.referenceImages.filter(Boolean)
    : [];
  if (!images.length) return [character?.imageUrl].filter(Boolean).slice(0, 1);

  const roles = Array.isArray(character?.referenceRoles) ? character.referenceRoles : [];
  // Không biết vai trò thì giữ đúng hành vi cũ: lấy từ đầu danh sách.
  if (roles.length !== images.length) return images.slice(0, MAX_CHARACTER_REFERENCES);

  const picked = [];
  const used = new Set();
  for (const role of ROLE_PRIORITY) {
    const index = images.findIndex((_, i) => roles[i] === role && !used.has(i));
    if (index >= 0) {
      used.add(index);
      picked.push(images[index]);
    }
    if (picked.length === MAX_CHARACTER_REFERENCES) return picked;
  }
  // Còn chỗ thì bù bằng những ảnh chưa dùng, giữ nguyên thứ tự.
  for (let i = 0; i < images.length && picked.length < MAX_CHARACTER_REFERENCES; i += 1)
    if (!used.has(i)) picked.push(images[i]);
  return picked;
}
