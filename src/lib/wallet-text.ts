import { formatNumber } from "./format";
import { POINT_PACKAGES } from "./point-pricing";

/**
 * Mô tả giao dịch được ghi lúc trừ/cộng và nằm nguyên trong database, nên lịch
 * sử còn chữ của các đời trước: "points", "ví dự án", mã gói ("Mua gói popular")
 * do trigger nạp-mua-gói ghi, số điểm in thô. Sửa lúc hiển thị thay vì sửa dữ
 * liệu cũ: một migration đổi chữ trong sổ giao dịch là đụng vào sổ tiền.
 */
export function describeTransaction(description: string | null | undefined): string {
  let text = (description || "").trim();
  if (!text) return "";
  text = text.replace(/Mua gói ([a-z_]+)\b/g, (match, id: string) => {
    const pkg = POINT_PACKAGES.find((item) => item.id === id);
    return pkg ? `Mua gói ${pkg.name}` : match;
  });
  text = text
    .replace(/ví dự án/gi, "kênh")
    .replace(/ví kênh/gi, "kênh")
    .replace(/dự án/gi, "kênh")
    .replace(/\bpoints?\b/gi, "điểm")
    .replace(/\bpts\b/gi, "điểm");
  return text.replace(/(\d{4,}) điểm/g, (_, value: string) => `${formatNumber(Number(value))} điểm`);
}
