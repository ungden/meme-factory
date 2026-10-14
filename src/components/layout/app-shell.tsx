"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import Sidebar from "@/components/layout/sidebar";
import ProjectInvitationsBanner from "@/components/ui/project-invitations-banner";

/**
 * Khung chung cho mọi trang sau đăng nhập: một thanh bên, một phần chừa chỗ.
 *
 * Từng trang tự dựng Sidebar thì mỗi trang lệch một kiểu (trang chính `ml-56`,
 * trang kênh `pl-56`, có trang quên hẳn), và thanh bên bị dựng lại — tải lại
 * danh sách kênh, số dư — mỗi lần chuyển trang.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const projectRef = typeof params?.id === "string" ? params.id : undefined;
  return (
    <>
      <Sidebar projectId={projectRef} />
      <div className="min-h-screen lg:pl-60">
        <ProjectInvitationsBanner />
        {children}
      </div>
    </>
  );
}
