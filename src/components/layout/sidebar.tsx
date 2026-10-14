"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  Coins,
  Film,
  HelpCircle,
  House,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { IS_MOCK_MODE, useProjects } from "@/lib/use-store";
import NotificationBell from "@/components/layout/notification-bell";
import { useWallet } from "@/contexts/WalletContext";
import { clearClientCache, fetchJsonCached } from "@/lib/client-fetch";
import { getProjectRouteRef } from "@/lib/project-visuals";

type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Trang con khác đường dẫn nhưng thuộc cùng mục. */
  aliases?: string[];
  exact?: boolean;
};

/** Các mục của một kênh, theo đúng thứ tự làm việc: làm nội dung, rồi tới kho. */
export function channelNav(ref: string): NavLink[] {
  const base = `/projects/${ref}`;
  return [
    { href: base, label: "Tổng quan", icon: LayoutDashboard, exact: true },
    { href: `${base}/short-films`, label: "Phim ngắn", icon: Clapperboard, aliases: [`${base}/video/multiscene`] },
    {
      href: `${base}/generate`,
      label: "Meme",
      icon: Sparkles,
      aliases: [`${base}/studio`, `${base}/editor`, `${base}/ai-meme`, `${base}/templates`],
    },
    // Chỉ đúng trang video lẻ: /video/multiscene thuộc Phim ngắn.
    { href: `${base}/video`, label: "Video", icon: Film, exact: true },
    { href: `${base}/characters`, label: "Nhân vật", icon: Users, aliases: [`${base}/mascots`] },
    { href: `${base}/gallery`, label: "Thư viện", icon: Image },
    {
      href: `${base}/brand`,
      label: "Cài đặt kênh",
      icon: Settings2,
      aliases: [`${base}/members`, `${base}/wallet`],
    },
  ];
}

/**
 * Một thanh bên cho mọi trang sau đăng nhập.
 *
 * Trước đây trang chính có hai mục, còn vào một kênh thì thanh bên đổi hẳn sang
 * mười hai mục chia bốn nhóm — người dùng tưởng mình vừa sang một app khác. Giờ
 * khung luôn giống nhau: Trang chính, danh sách kênh, và kênh đang mở xổ ra các
 * mục của nó ngay dưới tên kênh.
 */
