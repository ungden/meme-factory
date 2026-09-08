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
  ChevronLeft,
  Sun,
  Moon,
  Menu,
  X,
  Wallet,
  UserPlus,
  Palette,
  Clapperboard,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { useTheme } from "@/components/theme-provider";
import { IS_MOCK_MODE } from "@/lib/use-store";
import { useWallet } from "@/contexts/WalletContext";
import { Coins, Shield } from "lucide-react";
import { clearClientCache, fetchJsonCached } from "@/lib/client-fetch";

interface SidebarProps {
  projectId?: string;
  projectName?: string;
}

export default function Sidebar({ projectId, projectName }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { points, isLoading: walletLoading } = useWallet();
  const [projectPoints, setProjectPoints] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);

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

  // Load project wallet points when inside a project
  useEffect(() => {
    const fetchProjectPoints = async () => {
      if (!projectId) {
        setProjectPoints(null);
        return;
      }
      if (IS_MOCK_MODE) {
        setProjectPoints(0);
        return;
      }
      try {
        const data = await fetchJsonCached<{ points?: number }>(`/api/projects/${projectId}/wallet`, 15_000);
        setProjectPoints(Number(data.points || 0));
      } catch {
        // ignore
      }
    };
    fetchProjectPoints();
  }, [projectId]);

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
        clearClientCache();
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

  // Grouped so the free paths read first and the paid ones are visibly separate.
  const projectPrimaryNav = projectId
    ? [{ href: `/projects/${projectId}`, label: "Tổng quan", icon: Sparkles }]
    : [];

  const projectCreateNav = projectId
    ? [
        {
          href: `/projects/${projectId}/generate`,
          label: "Tạo ảnh",
          icon: Sparkles,
          aliases: [`/projects/${projectId}/studio`, `/projects/${projectId}/editor`, `/projects/${projectId}/ai-meme`],
        },
        { href: `/projects/${projectId}/video`, label: "Tạo video", icon: Clapperboard },
      ]
    : [];

  const projectLibraryNav = projectId
    ? [
        { href: `/projects/${projectId}/gallery`, label: "Nội dung đã lưu", icon: Image, aliases: [`/projects/${projectId}/templates`] },
        { href: `/projects/${projectId}/mascots`, label: "Nhân vật", icon: Users, aliases: [`/projects/${projectId}/characters`] },
      ]
    : [];

  const projectManagementNav = projectId
    ? [
        { href: `/projects/${projectId}/brand`, label: "Thương hiệu", icon: Palette },
        { href: `/projects/${projectId}/members`, label: "Thành viên", icon: UserPlus },
        { href: `/projects/${projectId}/wallet`, label: "Điểm dự án", icon: Coins },
      ]
    : [];

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--border-primary)" }}>
        <Link href="/projects" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white th-shadow-sm" style={{ background: "var(--accent)" }}>
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <span className="block text-[18px] font-extrabold leading-none tracking-[-0.04em] th-text-primary">AIDA</span>
            <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.2em] th-text-muted">Media Studio</span>
          </div>
        </Link>
      </div>

      {/* Point Balance */}
      <Link
        href={projectId ? `/projects/${projectId}/wallet` : "/wallet"}
        className="mx-3 mt-3 flex items-center justify-between rounded-lg px-3 py-2 transition-colors th-bg-hover"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg th-bg-accent-light th-text-accent">
            <Coins size={14} />
          </div>
          <span className="text-sm font-medium th-text-secondary">{projectId ? "Điểm dự án" : "Điểm"}</span>
        </div>
        <span className="text-sm font-bold th-text-primary">
          {projectId ? (projectPoints === null ? "..." : projectPoints.toLocaleString("vi-VN")) : (walletLoading ? "..." : points.toLocaleString("vi-VN"))}
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Điều hướng chính">
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

        {projectPrimaryNav.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname === item.href} />
        ))}

        {projectId && (
          <>
            <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] th-text-muted">Tạo</div>
            {projectCreateNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isNavActive(pathname, item.href, item.aliases)}
              />
            ))}

            <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] th-text-muted">Thư viện</div>
            {projectLibraryNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isNavActive(pathname, item.href, item.aliases)}
              />
            ))}
          </>
        )}

        {projectId && (
          <>
            <button
              type="button"
              aria-expanded={managementOpen}
              onClick={() => setManagementOpen((open) => !open)}
              className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] th-text-muted th-bg-hover"
            >
              Quản lý <ChevronDown size={14} className={managementOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {managementOpen && projectManagementNav.map((item) => (
              <NavItem key={item.href} {...item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
            ))}
          </>
        )}

        {/* Ví tiền — luôn hiển thị */}
        {projectId && (
          <>
            <div className="h-px my-2" style={{ background: "var(--border-primary)" }} />
            <NavItem href="/wallet" label="Ví tiền" icon={Wallet} active={pathname === "/wallet"} />
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t p-3" style={{ borderColor: "var(--border-primary)" }}>
        {isAdmin && (
          <Link
            href="/admin"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all th-text-danger th-bg-hover"
          >
            <Shield size={18} />
            Quản trị
          </Link>
        )}
        <button
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Chuyển giao diện tối" : "Chuyển giao diện sáng"}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm th-text-secondary transition-all cursor-pointer th-bg-hover"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          {theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
        </button>

        <button
          onClick={handleSignOut}
          aria-label="Đăng xuất"
          disabled={signingOut}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all cursor-pointer th-text-danger th-bg-hover"
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
        className="fixed top-4 left-4 z-50 rounded-lg p-2.5 lg:hidden transition-all"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}
      >
        <Menu size={20} className="th-text-primary" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed left-0 top-0 h-[100dvh] w-72 border-r flex flex-col z-50 transition-transform duration-300 lg:hidden ${
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
        className="fixed left-0 top-0 z-40 hidden h-[100dvh] w-56 flex-col border-r transition-colors duration-200 lg:flex"
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-primary)" }}
        aria-label="Menu điều hướng"
      >
        {sidebarContent}
      </aside>
    </>
  );
}

function isNavActive(pathname: string, href: string, aliases?: string[]) {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  return aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false;
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
        active
          ? "font-medium th-bg-accent-light th-text-accent"
          : "th-text-secondary th-bg-hover"
      }`}
    >
      <Icon size={18} className={active ? "th-text-accent" : ""} />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] th-bg-tertiary th-text-tertiary">{badge}</span>
      )}
    </Link>
  );
}
