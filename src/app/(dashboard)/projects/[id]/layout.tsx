"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import Sidebar from "@/components/layout/sidebar";

/**
 * Khung chung cho mọi trang bên trong một dự án.
 *
 * Trước đây từng trang tự import Sidebar, nên trang nào quên thì người dùng rơi
 * vào ngõ cụt — `/short-films`, lối vào chính của tính năng làm phim, là đúng
 * một trang như vậy. Sidebar là `fixed` nên chỉ cần dựng một lần ở đây, và
 * phần chừa chỗ cho nó (`lg:pl-56`) cũng về một chỗ thay vì lặp lại trong từng
 * trang — mỗi lần lặp lại là một chỗ có thể quên.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const projectRef = typeof params?.id === "string" ? params.id : "";
  return (
    <>
      <Sidebar projectId={projectRef} />
      <div className="min-h-screen lg:pl-56">{children}</div>
    </>
  );
}
