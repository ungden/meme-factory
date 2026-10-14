"use client";

import { AlertTriangle, RotateCcw, LogIn } from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/button";

export default function AuthError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 th-bg-primary">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl th-bg-danger-light th-text-danger">
          <AlertTriangle size={20} />
        </div>
        <h1 className="mb-2 text-xl font-semibold th-text-primary">Chưa đăng nhập được</h1>
        <p className="mb-6 text-sm th-text-tertiary">Có lỗi khi đăng nhập. Bạn thử lại nhé.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw size={16} /> Thử lại
          </Button>
          {/* Thẻ a thường: tải lại hẳn trang đăng nhập để bỏ phiên hỏng. */}
          <a href="/login" className={buttonClasses("outline", "md")}>
            <LogIn size={16} /> Đăng nhập lại
          </a>
        </div>
      </div>
    </div>
  );
}
