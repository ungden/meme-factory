"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { IS_MOCK_MODE } from "@/lib/use-store";

interface SidebarProps {
  projectId?: string;
  projectName?: string;
}

export default function Sidebar({ projectId, projectName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async () => {
    if (!IS_MOCK_MODE) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
  };

  const mainNav = [
    { href: "/projects", label: "Tất cả dự án", icon: FolderOpen },
  ];

  const projectNav = projectId
    ? [
        { href: `/projects/${projectId}`, label: "Tổng quan", icon: Sparkles },
        { href: `/projects/${projectId}/characters`, label: "Nhân vật", icon: Users },
        { href: `/projects/${projectId}/generate`, label: "Tạo Meme", icon: Zap },
        { href: `/projects/${projectId}/gallery`, label: "Bộ sưu tập", icon: Image },
      ]
    : [];

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-64 border-r flex flex-col z-40 transition-colors duration-200"
      style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-primary)" }}
    >
      {/* Logo */}
      <div className="p-5 border-b" style={{ borderColor: "var(--border-primary)" }}>
        <Link href="/projects" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold th-text-primary">Meme Factory</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
      </nav>

      {/* Footer */}
      <div className="p-3 border-t space-y-1" style={{ borderColor: "var(--border-primary)" }}>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm th-text-secondary rounded-xl transition-all cursor-pointer th-bg-hover"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          {theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
        </button>

        {/* Settings page - coming soon */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all cursor-pointer th-text-danger th-bg-hover"
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </div>
    </aside>
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
