"use client";

import Link from "next/link";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { SiteLogo } from "./site-logo";
import { useSignedIn } from "./use-signed-in";

const LINKS = [
  { href: "/#how", label: "Cách làm", className: "lg:inline-flex" },
  { href: "/pricing", label: "Bảng giá", className: "md:inline-flex" },
  { href: "/help", label: "Hỗ trợ", className: "lg:inline-flex" },
];

export default function SiteHeader() {
  const { theme, toggleTheme } = useTheme();
  const { ready, signedIn, appHref } = useSignedIn();

  return (
    <nav className="media-nav sticky top-0 z-50">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:th-ring-accent" aria-label="AIDA — trang chủ">
          <SiteLogo />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={`media-nav-link hidden rounded-full px-3.5 py-2 text-sm font-medium ${link.className}`}>
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={toggleTheme}
            className="media-nav-link inline-flex h-10 w-10 items-center justify-center rounded-full"
            aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {ready && !signedIn && (
            <Link href="/login" className="media-nav-link hidden rounded-full px-3.5 py-2 text-sm font-medium sm:inline-flex">
              Đăng nhập
            </Link>
          )}
          <Link href={appHref} className="media-primary-button inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold">
            <span className="hidden sm:inline">{ready && signedIn ? "Kênh của tôi" : "Dùng thử miễn phí"}</span>
            <span className="sm:hidden">{ready && signedIn ? "Kênh" : "Bắt đầu"}</span>
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </nav>
  );
}
