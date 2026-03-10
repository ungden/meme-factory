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
  { href: "/admin/projects", label: "Dự án", icon: FolderOpen },
  { href: "/admin/ai-logs", label: "AI Logs", icon: Sparkles },
  { href: "/admin/settings", label: "Cấu hình", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
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
      {/* Logo */}
      <div className="p-5 border-b" style={{ borderColor: "var(--border-primary)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <span className="text-lg font-bold th-text-primary">AIDA</span>
            <span className="ml-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
              Admin
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Admin navigation">
        {adminNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all ${
              isActive(item.href)
                ? "font-medium th-bg-accent-light th-text-accent"
                : "th-text-secondary th-bg-hover"
            }`}
          >
            <item.icon size={18} className={isActive(item.href) ? "th-text-accent" : ""} />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t space-y-1" style={{ borderColor: "var(--border-primary)" }}>
        <Link
          href="/projects"
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm th-text-secondary rounded-xl transition-all th-bg-hover"
        >
          <ArrowLeft size={18} />
          Về trang chính
        </Link>
        <button
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Chuyển giao diện tối" : "Chuyển giao diện sáng"}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm th-text-secondary rounded-xl transition-all cursor-pointer th-bg-hover"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          {theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu admin"
        className="fixed top-4 left-4 z-50 p-2.5 rounded-xl md:hidden transition-all"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}
      >
        <Menu size={20} className="th-text-primary" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-72 border-r flex flex-col z-50 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-primary)" }}
        aria-label="Admin menu"
      >
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu"
          className="absolute top-4 right-4 p-1.5 rounded-lg th-bg-hover th-text-muted"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-screen w-64 border-r flex-col z-40 transition-colors duration-200"
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-primary)" }}
        aria-label="Admin menu"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
