"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  FolderOpen,
  Sparkles,
  Users,
  Image,
  LogOut,
  Zap,
  ChevronLeft,
  Sun,
  Moon,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { IS_MOCK_MODE } from "@/lib/use-store";
import { useWallet } from "@/contexts/WalletContext";
import { Coins, Shield } from "lucide-react";

interface SidebarProps {
  projectId?: string;
  projectName?: string;
}

export default function Sidebar({ projectId, projectName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { points, isLoading: walletLoading } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Check admin role
  useEffect(() => {
    if (IS_MOCK_MODE) return;
    const checkAdmin = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
        setIsAdmin(data?.role === "admin");
      } catch { /* ignore */ }
    };
    checkAdmin();
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      if (!IS_MOCK_MODE) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
    } catch {
      // Ignore and force navigation to login
    } finally {
      // Hard navigation clears all client state and lets middleware handle clean redirect
      window.location.href = "/login";
    }
  };

  const mainNav = [
    { href: "/projects", label: "Tất cả dự án", icon: FolderOpen },
    { href: "/wallet", label: "Ví tiền", icon: Wallet },
  ];

  const projectNav = projectId
    ? [
        { href: `/projects/${projectId}`, label: "Tổng quan", icon: Sparkles },
        { href: `/projects/${projectId}/characters`, label: "Nhân vật", icon: Users },
        { href: `/projects/${projectId}/generate`, label: "Tạo Meme", icon: Zap },
        { href: `/projects/${projectId}/gallery`, label: "Bộ sưu tập", icon: Image },
      ]
    : [];

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-5 border-b" style={{ borderColor: "var(--border-primary)" }}>
        <Link href="/projects" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold th-text-primary">AIDA</span>
        </Link>
      </div>

      {/* Point Balance */}
      <Link
        href="/wallet"
        className="mx-3 mt-3 flex items-center justify-between px-3 py-2.5 rounded-xl transition-all th-bg-hover"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
            <Coins size={14} className="text-white" />
          </div>
          <span className="text-sm font-medium th-text-secondary">Points</span>
        </div>
        <span className="text-sm font-bold th-text-primary">
          {walletLoading ? "..." : points.toLocaleString("vi-VN")}
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Điều hướng chính">
        {projectId && (
          <>
            <Link
              href="/projects"
              className="flex items-center gap-2 px-3 py-2 text-sm th-text-muted transition-colors th-bg-hover rounded-xl"
            >
              <ChevronLeft size={16} />
              Tất cả dự án
            </Link>
            <div className="px-3 py-2">
              <p className="text-xs th-text-muted uppercase tracking-wider">Dự án</p>
              <p className="text-sm font-medium th-text-primary truncate mt-0.5">{projectName || "..."}</p>
            </div>
            <div className="h-px my-2" style={{ background: "var(--border-primary)" }} />
          </>
        )}

        {!projectId &&
          mainNav.map((item) => (
            <NavItem key={item.href} {...item} active={pathname === item.href} />
          ))}

        {projectNav.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        {/* Ví tiền — luôn hiển thị */}
        {projectId && (
          <>
            <div className="h-px my-2" style={{ background: "var(--border-primary)" }} />
            <NavItem href="/wallet" label="Ví tiền" icon={Wallet} active={pathname === "/wallet"} />
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t space-y-1" style={{ borderColor: "var(--border-primary)" }}>
        {isAdmin && (
          <Link
            href="/admin"
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all th-bg-hover"
            style={{ color: "#ef4444" }}
          >
            <Shield size={18} />
            Quản trị
          </Link>
        )}
        <button
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Chuyển giao diện tối" : "Chuyển giao diện sáng"}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm th-text-secondary rounded-xl transition-all cursor-pointer th-bg-hover"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          {theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
        </button>

        <button
          onClick={handleSignOut}
          aria-label="Đăng xuất"
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all cursor-pointer th-text-danger th-bg-hover"
        >
          <LogOut size={18} />
          {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu"
        className="fixed top-4 left-4 z-50 p-2.5 rounded-xl md:hidden transition-all"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}
      >
        <Menu size={20} className="th-text-primary" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-72 border-r flex flex-col z-50 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-primary)" }}
        aria-label="Menu điều hướng"
      >
        {/* Close button */}
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
        aria-label="Menu điều hướng"
      >
        {sidebarContent}
      </aside>
    </>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all ${
        active
          ? "font-medium th-bg-accent-light th-text-accent"
          : "th-text-secondary th-bg-hover"
      }`}
    >
      <Icon size={18} className={active ? "th-text-accent" : ""} />
      {label}
    </Link>
  );
}
