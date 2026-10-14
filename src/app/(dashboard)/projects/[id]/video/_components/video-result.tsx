"use client";

import Link from "next/link";
import { Download, Film, FolderOpen, Plus } from "lucide-react";
import Card from "@/components/ui/card";
import Button, { buttonClasses } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import JobStatus from "@/components/ui/job-status";
import type { VideoStatus, VideoView } from "./video-flow";

/** Khung bên phải: video đang làm, video xong để tải, hoặc lý do hỏng. */
export default function VideoResult({
  status,
  view,
  galleryHref,
  onRetry,
  onNew,
}: {
  status: VideoStatus | null;
  view: VideoView | null;
  galleryHref: string;
  onRetry: () => void;
  onNew: () => void;
}) {
  const output = status?.output;
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="text-base font-semibold th-text-primary">Video của kênh</h2>
      {!view || !output ? (
        <EmptyState
          icon={Film}
          title="Video sẽ hiện ở đây"
          hint="Tả video rồi bấm Làm video. Xong là tải về được, và video cũng nằm trong Thư viện."
        />
      ) : (
        <>
          {view.state !== "done" && (
            <JobStatus
              state={view.state}
              title={view.title}
              detail={view.detail}
              refundedPoints={view.state === "failed" ? view.refundedPoints : undefined}
              onRetry={view.state === "failed" ? onRetry : undefined}
            />
          )}
          {view.state === "done" && output.media_url ? (
            <>
              <video
                controls
                playsInline
                className="max-h-[70vh] w-full rounded-xl bg-black"
                poster={output.poster_url && /^https:\/\//.test(output.poster_url) ? output.poster_url : undefined}
                src={`/api/content-outputs/${output.id}/media`}
              />
              <div className="flex flex-wrap gap-2">
                {/* Đích cuối của người dùng là một tệp để đăng lên fanpage. */}
                <a href={`/api/content-outputs/${output.id}/media?download=1`} download className={buttonClasses("primary", "md")}>
                  <Download size={16} aria-hidden /> Tải video
                </a>
                <Link href={galleryHref} className={buttonClasses("outline", "md")}>
                  <FolderOpen size={16} aria-hidden /> Mở thư viện
                </Link>
                <Button variant="ghost" onClick={onNew}>
                  <Plus size={16} aria-hidden /> Làm video khác
                </Button>
              </div>
              {output.caption && (
                <div className="rounded-xl th-bg-tertiary p-3">
                  <p className="text-xs font-medium th-text-tertiary">Nội dung bài đăng</p>
                  <p className="mt-1 whitespace-pre-line text-sm th-text-primary">{output.caption}</p>
                </div>
              )}
            </>
          ) : view.state === "working" ? (
            <div className="flex aspect-[9/14] max-h-[60vh] items-center justify-center overflow-hidden rounded-xl th-bg-tertiary">
              {output.poster_url && /^https:\/\//.test(output.poster_url) ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh mở đầu nằm ở kho lưu trữ của app
                <img src={output.poster_url} alt="Ảnh mở đầu" className="h-full w-full object-cover opacity-60" />
              ) : (
                <Film size={20} className="th-text-muted" aria-hidden />
              )}
            </div>
          ) : null}
          {view.state === "working" && (
            <Button variant="ghost" size="sm" className="self-start" onClick={onNew}>
              <Plus size={14} aria-hidden /> Làm thêm video khác trong lúc chờ
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
