"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  Lightbulb,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Button from "@/components/ui/button";
import {
  EPISODE_STATUS_LABEL,
  QUALITY_OPTIONS,
  REGENERATE_REASONS,
  STUDIO_STEPS,
  runHeadline,
  runIsActive,
  runStep,
  type Attention,
  type EpisodeSummary,
  type QualityId,
  type StudioRun,
  type StudioTask,
} from "../_lib/studio";

const STATUS_CLASS: Record<EpisodeSummary["status"], string> = {
  draft: "th-bg-tertiary th-text-secondary",
  working: "th-bg-accent-light th-text-accent",
  attention: "th-bg-warning-light th-text-warning",
  ready: "th-bg-success-light th-text-success",
  stopped: "th-bg-tertiary th-text-muted",
};

export function StatusPill({ status }: { status: EpisodeSummary["status"] }) {
  return (
    <span className={`inline-flex shrink-0 items-center self-start rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {EPISODE_STATUS_LABEL[status]}
    </span>
  );
}

export function EpisodeList({
  episodes,
  selectedKey,
  onSelect,
  onNew,
}: {
  episodes: EpisodeSummary[];
  selectedKey: string | null;
  onSelect: (episode: EpisodeSummary) => void;
  onNew: () => void;
}) {
  return (
    <nav aria-label="Các tập phim" className="flex flex-col gap-2">
      <Button onClick={onNew} variant={selectedKey ? "outline" : "primary"} className="w-full">
        <Plus className="h-4 w-4" aria-hidden /> Tập mới
      </Button>
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {episodes.map((episode) => {
          const active = episode.key === selectedKey;
          return (
            <li key={episode.key} className="min-w-56 lg:min-w-0">
              <button
                onClick={() => onSelect(episode)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active ? "th-border-accent th-bg-accent-light" : "th-border th-bg-card hover:th-bg-hover"
                }`}
              >
                <span className="line-clamp-2 text-sm font-medium th-text-primary">{episode.title}</span>
                <StatusPill status={episode.status} />
              </button>
            </li>
          );
        })}
        {!episodes.length && (
          <li className="px-1 py-2 text-sm th-text-muted">Chưa có tập nào. Bắt đầu bằng một ý tưởng.</li>
        )}
      </ul>
    </nav>
  );
}

