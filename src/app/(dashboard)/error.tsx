"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer width="form">
      <EmptyState
        icon={AlertTriangle}
        title="Có lỗi xảy ra"
        hint="Trang này chưa mở được. Bạn thử lại nhé; việc đang làm ở máy chủ vẫn chạy tiếp."
        className="mt-16"
        action={
          <>
            <Button onClick={reset}>
              <RotateCcw size={16} /> Thử lại
            </Button>
            <Link href="/projects" className={buttonClasses("outline", "md")}>
              Về trang chính
            </Link>
          </>
        }
      />
    </PageContainer>
  );
}
