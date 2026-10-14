/**
 * Cách hiện số và ngày cho người dùng. Trước đây nửa số chỗ dùng
 * toLocaleString, nửa còn lại in thô, nên "1000 điểm" đứng cạnh "1.000đ".
 */

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export function formatPoints(points: number): string {
  return `${formatNumber(points)} điểm`;
}

export function formatPointsRange(min: number, max: number): string {
  return min === max ? formatPoints(min) : `${formatNumber(min)}–${formatNumber(max)} điểm`;
}

const pad = (value: number) => String(value).padStart(2, "0");

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** dd/MM/yyyy — cho danh sách dài, nơi giờ phút không quan trọng. */
export function formatDate(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return "";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** dd/MM/yyyy HH:mm — cho chi tiết một bài, một giao dịch. */
export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return "";
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