export function IdeaPanel({
  idea,
  onIdea,
  quality,
  onQuality,
  limit,
  onLimit,
  suggestions,
  suggesting,
  onSuggest,
  starting,
  onStart,
  advancedHref,
}: {
  idea: string;
  onIdea: (value: string) => void;
  quality: QualityId;
  onQuality: (value: QualityId) => void;
  limit: number;
  onLimit: (value: number) => void;
  suggestions: { title: string; idea: string }[];
  suggesting: boolean;
  onSuggest: () => void;
  starting: boolean;
  onStart: () => void;
  advancedHref: string;
}) {
  const [advanced, setAdvanced] = useState(false);
  const option = QUALITY_OPTIONS.find((item) => item.id === quality)!;
  const ready = idea.trim().length >= 10 && limit >= option.estimatedPoints * 0.5;
  return (
    <section className="flex flex-col gap-6" aria-labelledby="idea-title">
      <header>
        <h2 id="idea-title" className="text-xl font-semibold th-text-primary">Tập mới</h2>
        <p className="mt-1 text-sm th-text-secondary">
          Viết ý tưởng bằng vài câu. AI viết kịch bản, dựng cảnh, lồng tiếng và ghép phim; bạn chỉ cần xem khi AI hỏi.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor="idea" className="text-sm font-medium th-text-primary">Tập này kể chuyện gì?</label>
        <textarea
          id="idea"
          value={idea}
          onChange={(event) => onIdea(event.target.value)}
          rows={5}
          placeholder="Ví dụ: Chiều ở biển, Bố cõng Đậu Đỏ. Bố nhớ ngày xưa ông cõng mình, mắt đỏ hoe, bảo là cát bay vào mắt. Đậu Đỏ chu môi thổi cho Bố."
          className="w-full rounded-lg border th-border th-bg-input px-3 py-2.5 text-sm th-text-primary th-ring-accent focus:outline-none focus:ring-2"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSuggest} loading={suggesting}>
            <Lightbulb className="h-4 w-4" aria-hidden /> Gợi ý ý tưởng
          </Button>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              onClick={() => onIdea(suggestion.idea)}
              className="rounded-full border th-border th-bg-card px-3 py-1 text-xs th-text-secondary hover:th-bg-hover"
              title={suggestion.idea}
            >
              {suggestion.title}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium th-text-primary">Chất lượng</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUALITY_OPTIONS.map((item) => {
            const checked = item.id === quality;
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  checked ? "th-border-accent th-bg-accent-light" : "th-border th-bg-card hover:th-bg-hover"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium th-text-primary">
                    <input
                      type="radio"
                      name="quality"
                      checked={checked}
                      onChange={() => {
                        onQuality(item.id);
                        onLimit(item.defaultLimit);
                      }}
                      className="accent-[var(--accent)]"
                    />
                    {item.label}
                  </span>
                  <span className="text-xs th-text-secondary">khoảng {item.estimatedPoints.toLocaleString("vi-VN")} điểm</span>
                </span>
                <span className="pl-6 text-xs th-text-secondary">{item.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-lg border th-border">
        <button
          onClick={() => setAdvanced((value) => !value)}
          aria-expanded={advanced}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm th-text-secondary"
        >
          Giới hạn điểm và tùy chọn khác
          <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {advanced && (
          <div className="flex flex-col gap-3 border-t th-border px-3 py-3">
            <label className="flex flex-col gap-1 text-sm th-text-primary">
              Không tiêu quá (điểm cho tập này)
              <input
                type="number"
                min={50}
                step={50}
                value={limit}
                onChange={(event) => onLimit(Number(event.target.value))}
                className="w-40 rounded-lg border th-border th-bg-input px-3 py-2 text-sm th-text-primary"
              />
              <span className="text-xs th-text-secondary">AI dừng lại và hỏi bạn nếu sắp vượt mức này.</span>
            </label>
            <Link href={advancedHref} className="text-sm th-text-accent underline-offset-2 hover:underline">
              Tự viết kịch bản từng cảnh, chọn giọng, lịch tự sản xuất hằng ngày →
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button size="lg" onClick={onStart} disabled={!ready} loading={starting}>
          <Clapperboard className="h-5 w-5" aria-hidden /> Làm phim
        </Button>
        <span className="text-xs th-text-secondary">
          {idea.trim().length < 10
            ? "Viết ít nhất một câu ý tưởng để bắt đầu."
            : `Tối đa ${limit.toLocaleString("vi-VN")} điểm · khoảng 5–10 phút · có thể rời trang.`}
        </span>
      </div>
    </section>
  );
}

export function ProgressPanel({
  run,
  busy,
  onPause,
  onResume,
  onCancel,
}: {
  run: StudioRun;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const current = runStep(run);
  const stopped = ["cancelled", "failed"].includes(run.status);
  const percent = Math.min(100, Math.round((run.points_committed / Math.max(1, run.max_points_per_film)) * 100));
  return (
    <section className="flex flex-col gap-4 rounded-xl border th-border th-bg-card p-4 sm:p-5" aria-label="Tiến độ">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-base font-medium th-text-primary" role="status" aria-live="polite">
          {runIsActive(run) && <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" aria-hidden />}
          {runHeadline(run)}
        </p>
        <div className="flex gap-2">
          {runIsActive(run) && (
            <Button variant="outline" size="sm" onClick={onPause} disabled={busy}>
              <Pause className="h-4 w-4" aria-hidden /> Tạm dừng
            </Button>
          )}
          {run.status === "paused" && (
            <Button size="sm" onClick={onResume} disabled={busy}>
              <Play className="h-4 w-4" aria-hidden /> Làm tiếp
            </Button>
          )}
          {!stopped && run.status !== "completed" && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              <X className="h-4 w-4" aria-hidden /> Hủy tập
            </Button>
          )}
        </div>
      </div>
      <ol className="grid grid-cols-5 gap-1.5">
        {STUDIO_STEPS.map((step, index) => {
          const done = run.status === "completed" || index < current;
          const now = index === current && run.status !== "completed";
          return (
            <li key={step.key} className="flex flex-col gap-1.5">
              <span
                className={`h-1.5 rounded-full ${done ? "bg-[var(--accent)]" : now ? "bg-[var(--accent)] opacity-50" : "th-bg-tertiary"}`}
                aria-hidden
              />
              <span className={`text-[11px] leading-tight sm:text-xs ${now ? "font-medium th-text-primary" : done ? "th-text-secondary" : "th-text-muted"}`}>
                {step.label}
                <span className="sr-only">{done ? " (xong)" : now ? " (đang làm)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3 text-xs th-text-secondary">
        <div className="h-1 flex-1 overflow-hidden rounded-full th-bg-tertiary" aria-hidden>
          <div className="h-full bg-[var(--accent)] opacity-60" style={{ width: `${percent}%` }} />
        </div>
        Đã dùng {run.points_committed.toLocaleString("vi-VN")} / {run.max_points_per_film.toLocaleString("vi-VN")} điểm
      </div>
    </section>
  );
}

function MediaPreview({ task }: { task: StudioTask }) {
  if (!task.url) return null;
  if (["image", "frame"].includes(task.kind))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={task.url} alt="Kết quả cần xem" className="max-h-80 w-full rounded-lg object-contain th-bg-tertiary" />;
  if (task.kind === "tts") return <audio src={task.url} controls className="w-full" />;
  return <video src={task.url} poster={task.posterUrl} controls playsInline className="max-h-80 w-full rounded-lg th-bg-tertiary" />;
}

export function AttentionPanel({
  attention,
  busy,
  onUseAnyway,
  onRegenerate,
  onRaiseBudget,
  onAcceptScript,
  onRewriteScript,
  onRetry,
}: {
  attention: Attention;
  busy: boolean;
  onUseAnyway: (task: StudioTask) => void;
  onRegenerate: (task: StudioTask, reason: string) => void;
  onRaiseBudget: (limit: number) => void;
  onAcceptScript: () => void;
  onRewriteScript: () => void;
  onRetry: () => void;
}) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  if (attention.kind === "none") return null;
  const frame = (title: string, body: React.ReactNode) => (
    <section className="flex flex-col gap-4 rounded-xl border th-border-warning th-bg-warning-light p-4 sm:p-5" aria-label="Cần bạn quyết định">
      <h3 className="flex items-center gap-2 text-base font-semibold th-text-primary">
        <AlertTriangle className="h-5 w-5 th-text-warning" aria-hidden /> {title}
      </h3>
      {body}
    </section>
  );
  const issueList = (issues: string[]) =>
    issues.length ? (
      <ul className="list-disc space-y-1 pl-5 text-sm th-text-primary">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    ) : null;

  if (attention.kind === "budget")
    return frame(
      "Tập này đã dùng gần hết điểm cho phép",
      <>
        <p className="text-sm th-text-primary">
          Đã dùng {attention.used.toLocaleString("vi-VN")} / {attention.limit.toLocaleString("vi-VN")} điểm. Phần đã làm được giữ nguyên.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onRaiseBudget(attention.suggested)} disabled={busy}>
            Cho phép tới {attention.suggested.toLocaleString("vi-VN")} điểm và làm tiếp
          </Button>
        </div>
      </>,
    );

  if (attention.kind === "script")
    return frame(
      "AI thấy kịch bản còn điểm chưa ổn",
      <>
        {attention.summary && <p className="text-sm th-text-primary">{attention.summary}</p>}
        {issueList(attention.issues)}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRewriteScript} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Viết lại kịch bản
          </Button>
          <Button variant="outline" onClick={onAcceptScript} disabled={busy}>
            Kịch bản ổn, làm tiếp
          </Button>
        </div>
      </>,
    );

  if (attention.kind === "generic")
    return frame(
      "AI cần bạn xem trước khi làm tiếp",
      <>
        <p className="text-sm th-text-primary">{attention.message}</p>
        <div>
          <Button onClick={onRetry} disabled={busy}>
            <Play className="h-4 w-4" aria-hidden /> Thử làm tiếp
          </Button>
        </div>
      </>,
    );

  const { task } = attention;
  const reason = [...reasons, note.trim()].filter(Boolean).join("; ");
  return frame(
    `${attention.what}${attention.sceneNumber ? ` ${attention.sceneNumber}` : ""} chưa đạt`,
    <>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <MediaPreview task={task} />
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium th-text-primary">AI kiểm tra thấy:</p>
          {issueList(attention.issues)}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm th-text-primary">Tạo lại vì (chọn một hoặc nhiều):</p>
        <div className="flex flex-wrap gap-2">
          {REGENERATE_REASONS.map((item) => {
            const on = reasons.includes(item);
            return (
              <button
                key={item}
                onClick={() => setReasons((list) => (on ? list.filter((value) => value !== item) : [...list, item]))}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-xs ${on ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-bg-card th-text-secondary"}`}
              >
                {item}
              </button>
            );
          })}
        </div>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi thêm nếu cần, ví dụ: Bố phải chân trần"
          className="rounded-lg border th-border th-bg-input px-3 py-2 text-sm th-text-primary"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onRegenerate(task, reason || attention.issues.join("; ") || "Kết quả chưa đạt")} disabled={busy}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Tạo lại
        </Button>
        <Button variant="outline" onClick={() => onUseAnyway(task)} disabled={busy}>
          <Check className="h-4 w-4" aria-hidden /> Vẫn dùng bản này
        </Button>
      </div>
    </>,
  );
}

export type ScriptLine = { speaker: string; text: string; action: string };

export function ScriptPanel({ title, lines, editHref }: { title: string; lines: ScriptLine[]; editHref: string | null }) {
  const [open, setOpen] = useState(true);
  if (!lines.length) return null;
  return (
    <section className="rounded-xl border th-border th-bg-card" aria-labelledby="script-title">
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-2 text-left">
          <ChevronDown className={`h-4 w-4 th-text-secondary transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
          <h3 id="script-title" className="text-base font-semibold th-text-primary">Kịch bản · {title}</h3>
        </button>
        {editHref && (
          <Link href={editHref} className="text-sm th-text-accent underline-offset-2 hover:underline">
            Chỉnh chi tiết
          </Link>
        )}
      </div>
      {open && (
        <ol className="flex flex-col gap-3 border-t th-border px-4 py-4 sm:px-5">
          {lines.map((line, index) => (
            <li key={index} className="flex flex-col gap-0.5">
              {line.text.trim() ? (
                <p className="text-sm th-text-primary">
                  <span className="font-semibold">{line.speaker}:</span> {line.text}
                </p>
              ) : (
                <p className="text-sm italic th-text-secondary">Cảnh không lời</p>
              )}
              {line.action && <p className="text-xs th-text-secondary">{line.action}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export type SceneTile = { number: number; label: string; task: StudioTask | null };

export function SceneStrip({ scenes }: { scenes: SceneTile[] }) {
  if (!scenes.length) return null;
  return (
    <section aria-label="Các cảnh" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium th-text-secondary">Các cảnh</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {scenes.map((scene) => (
          <li key={scene.number} className="overflow-hidden rounded-lg border th-border th-bg-card">
            <div className="flex aspect-video items-center justify-center th-bg-tertiary">
              {scene.task?.url && ["image", "frame"].includes(scene.task.kind) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scene.task.url} alt={`Cảnh ${scene.number}`} className="h-full w-full object-cover" />
              ) : scene.task?.url ? (
                <video src={scene.task.url} poster={scene.task.posterUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs th-text-muted">Chưa có hình</span>
              )}
            </div>
            <p className="px-2.5 py-2 text-xs th-text-secondary">
              <span className="font-medium th-text-primary">Cảnh {scene.number}</span> · {scene.label}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FilmPanel({
  film,
  approving,
  onApprove,
}: {
  film: StudioTask;
  approving: boolean;
  onApprove: () => void;
}) {
  const approved = Boolean(film.approved_at);
  return (
    <section className="flex flex-col gap-3 rounded-xl border th-border-success th-bg-card p-4 sm:p-5" aria-label="Phim hoàn chỉnh">
      <h3 className="flex items-center gap-2 text-base font-semibold th-text-primary">
        <Sparkles className="h-5 w-5 th-text-success" aria-hidden /> Phim hoàn chỉnh
      </h3>
      <video src={film.url} poster={film.posterUrl} controls playsInline className="w-full rounded-lg bg-black" />
      <div className="flex flex-wrap gap-2">
        {approved ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg th-bg-success-light px-3 py-2 text-sm th-text-success">
            <Check className="h-4 w-4" aria-hidden /> Đã duyệt
          </span>
        ) : (
          <Button onClick={onApprove} loading={approving}>
            <Check className="h-4 w-4" aria-hidden /> Duyệt phim
          </Button>
        )}
        <a href={film.url} download className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-4 text-sm th-text-secondary">
          <Download className="h-4 w-4" aria-hidden /> Tải phim
        </a>
        {film.srtUrl && (
          <a href={film.srtUrl} download className="inline-flex min-h-10 items-center gap-2 rounded-lg border th-border px-4 text-sm th-text-secondary">
            <Download className="h-4 w-4" aria-hidden /> Tải phụ đề
          </a>
        )}
      </div>
    </section>
  );
}
