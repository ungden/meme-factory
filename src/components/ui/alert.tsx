import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

const TONES = {
  danger: { box: "th-border-danger th-bg-danger-light", text: "th-text-danger", icon: XCircle },
  warning: { box: "th-border-warning th-bg-warning-light", text: "th-text-warning", icon: AlertTriangle },
  success: { box: "th-border-success th-bg-success-light", text: "th-text-success", icon: CheckCircle2 },
  info: { box: "th-border-accent th-bg-accent-light", text: "th-text-accent", icon: Info },
} as const;

/**
 * Báo ngay trong trang: lỗi tải, lỗi chặn việc đang làm, hoặc điều cần biết.
 * Kết quả của một thao tác vừa bấm thì dùng toast; thứ người dùng phải đọc và
 * xử lý thì dùng khung này, vì toast tự biến mất.
 */
export default function Alert({
  tone = "danger",
  title,
  children,
  action,
  className = "",
}: {
  tone?: keyof typeof TONES;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = TONES[tone];
  const Icon = style.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm ${style.box} ${className}`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${style.text}`} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className={`font-medium ${style.text}`}>{title}</p>}
        {children && <div className={title ? "mt-0.5 th-text-secondary" : style.text}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
