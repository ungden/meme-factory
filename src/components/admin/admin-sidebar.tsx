"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Receipt,
  FolderOpen,
  Sparkles,
  Settings,
  ArrowLeft,
  Shield,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

const adminNav = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/users", label: "Người dùng", icon: Users },
  { href: "/admin/transactions", label: "Giao dịch", icon: Receipt },
  { href: "/admin/projects", label: "Kênh", icon: FolderOpen },
  { href: "/admin/ai-logs", label: "Lượt gọi AI", icon: Sparkles },
  { href: "/admin/settings", label: "Cấu hình", icon: Settings },
];

/**
 * Cùng mốc `lg` và bề rộng `w-60` với thanh bên của chủ kênh, để PageContainer
 * (chừa chỗ cho nút menu tới tận `lg`) dùng được nguyên cho trang quản trị.
 */
export default function AdminSidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpenPath, setMobileOpenPath] = useState<string | null>(null);
  const mobileOpen = mobileOpenPath === pathname;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpenPath(null);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      <div className="border-b p-5 th-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl th-btn-primary">
            <Shield size={16} />
          </div>
          <div>
            <span className="text-lg font-bold th-text-primary">AIDA</span>
            <span className="ml-1.5 rounded-md px-2 py-0.5 text-xs font-semibold th-bg-danger-light th-text-danger">
              Quản trị
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menu quản trị">
        {adminNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpenPath(null)}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all lg:min-h-9 ${
              isActive(item.href)
                ? "font-medium th-bg-accent-light th-text-accent"
                : "th-text-secondary th-bg-hover"
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-1 border-t p-3 th-border">
        <Link
          href="/projects"
          onClick={() => setMobileOpenPath(null)}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm th-text-secondary transition-all th-bg-hover lg:min-h-9"
        >
          <ArrowLeft size={16} />
          Về trang chính
        </Link>
        <button
          onClick={toggleTheme}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm th-text-secondary transition-all th-bg-hover lg:min-h-9"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          {theme === "light" ? "Nền tối" : "Nền sáng"}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpenPath(pathname)}
        aria-label="Mở menu"
        className="fixed left-4 top-4 z-50 rounded-xl border p-2.5 transition-all th-bg-card th-border th-shadow-sm lg:hidden"
      >
        <Menu size={20} className="th-text-primary" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 th-bg-overlay backdrop-blur-sm lg:hidden" onClick={() => setMobileOpenPath(null)} aria-hidden="true" />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-[100dvh] w-72 flex-col border-r transition-transform duration-300 th-bg-sidebar th-border lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu quản trị"
      >
        <button
          onClick={() => setMobileOpenPath(null)}
          aria-label="Đóng menu"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg th-bg-hover th-text-muted"
        >
          <X size={16} />
        </button>
        {sidebarContent}
      </aside>

      <aside
        className="fixed left-0 top-0 z-40 hidden h-[100dvh] w-60 flex-col border-r transition-colors duration-200 th-bg-sidebar th-border lg:flex"
        aria-label="Menu quản trị"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
