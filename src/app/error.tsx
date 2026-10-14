"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/button";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Không in error.message: ở bản chạy thật Next đã thay nó bằng câu tiếng Anh
  // chung chung, còn ở máy dev thì là chữ kỹ thuật.
  return (
    <div className="flex min-h-screen items-center justify-center p-8 th-bg-primary">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl th-bg-danger-light th-text-danger">
          <AlertTriangle size={20} />
        </div>
        <h1 className="mb-2 text-xl font-semibold th-text-primary">Có lỗi xảy ra</h1>
        <p className="mb-6 text-sm th-text-tertiary">Trang này chưa mở được. Bạn thử lại nhé.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw size={16} /> Thử lại
          </Button>
          <Link href="/" className={buttonClasses("outline", "md")}>
            <Home size={16} /> Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
