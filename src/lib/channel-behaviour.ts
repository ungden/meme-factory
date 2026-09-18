import type { ChannelProfile } from "./family-catalogue";

/**
 * Hành vi riêng của từng kênh, đọc từ hồ sơ kênh thay vì từ tên dự án.
 *
 * So tên dự án ("Bánh Bao & Đậu Đỏ") từng nằm rải ở bốn route. Nó sai theo cả
 * hai chiều: khách thứ hai không bao giờ bật được những hành vi này, còn khách
 * đầu tiên mất sạch chúng chỉ vì đổi tên dự án.
 */

export function voicesLocked(profile: ChannelProfile | null | undefined): boolean {
  return Boolean(profile?.voicesLocked);
}

export function usesFatherTerminology(profile: ChannelProfile | null | undefined): boolean {
  return profile?.terminologyRules === "family-father";
}