export default function Sidebar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { points, isLoading: walletLoading } = useWallet();
  const { projects, loading: projectsLoading, reload } = useProjects();
  const [projectPoints, setProjectPoints] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const current = projectId
    ? projects.find((project) => project.id === projectId || getProjectRouteRef(project) === projectId)
    : undefined;

  // Thanh bên sống ở khung chung nên không tải lại khi đổi trang; kênh vừa tạo
  // chưa có trong danh sách thì tải lại một lần.
  useEffect(() => {
    if (projectId && !projectsLoading && !current) void reload();
  }, [projectId, projectsLoading, current, reload]);

  useEffect(() => {
    if (IS_MOCK_MODE) return;
    const checkAdmin = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
        setIsAdmin(data?.role === "admin");
      } catch {
        /* ignore */
      }
    };
    void checkAdmin();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const fetchProjectPoints = async () => {
      if (!projectId) return setProjectPoints(null);
      if (IS_MOCK_MODE) return setProjectPoints(0);
      try {
        const data = await fetchJsonCached<{ points?: number }>(`/api/projects/${projectId}/wallet`, 15_000);
        if (active) setProjectPoints(Number(data.points || 0));
      } catch {
        // Không có số dư kênh thì vẫn hiện số dư tài khoản.
      }
    };
    void fetchProjectPoints();
    const changed = () => void fetchProjectPoints();
    window.addEventListener("aida:project-balance-changed", changed);
    return () => {
      active = false;
      window.removeEventListener("aida:project-balance-changed", changed);
    };
  }, [projectId]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      if (!IS_MOCK_MODE) {
        await createClient().auth.signOut();
        clearClientCache();
      }
    } catch {
      // Lỗi gì cũng về trang đăng nhập.
    } finally {
      window.location.href = "/login";
    }
  };

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <Link href="/projects" className="flex min-h-11 items-center gap-2.5 lg:min-h-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
            style={{ backgroundImage: "var(--accent-gradient)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25), 0 6px 16px -6px var(--accent-shadow)" }}
          >
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-[17px] font-semibold tracking-[-0.03em] th-text-primary">AIDA</span>
        </Link>
        <span className="hidden lg:block">
          <NotificationBell />
        </span>
      </div>

      <Link
        href="/wallet"
        className="mx-3 mt-2 flex items-center justify-between rounded-xl border px-3 py-2 transition-colors th-border th-bg-card th-bg-hover"
      >
        <span className="flex items-center gap-2 text-[13px] th-text-secondary">
          <Coins size={15} className="th-text-accent" />
          Điểm
        </span>
        {/* Một số dư duy nhất. Ví kênh và ví cá nhân vẫn là hai sổ phía sau,
            nhưng hệ thống tự chuyển khi tạo nội dung, nên hiện hai con số chỉ
            khiến người dùng tưởng mình hết điểm trong khi tài khoản còn tiền. */}
        <span className="text-[13px] font-semibold tabular-nums th-text-primary">
          {walletLoading || (projectId && projectPoints === null)
            ? "…"
            : (points + (projectId ? (projectPoints ?? 0) : 0)).toLocaleString("vi-VN")}
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Điều hướng chính">
        <NavItem href="/projects" label="Trang chính" icon={House} active={pathname === "/projects"} />

        <div className="flex items-center justify-between px-3 pb-1 pt-5">
          <span className="text-[11px] font-medium th-text-muted">Kênh</span>
          <Link
            href="/projects/new"
            aria-label="Tạo kênh mới"
            className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md th-text-muted th-bg-hover"
          >
            <Plus size={14} />
          </Link>
        </div>

        {projectsLoading && !projects.length ? (
          <div className="space-y-1 px-3 py-1" aria-hidden>
            {[1, 2].map((item) => (
              <div key={item} className="h-7 animate-pulse rounded-md th-bg-tertiary" />
            ))}
          </div>
        ) : !projects.length ? (
          <Link href="/projects/new" className="block rounded-lg px-3 py-2 text-[13px] th-text-accent th-bg-hover">
            Tạo kênh đầu tiên
          </Link>
        ) : (
          projects.map((project) => {
            const ref = getProjectRouteRef(project);
            const open = project === current;
            return (
              <div key={project.id}>
                <Link
                  href={`/projects/${ref}`}
                  aria-current={open && pathname === `/projects/${ref}` ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors lg:min-h-9 ${
                    open ? "font-medium th-text-primary" : "th-text-secondary th-bg-hover"
                  }`}
                >
                  <ChannelBadge name={project.name} />
                  <span className="flex-1 truncate">{project.name}</span>
                </Link>
                {open && (
                  <div className="mb-2 ml-[22px] mt-0.5 space-y-0.5 border-l pl-2 th-border">
                    {channelNav(projectId!).map((item) => (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        active={item.exact ? pathname === item.href : isNavActive(pathname, item.href, item.aliases)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      <div className="space-y-0.5 border-t px-3 py-3" style={{ borderColor: "var(--border-primary)" }}>
        {isAdmin && <FooterLink href="/admin" icon={Shield} label="Quản trị" danger />}
        <FooterLink href="/settings" icon={Settings} label="Tài khoản" />
        <FooterLink href="/help" icon={HelpCircle} label="Trợ giúp" />
        <button
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Chuyển giao diện tối" : "Chuyển giao diện sáng"}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] th-text-secondary transition-all th-bg-hover lg:min-h-9"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          {theme === "light" ? "Nền tối" : "Nền sáng"}
        </button>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] th-text-secondary transition-all th-bg-hover lg:min-h-9"
        >
          <LogOut size={16} />
          {signingOut ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="fixed right-4 top-4 z-50 lg:hidden">
        <NotificationBell />
      </div>

      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu"
        className="fixed left-4 top-4 z-50 rounded-xl p-2.5 transition-all th-shadow-sm lg:hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}
      >
        <Menu size={20} className="th-text-primary" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 th-bg-overlay backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-[100dvh] w-72 flex-col border-r transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-primary)" }}
        aria-label="Menu điều hướng"
      >
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg th-bg-hover th-text-muted"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      <aside
        className="fixed left-0 top-0 z-40 hidden h-[100dvh] w-60 flex-col border-r transition-colors duration-200 lg:flex"
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

export function ChannelBadge({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-semibold text-white ${
        size === "lg" ? "h-11 w-11 rounded-xl text-sm" : "h-5 w-5 rounded-md text-[10px]"
      }`}
      style={{ backgroundImage: "var(--accent-gradient)" }}
    >
      {name.trim().slice(0, size === "lg" ? 2 : 1).toLocaleUpperCase("vi")}
    </span>
  );
}

function FooterLink({
  href,
  icon: Icon,
  label,
  danger,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all th-bg-hover lg:min-h-9 ${
        danger ? "th-text-danger" : "th-text-secondary"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

function NavItem({ href, label, icon: Icon, active }: Omit<NavLink, "aliases" | "exact"> & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors lg:min-h-9 ${
        active ? "font-medium th-text-primary" : "th-text-secondary th-bg-hover"
      }`}
      style={active ? { background: "var(--bg-hover)", boxShadow: "inset 0 0 0 1px var(--border-primary)" } : undefined}
    >
      <Icon size={16} className={active ? "th-text-accent" : "th-text-tertiary"} />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}
