"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { BadgeTone } from "./admin-labels";

/** Gọi API quản trị kèm phiên đăng nhập; các route admin đọc token ở header. */
export async function adminFetch(url: string, init: RequestInit = {}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session?.access_token ?? ""}`);
  return fetch(url, { ...init, headers });
}

/** Lấy câu lỗi route trả về; route quản trị luôn trả `{ error }` bằng tiếng Việt. */
export async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

const TONES: Record<BadgeTone, string> = {
  success: "th-bg-success-light th-text-success",
  danger: "th-bg-danger-light th-text-danger",
  warning: "th-bg-warning-light th-text-warning",
  accent: "th-bg-accent-light th-text-accent",
  neutral: "th-bg-tertiary th-text-secondary",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const TEXT_TONES: Record<BadgeTone, string> = {
  success: "th-text-success",
  danger: "th-text-danger",
  warning: "th-text-warning",
  accent: "th-text-accent",
  neutral: "th-text-secondary",
};

/** Khung bảng: thẻ chuẩn, cuộn ngang bên trong để trang không tràn ở 375px. */
export function TableCard({ children, footer, className = "" }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
      {footer}
    </Card>
  );
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function Th({ children, align = "left" }: { children?: ReactNode; align?: keyof typeof ALIGN }) {
  return <th className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium th-text-muted ${ALIGN[align]}`}>{children}</th>;
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="th-bg-tertiary">{children}</tr>
    </thead>
  );
}

/** Hàng giữ chỗ khi bảng đang tải. */
export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <tr key={index}>
          <td colSpan={cols} className="px-4 py-3">
            <div aria-hidden className="h-5 animate-pulse rounded-md th-bg-tertiary" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-sm th-text-muted">
        {children}
      </td>
    </tr>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 th-border">
      <span className="text-xs th-text-muted">
        Trang {page}/{totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" aria-label="Trang trước" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft size={16} />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Trang sau" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
