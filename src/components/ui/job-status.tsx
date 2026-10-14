import type { ReactNode } from "react";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import Button from "./button";
import { formatPoints } from "@/lib/format";

/**
 * Thẻ tiến độ của một việc AI đang làm: meme, video, tập phim, ảnh nhân vật.
 * Đang làm thì nói rõ có thể rời trang; hỏng thì nói đã hoàn bao nhiêu điểm và
 * cho nút thử lại. Video từng im lặng khi hỏng, còn ô xem trước vẫn hứa
 * "video xong sẽ nằm trong thư viện".
 */
export default function JobStatus({
  state,
  title,
  detail,
  refundedPoints,
  onRetry,
  retryLabel = "Thử lại",
  leaveHint = "Rời trang cũng được, xong sẽ nằm trong thư viện.",
  children,
}: {
  state: "working" | "failed" | "done";
  title: ReactNode;
  detail?: ReactNode;
  /** Số điểm đã hoàn khi hỏng; 0 hoặc bỏ trống thì không nói. */
  refundedPoints?: number;
  onRetry?: () => void;
  retryLabel?: string;
  /** Câu nói người dùng có thể đi chỗ khác; null khi việc này cần giữ trang. */
  leaveHint?: string | null;
  children?: ReactNode;
}) {
  const Icon = state === "working" ? Loader2 : state === "failed" ? XCircle : CheckCircle2;
  const tone = state === "working" ? "th-text-accent" : state === "failed" ? "th-text-danger" : "th-text-success";
  return (
    <div
      role={state === "failed" ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-2xl border p-4 ${state === "failed" ? "th-border-danger th-bg-danger-light" : "th-border th-bg-card"}`}
    >
      <div className="flex items-start gap-3">
        <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${tone} ${state === "working" ? "animate-spin" : ""}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium th-text-primary">{title}</p>
          {detail && <p className="mt-0.5 text-sm th-text-secondary">{detail}</p>}
          {state === "working" && leaveHint && <p className="mt-1 text-xs th-text-tertiary">{leaveHint}</p>}
          {state === "failed" && !!refundedPoints && (
            <p className="mt-1 text-xs th-text-secondary">Đã hoàn {formatPoints(refundedPoints)} vào kênh.</p>
          )}
        </div>
        {state === "failed" && onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw size={14} aria-hidden /> {retryLabel}
          </Button>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
