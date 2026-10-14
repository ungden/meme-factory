"use client";

import Link from "next/link";
import { CalendarClock, Clapperboard, Film, Images, Loader2, Repeat2, Sparkles } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import Alert from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/page";
import type { FeedItem, FeedStatus } from "@/lib/home-feed";

const STATUS_STYLE: Record<FeedStatus, string> = {
  working: "th-bg-accent-light th-text-accent",
  attention: "th-bg-warning-light th-text-warning",
  ready: "th-bg-success-light th-text-success",
  stopped: "th-bg-tertiary th-text-muted",
};

const KIND_LABEL: Record<FeedItem["kind"], string> = { film: "Phim", video: "Video", meme: "Meme" };
const KIND_ICON: Record<FeedItem["kind"], typeof Clapperboard> = { film: Clapperboard, video: Film, meme: Images };

function Preview({ item }: { item: FeedItem }) {
  if (item.imageUrl)
    // eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ, không qua tối ưu ảnh của Next
    return <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />;
  if (item.videoUrl)
    // Video không có ảnh mở đầu: tải vừa đủ để thấy khung hình đầu, không tự phát.
    return <video src={`${item.videoUrl}#t=0.1`} preload="metadata" muted playsInline aria-label={item.title} className="h-full w-full object-cover" />;
  if (item.status === "working") return <Loader2 size={20} className="animate-spin th-text-accent" aria-hidden />;
  const Icon = KIND_ICON[item.kind];
  return <Icon size={20} className="th-text-muted" aria-hidden />;
}

/** Bài đang làm và vừa xong ở mọi kênh, bài cần người dùng xem đứng đầu. */
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
      <h2 id="feed-title" className="text-base font-semibold th-text-primary">Gần đây</h2>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-44" />)}
        </div>
      ) : failed && !items.length ? (
        <Alert tone="warning">Chưa tải được danh sách. Trang sẽ thử lại sau ít phút.</Alert>
      ) : !items.length ? (
        <EmptyState icon={Sparkles} title="Chưa có bài nào" hint="Gõ một ý tưởng ở trên, xong bài sẽ hiện ở đây." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="group flex flex-col overflow-hidden rounded-2xl border th-border th-bg-card transition-all hover:-translate-y-0.5 hover:th-shadow-md">
              <Link href={item.href} className="flex flex-1 flex-col">
                <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden th-bg-tertiary">
                  <Preview item={item} />
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-md ${STATUS_STYLE[item.status]}`}>
                    {item.label}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-medium th-text-primary">{item.title}</p>
                  <p className="mt-auto flex items-center gap-1 truncate text-xs th-text-muted">
                    {KIND_LABEL[item.kind]} · {item.projectName}
                    {item.scheduled && <CalendarClock size={12} className="shrink-0" aria-label="Theo lịch" />}
                  </p>
                </div>
              </Link>
              {item.status === "ready" && (
                <button
                  type="button"
                  onClick={() => onRemix(item)}
                  className="flex min-h-9 items-center justify-center gap-1.5 border-t th-border text-xs font-medium th-text-accent th-bg-hover"
                >
                  <Repeat2 size={14} aria-hidden /> Làm bài tương tự
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
