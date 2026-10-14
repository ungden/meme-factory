"use client";

import Link from "next/link";
import { useRef } from "react";
import { Check, ImagePlus, RefreshCw, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import JobStatus from "@/components/ui/job-status";
import PriceLine from "@/components/ui/price-line";
import { formatPoints } from "@/lib/format";
import {
  drawCost,
  needsDrawing,
  PACK_STATE_LABEL,
  PACK_VIEW_LABEL,
  PACK_VIEW_ROLE,
  PACK_VIEWS,
  packState,
  type DrawMode,
  type PackCharacter,
} from "./character-pack";

const BADGE: Record<ReturnType<typeof packState>, string> = {
  locked: "th-bg-success-light th-text-success",
  review: "th-bg-warning-light th-text-warning",
  partial: "th-bg-warning-light th-text-warning",
  hasImage: "th-bg-tertiary th-text-muted",
  empty: "th-bg-tertiary th-text-muted",
};

/** Thẻ bộ ảnh của một nhân vật: ba góc, trạng thái, và đúng một việc tiếp theo. */
export default function CharacterPackCard({
  character,
  owner,
  busy,
  working,
  failure,
  pointsPerImage,
  available,
  detailHref,
  onDraw,
  onApprove,
  onUpload,
}: {
  character: PackCharacter;
  owner: boolean;
  busy: boolean;
  working: string;
  failure: string;
  pointsPerImage: number;
  available: number | null;
  /** Bỏ trống khi thẻ đã nằm trên trang chi tiết. */
  detailHref?: string;
  onDraw: (mode: DrawMode) => void;
  onApprove: () => void;
  onUpload: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const state = packState(character);
  const drafts = character.drafts || {};
  const resumable = needsDrawing(character);
  const showImages = state === "locked" || state === "review" || state === "partial";
  const images = PACK_VIEWS.map((view) => ({
    view,
    url: state === "locked" ? character.references[PACK_VIEW_ROLE[view]] || "" : drafts[view]?.url || "",
  }));
  const drawLabel = state === "partial" ? "Vẽ tiếp" : state === "hasImage" ? "Vẽ đủ góc" : "Vẽ nhân vật";
  const name = detailHref ? (
    <Link href={detailHref} className="truncate hover:underline">
      {character.name}
    </Link>
  ) : (
    <span className="truncate">{character.name}</span>
  );

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border th-border th-bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl th-bg-tertiary">
          {character.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app
            <img src={character.avatarUrl} alt={character.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold th-text-primary">
            {name}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[state]}`}>{PACK_STATE_LABEL[state]}</span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs th-text-secondary">{character.description}</p>
        </div>
      </div>

      {showImages && (
        <div className="grid grid-cols-3 gap-2">
          {images.map(({ view, url }) => (
            <figure key={view} className="overflow-hidden rounded-xl th-bg-tertiary">
              <div className="aspect-[3/4]">
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app
                  <img src={url} alt={`${character.name} · ${PACK_VIEW_LABEL[view]}`} className="h-full w-full object-cover" />
                )}
              </div>
              <figcaption className="px-1.5 py-1 text-xs th-text-muted">{PACK_VIEW_LABEL[view]}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {working ? (
        <JobStatus state="working" title={working} />
      ) : failure ? (
        <JobStatus
          state="failed"
          title={resumable ? `Chưa vẽ xong ${character.name}` : "Chưa làm được"}
          detail={resumable ? `${failure} Ảnh đã vẽ xong vẫn được giữ, vẽ tiếp chỉ làm phần còn thiếu.` : failure}
          onRetry={owner && resumable ? () => onDraw("continue") : undefined}
          retryLabel="Vẽ tiếp"
        />
      ) : null}

      {owner && !working && (
        <div className="mt-auto flex flex-col gap-2">
          {state === "review" && (
            <PriceLine points={drawCost(character, "redraw", pointsPerImage)} available={available} note="nếu vẽ lại" />
          )}
          {(state === "empty" || state === "hasImage" || state === "partial") && (
            <PriceLine points={drawCost(character, "continue", pointsPerImage)} available={available} />
          )}
          <div className="flex flex-wrap gap-2">
            {state === "review" && (
              <>
                <Button size="sm" onClick={onApprove} disabled={busy}>
                  <Check size={14} aria-hidden /> Chốt bộ ảnh
                </Button>
                <Button size="sm" variant="outline" onClick={() => onDraw("redraw")} disabled={busy}>
                  <RefreshCw size={14} aria-hidden /> Vẽ lại
                </Button>
              </>
            )}
            {(state === "empty" || state === "hasImage" || state === "partial") && (
              <Button size="sm" onClick={() => onDraw("continue")} disabled={busy}>
                <Sparkles size={14} aria-hidden /> {drawLabel}
              </Button>
            )}
            {state !== "locked" && (
              <>
                <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
                  <ImagePlus size={14} aria-hidden /> Dùng ảnh của bạn
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) onUpload(file);
                  }}
                />
              </>
            )}
            {state === "locked" && detailHref && (
              <Link href={detailHref} className="inline-flex min-h-8 items-center text-sm font-medium th-text-accent underline-offset-2 hover:underline">
                Biểu cảm và ảnh khác
              </Link>
            )}
          </div>
          {state !== "locked" && (
            <p className="text-xs th-text-tertiary">
              Dùng ảnh của bạn thì AIDA vẽ ba góc theo ảnh đó, khoảng {formatPoints(drawCost({ ...character, avatarUrl: "x" }, "fromImage", pointsPerImage))}.
            </p>
          )}
        </div>
      )}
      {!owner && detailHref && state === "locked" && (
        <Link href={detailHref} className="mt-auto inline-flex min-h-8 items-center text-sm font-medium th-text-accent underline-offset-2 hover:underline">
          Biểu cảm và ảnh khác
        </Link>
      )}
    </div>
  );
}
