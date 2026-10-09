import Link from "next/link";
import { SiteLogo } from "./site-logo";

const LINKS = [
  { href: "/pricing", label: "Bảng giá" },
  { href: "/help", label: "Hỗ trợ" },
  { href: "/terms", label: "Điều khoản sử dụng" },
  { href: "/privacy", label: "Chính sách bảo mật" },
];

export default function SiteFooter() {
  return (
    <footer className="media-footer border-t">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-8 text-sm sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-1.5">
          <SiteLogo />
          <p className="th-text-tertiary">Nội dung AI đều đặn cho kênh của bạn.</p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="th-text-secondary underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
