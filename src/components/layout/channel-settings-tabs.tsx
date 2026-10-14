"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const TABS = [
  { path: "brand", label: "Dấu kênh" },
  { path: "members", label: "Thành viên" },
  { path: "wallet", label: "Điểm của kênh" },
];

/** Ba trang lặt vặt của một kênh gom về một mục "Cài đặt kênh" trên thanh bên. */
export default function ChannelSettingsHeader({ description }: { description: string }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/projects/${params.id}`;
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight th-text-primary">Cài đặt kênh</h1>
      <nav aria-label="Cài đặt kênh" className="mt-4 flex gap-1 overflow-x-auto border-b th-border">
        {TABS.map((tab) => {
          const href = `${base}/${tab.path}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.path}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                active ? "border-[var(--accent)] font-medium th-text-primary" : "border-transparent th-text-tertiary hover:th-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-4 text-sm th-text-tertiary">{description}</p>
    </header>
  );
}
