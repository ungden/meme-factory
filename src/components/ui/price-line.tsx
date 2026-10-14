import { Coins } from "lucide-react";
import type { ReactNode } from "react";
import { formatPoints, formatPointsRange } from "@/lib/format";

/**
 * Một dòng giá đứng ngay trên nút làm, giống nhau ở meme, video, phim.
 * Trước đây meme không hiện giá, video hiện báo giá, phim hiện mức chi,
 * mỗi nơi một cách nói.
 */
export default function PriceLine({
  points,
  available,
  note,
  className = "",
}: {
  /** Giá cố định, hoặc khoảng giá khi chưa biết chắc (phim). */
  points: number | { min: number; max: number } | null;
  /** Số điểm kênh đang có, kể cả phần tự chuyển từ ví của bạn. */
  available?: number | null;
  note?: ReactNode;
  className?: string;
}) {
  const cost = points === null ? null : typeof points === "number" ? points : points.max;
  const short = cost !== null && typeof available === "number" && available < cost;
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${short ? "th-text-warning" : "th-text-tertiary"} ${className}`}>
      <Coins size={13} aria-hidden className={short ? "th-text-warning" : "th-text-accent"} />
      {points === null ? (
        <span>Đang tính giá…</span>
      ) : (
        <span className="font-medium th-text-secondary">
          {typeof points === "number" ? `~${formatPoints(points)}` : formatPointsRange(points.min, points.max)}
        </span>
      )}
      {typeof available === "number" && <span>· kênh còn {formatPoints(available)}</span>}
      {note && <span>· {note}</span>}
    </p>
  );
}
