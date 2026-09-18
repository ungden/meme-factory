"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { timeAgo, type NotificationItem } from "@/lib/notifications";
import { IS_MOCK_MODE } from "@/lib/use-store";

/** Một tập phim dừng lại giữa chừng thì càng biết sớm càng đỡ mất thời gian chờ. */
const POLL_MS = 60_000;

/**
 * Chuông "có gì đang đợi tôi không?".
 *
 * Phim chạy 30–45 phút và dừng khi cần một quyết định của người dùng. Trước đây
 * chỉ có đúng một cách biết: tự mở từng dự án ra xem. Chuông này gom mọi việc
 * đang chờ trên tất cả dự án vào một chỗ.
 */
export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (IS_MOCK_MODE) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        // Chưa đăng nhập thì không có gì để hiện, và hỏi lại mỗi phút chỉ tạo
        // một dòng 401 mỗi phút trong log của cả hai phía.
        if (response.status === 401) {
          window.clearInterval(timer);
          return;
        }
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        // Mất mạng thì giữ nguyên danh sách cũ; chuông không phải chỗ báo lỗi mạng.
      }
    };
    // Lần đầu cũng qua hàng đợi tác vụ: gọi thẳng trong thân effect sẽ đặt state
    // ngay trong lượt render đầu tiên.
    const timer = window.setInterval(load, POLL_MS);
    const first = window.setTimeout(load, 0);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // Bấm ra ngoài thì đóng — trên điện thoại panel che gần hết màn hình.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={items.length ? `Thông báo, ${items.length} việc đang chờ` : "Thông báo"}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg th-text-secondary th-bg-hover lg:h-9 lg:w-9"
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span
            className="absolute right-1 top-1 min-w-4 rounded-full px-1 text-[10px] font-bold leading-4 text-white"
            style={{ background: "var(--danger)" }}
          >
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Việc đang chờ bạn"
          className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border shadow-xl"
          style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
        >
          {items.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm th-text-tertiary">
              <Check size={15} /> Không có gì đang chờ bạn.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border-primary)" }}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 th-bg-hover"
                  >
                    <p className="text-sm font-medium th-text-primary">{item.title}</p>
                    <p className="mt-0.5 text-xs th-text-tertiary">{item.detail}</p>
                    <p className="mt-1 text-[11px] th-text-muted">{timeAgo(item.at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
