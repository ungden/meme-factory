"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Film, ImageUp, Play, RotateCcw, Save, Sparkles } from "lucide-react";
import type {
  FilmSegmentPatch,
  FilmSegmentRevision,
} from "@/lib/short-film/segment-contracts";
import type { FilmTask } from "@/lib/short-film/contracts";

type Quote = {
  id: string;
  points: number;
  expires_at: string;
  items: { kind: string; points: number }[];
};

function patchFromSegment(segment: FilmSegmentRevision): FilmSegmentPatch {
  return {
    speakerCharacterId: segment.speakerCharacterId,
    voiceProfileVersion: segment.voiceProfileVersion,
    dialogue: segment.dialogue,
    action: segment.action,
    camera: segment.camera,
    motionPrompt: segment.motionPrompt,
    imagePrompt: segment.imagePrompt,
    openingState: segment.openingState,
    closingState: segment.closingState,
    props: segment.props,
    sourceTaskId: segment.selectedTaskId || segment.sourceTaskId,
    inSeconds: segment.selectedInSeconds ?? segment.inSeconds,
    outSeconds: segment.selectedOutSeconds ?? segment.outSeconds,
    timingSource: segment.timingSource,
    timingEvidence: segment.timingEvidence,
  };
}

export function FilmSegmentEditor({
  sceneIndex,
  segments,
  tasks,
  busy,
  onSave,
  onQuote,
  onUploadFrame,
  onRun,
  onSelectSource,
  onRender,
}: {
  sceneIndex: number;
  segments: FilmSegmentRevision[];
  tasks: FilmTask[];
  busy: boolean;
  onSave: (
    segment: FilmSegmentRevision,
    patch: FilmSegmentPatch,
  ) => Promise<FilmSegmentRevision>;
  onQuote: (
    segment: FilmSegmentRevision,
    startFrameMode?: "footage" | "generated",
  ) => Promise<Quote>;
  onUploadFrame: (
    segment: FilmSegmentRevision,
    file: File,
  ) => Promise<Quote>;
  onRun: (quote: Quote) => Promise<void>;
  onSelectSource: (
    segment: FilmSegmentRevision,
    taskId: string,
    inSeconds: number,
    outSeconds: number,
  ) => Promise<FilmSegmentRevision>;
  onRender: () => Promise<void>;
}) {
  const sceneSegments = useMemo(
    () => segments.filter((segment) => segment.sceneIndex === sceneIndex),
    [sceneIndex, segments],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected =
    sceneSegments.find((segment) => segment.segmentId === selectedId) ||
    sceneSegments[0];
  const [draft, setDraft] = useState<FilmSegmentPatch | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const loadedKey = useRef("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameInputRef = useRef<HTMLInputElement | null>(null);
  const [working, setWorking] = useState("");
  const [localError, setLocalError] = useState("");

  const perform = async (name: string, work: () => Promise<void>) => {
    if (working || busy) return;
    setWorking(name);
    setLocalError("");
    try {
      await work();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Thao tác chưa hoàn tất.");
    } finally {
      setWorking("");
    }
  };

  useEffect(() => {
    if (!selected) {
      loadedKey.current = "";
      setDraft(null);
      return;
    }
    const key = `${selected.segmentId}:${selected.revision}:${selected.selectedTaskId || "source"}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setSelectedId(selected.segmentId);
    setDraft(patchFromSegment(selected));
    setQuote(null);
  }, [selected]);

  if (!selected || !draft) return null;
  const sourceTaskId = selected.selectedTaskId || selected.sourceTaskId;
  const sourceUrl = tasks.find((task) => task.id === sourceTaskId)?.url;
  const rangeIn = draft.inSeconds;
  const rangeOut = draft.outSeconds;
  const sourceDuration = Number(
    tasks.find((task) => task.id === sourceTaskId)?.result?.duration || rangeOut,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(patchFromSegment(selected));
  const update = (value: Partial<FilmSegmentPatch>) => {
    setDraft((current) => (current ? { ...current, ...value } : current));
    setQuote(null);
  };

  return (
    <section className="mt-4 rounded-xl border th-border p-3 th-bg-secondary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold th-text-primary">
            Sửa từng đoạn trong cảnh {sceneIndex + 1}
          </h3>
          <p className="mt-1 text-xs th-text-secondary">
            Clip nguồn vẫn được tạo gộp. Chỉ đoạn được chọn mới phát sinh lượt tạo mới.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || !!working || dirty}
          onClick={() => void perform("Ghép phim", onRender)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-sm font-semibold th-text-accent disabled:opacity-50"
        >
          <Film size={16} /> Ghép phim
        </button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {sceneSegments.map((segment) => (
          <button
            type="button"
            key={segment.segmentId}
            onClick={() => setSelectedId(segment.segmentId)}
            className="min-w-40 rounded-lg border px-3 py-2 text-left text-xs"
            style={{
              borderColor:
                segment.segmentId === selected.segmentId
                  ? "var(--accent)"
                  : "var(--border-primary)",
              background:
                segment.segmentId === selected.segmentId
                  ? "var(--accent-light)"
                  : "var(--surface-primary)",
            }}
          >
            <span className="block font-semibold th-text-primary">
              {segment.sequenceIndex + 1}. {segment.speakerName || "Hành động"}
            </span>
            <span className="mt-1 block th-text-secondary">
              {segment.inSeconds.toFixed(1)}–{segment.outSeconds.toFixed(1)}s · bản {Math.max(1, segment.revision)}
            </span>
            {segment.selectedTaskId && (
              <span className="mt-1 block th-text-accent">Đang dùng bản thay thế</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <div className="space-y-3">
          {sourceUrl ? (
            <video
              ref={videoRef}
              key={`${sourceTaskId}:${rangeIn}:${rangeOut}`}
              controls
              preload="metadata"
              src={`${sourceUrl}#t=${rangeIn},${rangeOut}`}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = rangeIn;
              }}
              onTimeUpdate={(event) => {
                if (event.currentTarget.currentTime >= rangeOut)
                  event.currentTarget.pause();
              }}
              className="aspect-video w-full rounded-lg bg-black object-contain"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-lg border th-border text-sm th-text-secondary">
              Clip nguồn chưa sẵn sàng.
            </div>
          )}
          <button
            type="button"
            disabled={!sourceUrl}
            onClick={() => {
              if (!videoRef.current) return;
              videoRef.current.currentTime = rangeIn;
              void videoRef.current.play();
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-xs th-text-primary disabled:opacity-50"
          >
            <Play size={14} /> Phát đúng đoạn đã chọn
          </button>
          <div className="space-y-1 rounded-lg border th-border p-2">
            <input
              aria-label="Điểm vào của đoạn"
              type="range"
              min={0}
              max={Math.max(0.1, sourceDuration)}
              step={0.05}
              value={Math.min(rangeIn, sourceDuration)}
              onChange={(event) =>
                update({
                  inSeconds: Math.min(
                    Number(event.target.value),
                    draft.outSeconds - 0.05,
                  ),
                  timingSource: "manual",
                })
              }
              className="w-full accent-[var(--accent)]"
            />
            <input
              aria-label="Điểm ra của đoạn"
              type="range"
              min={0.05}
              max={Math.max(0.1, sourceDuration)}
              step={0.05}
              value={Math.min(rangeOut, sourceDuration)}
              onChange={(event) =>
                update({
                  outSeconds: Math.max(
                    Number(event.target.value),
                    draft.inSeconds + 0.05,
                  ),
                  timingSource: "manual",
                })
              }
              className="w-full accent-[var(--accent)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs th-text-secondary">
              Điểm vào (giây)
              <input
                type="number"
                min={0}
                step={0.05}
                value={draft.inSeconds}
                onChange={(event) =>
                  update({
                    inSeconds: Number(event.target.value),
                    timingSource: "manual",
                  })
                }
                className="mt-1 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
              />
            </label>
            <label className="text-xs th-text-secondary">
              Điểm ra (giây)
              <input
                type="number"
                min={0.05}
                step={0.05}
                value={draft.outSeconds}
                onChange={(event) =>
                  update({
                    outSeconds: Number(event.target.value),
                    timingSource: "manual",
                  })
                }
                className="mt-1 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
              />
            </label>
          </div>
          <p className="text-xs th-text-secondary">
            Ảnh mở sẽ được lấy đúng tại {draft.inSeconds.toFixed(2)}s của nguồn đang chọn. Thời lượng dùng: {(draft.outSeconds - draft.inSeconds).toFixed(2)}s.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs th-text-secondary">
            Lời thoại · {selected.speakerName || "không người nói"}
            <textarea
              value={draft.dialogue}
              onChange={(event) => update({ dialogue: event.target.value })}
              className="mt-1 min-h-16 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
            />
          </label>
          <label className="block text-xs th-text-secondary">
            Hành động
            <textarea
              value={draft.action}
              onChange={(event) => update({ action: event.target.value })}
              className="mt-1 min-h-16 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
            />
          </label>
          <label className="block text-xs th-text-secondary">
            Góc máy
            <input
              value={draft.camera}
              onChange={(event) => update({ camera: event.target.value })}
              className="mt-1 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
            />
          </label>
          <label className="block text-xs th-text-secondary">
            Prompt chuyển động
            <textarea
              value={draft.motionPrompt}
              onChange={(event) => update({ motionPrompt: event.target.value })}
              className="mt-1 min-h-24 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
            />
          </label>
          <label className="block text-xs th-text-secondary">
            Prompt ảnh mở nếu cần tạo ảnh mới
            <textarea
              value={draft.imagePrompt}
              onChange={(event) => update({ imagePrompt: event.target.value })}
              className="mt-1 min-h-20 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
            />
          </label>
          <details className="rounded-lg border th-border p-2 text-xs th-text-secondary">
            <summary className="cursor-pointer">Trạng thái và đạo cụ xuyên đoạn</summary>
            <label className="mt-2 block">
              Trước hành động
              <textarea
                value={draft.openingState.note || ""}
                onChange={(event) =>
                  update({
                    openingState: { ...draft.openingState, note: event.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
              />
            </label>
            <label className="mt-2 block">
              Sau hành động
              <textarea
                value={draft.closingState.note || ""}
                onChange={(event) =>
                  update({
                    closingState: { ...draft.closingState, note: event.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary"
              />
            </label>
            {draft.props.length > 0 && (
              <ul className="mt-2 space-y-1">
                {draft.props.map((prop) => (
                  <li key={prop.id} className="rounded th-bg-card px-2 py-1">
                    {prop.label}: {prop.color}, {prop.size} · {prop.count} · {prop.position}
                  </li>
                ))}
              </ul>
            )}
          </details>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !!working || dirty}
              onClick={() => frameInputRef.current?.click()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-sm th-text-accent disabled:opacity-50"
            >
              <ImageUp size={15} /> Chọn ảnh mở khác
            </button>
            <input
              ref={frameInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void perform("Tải ảnh mở", async () => {
                  setQuote(await onUploadFrame(selected, file));
                });
              }}
            />
            <button
              type="button"
              disabled={busy || !!working || !dirty || draft.outSeconds <= draft.inSeconds}
              onClick={() =>
                void perform("Lưu chỉnh sửa", async () => {
                  const saved = await onSave(selected, draft);
                  setDraft(patchFromSegment(saved));
                })
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-sm th-text-primary disabled:opacity-50"
            >
              <Save size={15} /> Lưu chỉnh sửa
            </button>
            <button
              type="button"
              disabled={busy || !!working || dirty}
              onClick={() =>
                void perform("Chuẩn bị ảnh mở", async () => {
                  setQuote(await onQuote(selected, "generated"));
                })
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-sm th-text-accent disabled:opacity-50"
            >
              Tạo ảnh mở mới · xem giá
            </button>
            <button
              type="button"
              disabled={busy || !!working || dirty}
              onClick={() =>
                void perform("Tạo lại đoạn", async () => {
                  if (quote) await onRun(quote);
                  else setQuote(await onQuote(selected));
                })
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--text-on-accent)] disabled:opacity-50"
            >
              <Sparkles size={15} />
              {quote
                ? `Duyệt và tạo lại · ${quote.points} điểm`
                : "Xem giá tạo lại đoạn"}
            </button>
          </div>
          {quote && (
            <p className="text-xs th-text-secondary">
              {quote.items.map((item) => `${item.kind}: ${item.points} điểm`).join(" · ")}
            </p>
          )}
          {localError && <p className="text-xs th-text-danger">{localError}</p>}
        </div>
      </div>

      {(selected.attempts.length > 0 || selected.selectedTaskId) && (
        <div className="mt-3 border-t th-border pt-3">
          <h4 className="text-xs font-semibold th-text-primary">Các bản của đoạn</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.attempts
              .filter((attempt) => attempt.status === "completed")
              .map((attempt) => (
                <button
                  type="button"
                  key={attempt.taskId}
                  disabled={busy || !!working || attempt.selected || !attempt.duration}
                  onClick={() =>
                    void perform("Chọn bản", async () => {
                      await onSelectSource(
                        selected,
                        attempt.taskId,
                        0,
                        Math.min(attempt.duration!, attempt.usedDuration || attempt.duration!),
                      );
                    })
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-xs th-text-primary disabled:opacity-50"
                >
                  {attempt.selected ? <Check size={14} /> : <Play size={14} />}
                  {attempt.selected
                    ? `Đang dùng · bản ${attempt.segmentRevision || "cũ"}`
                    : `Dùng bản ${attempt.segmentRevision || "cũ"}`}
                </button>
              ))}
            {selected.selectedTaskId && selected.originalSourceTaskId && (
              <button
                type="button"
                disabled={busy || !!working}
                onClick={() =>
                  void perform("Khôi phục", async () => {
                    await onSelectSource(
                      selected,
                      selected.originalSourceTaskId!,
                      selected.originalInSeconds,
                      selected.originalOutSeconds,
                    );
                  })
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-3 text-xs th-text-secondary"
              >
                <RotateCcw size={14} /> Khôi phục bản gốc
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
