import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

const WIDTHS = {
  /** Trang làm việc: Meme, Video, Phim, Nhân vật, Thư viện. */
  work: "max-w-6xl",
  /** Form và cài đặt. */
  form: "max-w-2xl",
  /** Trang chính và tổng quan kênh, có lưới kết quả rộng. */
  wide: "max-w-7xl",
} as const;

/**
 * Khung nội dung của mọi trang sau đăng nhập.
 *
 * `pt-16` chừa chỗ cho nút menu và chuông thông báo, vốn hiện tới tận `lg`.
 * Các trang cũ bỏ khoảng này từ `md`, nên ở bề ngang máy tính bảng hai nút đó
 * đè lên tiêu đề. Chỉ bỏ ở `lg`, đúng lúc thanh bên hiện ra.
 */
export function PageContainer({
  children,
  width = "work",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <main className={`min-h-screen px-4 pb-12 pt-16 sm:px-6 lg:px-8 lg:pt-8 ${className}`}>
      <div className={`mx-auto w-full ${WIDTHS[width]}`}>{children}</div>
    </main>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Nút bên phải tiêu đề; xuống dòng dưới trên điện thoại. */
  actions?: ReactNode;
  /** Trang chi tiết: đường về trang danh sách. */
  back?: { href: string; label: string };
  /** Thứ nằm ngay dưới tiêu đề, ví dụ thanh tab. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="-ml-1 mb-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm th-text-tertiary hover:th-text-primary"
        >
          <ChevronLeft size={16} aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight th-text-primary">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm th-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Khối xám giữ chỗ khi đang tải; dựng theo bố cục trang thay cho chữ "Đang tải…". */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-2xl th-bg-tertiary ${className}`} />;
}

/** Bộ khung trang đang tải dùng chung: tiêu đề và vài khối nội dung. */
export function PageSkeleton({ width = "work", blocks = 2 }: { width?: keyof typeof WIDTHS; blocks?: number }) {
  return (
    <PageContainer width={width}>
      <div role="status" aria-label="Đang tải">
        <Skeleton className="mb-2 h-8 w-48 rounded-lg" />
        <Skeleton className="mb-6 h-4 w-72 rounded-md" />
        <div className="space-y-4">
          {Array.from({ length: blocks }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
