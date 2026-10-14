import type { ComponentType, ReactNode } from "react";

/** Trạng thái chưa có gì: nói rõ chỗ này sẽ có gì và cho đúng một việc để bắt đầu. */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className = "",
}: {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center th-border ${className}`}>
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl th-bg-accent-light th-text-accent">
          <Icon size={20} />
        </span>
      )}
      <p className="text-sm font-medium th-text-primary">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm th-text-tertiary">{hint}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
