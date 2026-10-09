"use client";

import Link from "next/link";
import { CalendarClock, Clapperboard, Images, Loader2, Repeat2 } from "lucide-react";
import type { FeedItem, FeedStatus } from "@/lib/home-feed";

const STATUS_STYLE: Record<FeedStatus, string> = {
  working: "th-bg-accent-light th-text-accent",
  attention: "th-bg-warning-light th-text-warning",
  ready: "th-bg-success-light th-text-success",
  stopped: "th-bg-tertiary th-text-muted",
};

/** Việc AI đang làm và vừa xong ở mọi kênh, việc cần người dùng xem đứng đầu. */
export default function HomeFeedList({
  items,
  loading,
  failed,
  onRemix,
}: {
  items: FeedItem[];
  loading: boolean;
  failed: boolean;
  onRemix: (item: FeedItem) => void;
}) {
  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3">
      <h2 id="feed-title" className="text-lg font-semibold th-text-primary">Việc của AI</h2>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-44 animate-pulse rounded-xl th-bg-card" />)}
        </div>
      ) : failed && !items.length ? (
        <p className="text-sm th-text-secondary">Chưa tải được danh sách. Trang sẽ thử lại sau ít phút.</p>
      ) : !items.length ? (
        <p className="rounded-xl border border-dashed th-border px-4 py-6 text-center text-sm th-text-secondary">
          Chưa có gì. Gõ một ý tưởng ở trên, AI làm xong sẽ đưa kết quả về đây.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="flex flex-col overflow-hidden rounded-xl border th-border th-bg-card transition hover:th-border-accent">
              <Link href={item.href} className="flex flex-1 flex-col">
                <div className="relative flex aspect-[4/3] items-center justify-center th-bg-tertiary">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ảnh meme nằm ở kho lưu trữ, không qua tối ưu ảnh của Next
                    <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : item.status === "working" ? (
                    <Loader2 className="h-7 w-7 animate-spin th-text-accent" aria-hidden />
                  ) : item.kind === "film" ? (
                    <Clapperboard className="h-7 w-7 th-text-muted" aria-hidden />
                  ) : (
                    <Images className="h-7 w-7 th-text-muted" aria-hidden />
                  )}
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[item.status]}`}>
                    {item.label}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-medium th-text-primary">{item.title}</p>
                  <p className="mt-auto flex items-center gap-1 truncate text-xs th-text-muted">
                    {item.kind === "film" ? "Phim" : "Meme"} · {item.projectName}
                    {item.scheduled && <CalendarClock size={12} className="shrink-0" aria-label="Tự làm theo lịch" />}
                  </p>
                </div>
              </Link>
              {item.status === "ready" && (
                <button
                  type="button"
                  onClick={() => onRemix(item)}
                  className="flex min-h-9 items-center justify-center gap-1.5 border-t th-border text-xs font-medium th-text-accent th-bg-hover"
                >
                  <Repeat2 size={14} aria-hidden /> Làm thêm kiểu này
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
