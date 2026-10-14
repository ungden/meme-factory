import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page";

export default function DashboardNotFound() {
  return (
    <PageContainer width="form">
      <EmptyState
        icon={FolderOpen}
        title="Không tìm thấy trang này"
        hint="Kênh hoặc bài này không còn, hoặc bạn không có quyền mở."
        className="mt-16"
        action={
          <Link href="/projects" className={buttonClasses("primary", "md")}>
            Về trang chính
          </Link>
        }
      />
    </PageContainer>
  );
}
