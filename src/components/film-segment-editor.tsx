"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Film, ImageUp, Play, RotateCcw, Save, Sparkles } from "lucide-react";
import type {
  FilmSegmentPatch,
  FilmSegmentRevision,
} from "@/lib/short-film/segment-contracts";
import type { FilmTask } from "@/lib/short-film/contracts";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import PriceLine from "@/components/ui/price-line";
import Textarea from "@/components/ui/textarea";

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
      setLocalError(error instanceof Error ? error.message : "Chưa làm xong. Bạn thử lại nhé.");
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
    <section className="mt-4 rounded-2xl border th-border p-3 th-bg-secondary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold th-text-primary">
            Sửa từng lượt trong cảnh {sceneIndex + 1}
          </h3>
          <p className="mt-1 text-xs th-text-secondary">
            Cả cảnh vẫn quay một lần. Chỉ lượt bạn làm lại mới tính thêm điểm.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !!working || dirty}
          loading={working === "Ghép phim"}
          onClick={() => void perform("Ghép phim", onRender)}
        >
          <Film size={16} /> Ghép phim
        </Button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {sceneSegments.map((segment) => (
          <button
            type="button"
            key={segment.segmentId}
            onClick={() => setSelectedId(segment.segmentId)}
            aria-pressed={segment.segmentId === selected.segmentId}
            className={`min-w-40 rounded-xl border px-3 py-2 text-left text-xs ${
              segment.segmentId === selected.segmentId ? "th-border-accent th-bg-accent-light" : "th-border th-bg-card"
            }`}
          >
            <span className="block font-semibold th-text-primary">
              {segment.sequenceIndex + 1}. {segment.speakerName || "Hành động"}
            </span>
            <span className="mt-1 block th-text-secondary">
              {segment.inSeconds.toFixed(1)}–{segment.outSeconds.toFixed(1)} giây · bản {Math.max(1, segment.revision)}
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
              className="aspect-video w-full rounded-xl bg-black object-contain"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl border th-border text-sm th-text-secondary">
              Cảnh này chưa quay xong.
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!sourceUrl}
            onClick={() => {
              if (!videoRef.current) return;
              videoRef.current.currentTime = rangeIn;
              void videoRef.current.play();
            }}
          >
            <Play size={14} /> Phát đúng lượt đã chọn
          </Button>
          <div className="space-y-1 rounded-xl border th-border p-2">
            <input
              aria-label="Giây bắt đầu của lượt"
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
              className="th-accent-control w-full"
            />
            <input
              aria-label="Giây kết thúc của lượt"
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
              className="th-accent-control w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
                id="segment-in"
                label="Bắt đầu (giây)"
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
              />
            <Input
                id="segment-out"
                label="Kết thúc (giây)"
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
              />
          </div>
          <p className="text-xs th-text-secondary">
            Ảnh mở đầu lấy đúng ở giây {draft.inSeconds.toFixed(2)} của bản đang chọn. Lượt này dài {(draft.outSeconds - draft.inSeconds).toFixed(2)} giây.
          </p>
        </div>

        <div className="space-y-2">
          <Textarea
            id="segment-dialogue"
            label={`Lời thoại · ${selected.speakerName || "không ai nói"}`}
            className="min-h-16"
            value={draft.dialogue}
            onChange={(event) => update({ dialogue: event.target.value })}
          />
          <Textarea
            id="segment-action"
            label="Hành động"
            className="min-h-16"
            value={draft.action}
            onChange={(event) => update({ action: event.target.value })}
          />
          <Input
            id="segment-camera"
            label="Góc máy"
            value={draft.camera}
            onChange={(event) => update({ camera: event.target.value })}
          />
          <Textarea
            id="segment-motion"
            label="Mô tả chuyển động"
            className="min-h-24"
            value={draft.motionPrompt}
            onChange={(event) => update({ motionPrompt: event.target.value })}
          />
          <Textarea
            id="segment-image"
            label="Mô tả ảnh mở đầu (khi vẽ ảnh mới)"
            className="min-h-20"
            value={draft.imagePrompt}
            onChange={(event) => update({ imagePrompt: event.target.value })}
          />
          <details className="rounded-xl border th-border p-2 text-xs th-text-secondary">
            <summary className="cursor-pointer">Trạng thái và đồ vật nối giữa các lượt</summary>
            <label className="mt-2 block">
              Trước hành động
              <textarea
                value={draft.openingState.note || ""}
                onChange={(event) =>
                  update({
                    openingState: { ...draft.openingState, note: event.target.value },
                  })
                }
                className="mt-1 w-full rounded-xl border th-border px-3 py-2 th-bg-input th-text-primary"
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
                className="mt-1 w-full rounded-xl border th-border px-3 py-2 th-bg-input th-text-primary"
              />
            </label>
            {draft.props.length > 0 && (
              <ul className="mt-2 space-y-1">
                {draft.props.map((prop) => (
                  <li key={prop.id} className="rounded-lg th-bg-card px-2 py-1">
                    {prop.label}: {prop.color}, {prop.size} · {prop.count} · {prop.position}
                  </li>
                ))}
              </ul>
            )}
          </details>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !!working || dirty}
              onClick={() => frameInputRef.current?.click()}
            >
              <ImageUp size={14} /> Chọn ảnh mở đầu khác
            </Button>
            <input
              ref={frameInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void perform("Thêm ảnh mở đầu", async () => {
                  setQuote(await onUploadFrame(selected, file));
                });
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !!working || !dirty || draft.outSeconds <= draft.inSeconds}
              loading={working === "Lưu"}
              onClick={() =>
                void perform("Lưu", async () => {
                  const saved = await onSave(selected, draft);
                  setDraft(patchFromSegment(saved));
                })
              }
            >
              <Save size={14} /> Lưu
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !!working || dirty}
              onClick={() =>
                void perform("Vẽ ảnh mở đầu", async () => {
                  setQuote(await onQuote(selected, "generated"));
                })
              }
            >
              Vẽ ảnh mở đầu mới · xem giá
            </Button>
          </div>
          {quote && <PriceLine points={quote.points} />}
          <Button
            size="sm"
            disabled={busy || !!working || dirty}
            loading={working === "Làm lại lượt"}
            onClick={() =>
              void perform("Làm lại lượt", async () => {
                if (quote) await onRun(quote);
                else setQuote(await onQuote(selected));
              })
            }
          >
            <Sparkles size={14} />
            {quote ? "Đồng ý và làm lại" : "Xem giá làm lại lượt này"}
          </Button>
          {localError && <Alert>{localError}</Alert>}
        </div>
      </div>

      {(selected.attempts.length > 0 || selected.selectedTaskId) && (
        <div className="mt-3 border-t th-border pt-3">
          <h4 className="text-xs font-semibold th-text-primary">Các bản của lượt này</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.attempts
              .filter((attempt) => attempt.status === "completed")
              .map((attempt) => (
                <Button
                  variant="outline"
                  size="sm"
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
                >
                  {attempt.selected ? <Check size={14} /> : <Play size={14} />}
                  {attempt.selected
                    ? `Đang dùng · bản ${attempt.segmentRevision || "cũ"}`
                    : `Dùng bản ${attempt.segmentRevision || "cũ"}`}
                </Button>
              ))}
            {selected.selectedTaskId && selected.originalSourceTaskId && (
              <Button
                variant="ghost"
                size="sm"
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
              >
                <RotateCcw size={14} /> Dùng lại bản gốc
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
