import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page";

export default function AdminNotFound() {
  return (
    <PageContainer width="form">
      <EmptyState
        icon={SearchX}
        title="Không tìm thấy mục này"
        hint="Người dùng hoặc kênh này không còn, hoặc đường dẫn sai."
        className="mt-16"
        action={
          <Link href="/admin" className={buttonClasses("primary", "md")}>
            Về tổng quan
          </Link>
        }
      />
    </PageContainer>
  );
}
