"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Clapperboard,
  Coins,
  Download,
  Lightbulb,
  ListOrdered,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import JobStatus from "@/components/ui/job-status";
import PriceLine from "@/components/ui/price-line";
import Select from "@/components/ui/select";
import Textarea from "@/components/ui/textarea";
import { formatPoints } from "@/lib/format";
import { humanizeError } from "@/lib/error-messages";
import type { StoryGenre } from "@/lib/story-genre";
import type { FilmFormat } from "@/lib/film-camera-language";
import SharePost from "@/components/content/share-post";
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
  FORMAT_CHOICES,
} from "../_lib/studio";
import { QUEUE_LIMIT } from "@/app/api/projects/[id]/film-automation/queue";
import { moveInQueue, queueCandidates, scheduleChanged, type FilmSchedule } from "../_lib/schedule";

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
        <Plus size={16} aria-hidden /> Tập mới
      </Button>
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {episodes.map((episode) => {
          const active = episode.key === selectedKey;
          return (
            <li key={episode.key} className="min-w-56 lg:min-w-0">
              <button
                type="button"
                onClick={() => onSelect(episode)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active ? "th-border-accent th-bg-accent-light" : "th-border th-bg-card th-bg-hover"
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

/** Tên gọi chủ fanpage đọc; null là để AIDA tự chọn — lựa chọn mặc định. */
const GENRE_CHOICES: Array<{ value: StoryGenre | null; label: string }> = [
  { value: null, label: "Tự động" },
  { value: "comedy", label: "Hài tự nhiên" },
  { value: "emotion", label: "Cảm động" },
];

function ChoiceGroup<T extends string | null>({
  legend,
  name,
  value,
  onChange,
  choices,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  choices: Array<{ value: T; label: string; description?: string }>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium th-text-primary">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((item) => (
          <label
            key={item.value || "auto"}
            className={`cursor-pointer rounded-xl border p-3 ${value === item.value ? "th-border-accent th-bg-accent-light" : "th-border th-bg-card"}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium th-text-primary">
              <input type="radio" name={name} checked={value === item.value} onChange={() => onChange(item.value)} />
              {item.label}
            </span>
            {item.description && <span className="mt-1 block text-xs th-text-secondary">{item.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function IdeaPanel({
  idea,
  onIdea,
  genre,
  onGenre,
  allowedGenres,
  format,
  onFormat,
  suggestions,
  suggesting,
  onSuggest,
  quality,
  onQuality,
  limit,
  onLimit,
  available,
  starting,
  onStart,
  advancedHref,
}: {
  idea: string;
  onIdea: (value: string) => void;
  genre: StoryGenre | null;
  onGenre: (value: StoryGenre | null) => void;
  allowedGenres: StoryGenre[];
  format: FilmFormat | null;
  onFormat: (value: FilmFormat | null) => void;
  suggestions: { title: string; idea: string }[];
  suggesting: boolean;
  onSuggest: () => void;
  quality: QualityId;
  onQuality: (value: QualityId) => void;
  limit: number;
  onLimit: (value: number) => void;
  /** Điểm kênh đang có, kể cả phần tự chuyển từ ví; null khi chưa tải xong. */
  available: number | null;
  starting: boolean;
  onStart: () => void;
  advancedHref: string;
}) {
  const [advanced, setAdvanced] = useState(false);
  const option = QUALITY_OPTIONS.find((item) => item.id === quality)!;
  // Để trống là một lựa chọn hợp lệ: AIDA tự nghĩ ba hướng, tự chọn một và làm
  // tới hết phim. Chỉ chặn ý tưởng viết dở vài chữ.
  const written = idea.trim();
  const ready = (!written || written.length >= 10) && limit >= option.estimatedPoints * 0.5;
  const choices = [genre, format].filter(Boolean).length;
  return (
    <section className="flex flex-col gap-6" aria-labelledby="idea-title">
      <header>
        <h2 id="idea-title" className="text-xl font-semibold th-text-primary">Tập mới</h2>
        <p className="mt-1 text-sm th-text-secondary">
          Có ý tưởng thì viết vào, không thì để trống — AIDA tự nghĩ chuyện và làm tới khi ra phim.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Textarea
          id="idea"
          label="Tập này kể chuyện gì? (không bắt buộc)"
          value={idea}
          onChange={(event) => onIdea(event.target.value)}
          rows={4}
          placeholder="Ví dụ: Đậu Đỏ than lương của mẹ về ba ngày đã hết."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSuggest} loading={suggesting}>
            <Lightbulb size={16} aria-hidden /> Xem vài gợi ý
          </Button>
          {suggestions.map((suggestion) => (
            <Chip key={suggestion.title} onClick={() => onIdea(suggestion.idea)} title={suggestion.idea}>
              {suggestion.title}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {written && written.length < 10 ? (
          <p className="text-xs th-text-secondary">Viết thêm vài chữ, hoặc xoá hết để AIDA tự nghĩ.</p>
        ) : (
          <PriceLine
            points={{ min: Math.min(option.estimatedPoints, limit), max: limit }}
            available={available}
            note="khoảng 5–10 phút · rời trang cũng được"
          />
        )}
        <Button size="lg" className="w-fit" onClick={onStart} disabled={!ready} loading={starting}>
          {written ? <Clapperboard size={20} aria-hidden /> : <Sparkles size={20} aria-hidden />}
          Làm phim
        </Button>
      </div>

      <div className="rounded-2xl border th-border">
        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          aria-expanded={advanced}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm th-text-secondary"
        >
          <span>
            Tuỳ chọn thêm
            {choices > 0 && <span className="ml-1 th-text-accent">· đã chọn {choices}</span>}
          </span>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {advanced && (
          <div className="flex flex-col gap-4 border-t th-border px-4 py-4">
            <ChoiceGroup
              legend="Cách kể"
              name="story-genre"
              value={genre}
              onChange={onGenre}
              choices={GENRE_CHOICES.filter((item) => !item.value || allowedGenres.includes(item.value))}
            />
            <ChoiceGroup
              legend="Cách quay"
              name="film-format"
              value={format}
              onChange={onFormat}
              choices={FORMAT_CHOICES.filter((item) => genre !== "emotion" || !item.comedyOnly)}
            />
            <ChoiceGroup
              legend="Chất lượng"
              name="quality"
              value={quality}
              onChange={(value) => {
                onQuality(value);
                onLimit(QUALITY_OPTIONS.find((item) => item.id === value)!.defaultLimit);
              }}
              choices={QUALITY_OPTIONS.map((item) => ({
                value: item.id,
                label: `${item.label} · khoảng ${formatPoints(item.estimatedPoints)}`,
                description: item.description,
              }))}
            />
            <div className="max-w-56">
              <Input
                id="film-limit"
                label="Chi tối đa cho tập này (điểm)"
                type="number"
                min={50}
                step={50}
                value={limit}
                onChange={(event) => onLimit(Number(event.target.value))}
              />
              <p className="mt-1 text-xs th-text-secondary">Sắp vượt mức này sẽ dừng lại hỏi bạn.</p>
            </div>
            <Link href={advancedHref} className="w-fit text-sm th-text-accent underline-offset-2 hover:underline">
              Chỉnh tay từng cảnh và giọng nói
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export function ProgressPanel({
  run,
  busy,
  refundedPoints,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: {
  run: StudioRun;
  busy: boolean;
  /** Điểm đã hoàn cho các bước hỏng của tập này. */
  refundedPoints: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  /** Làm lại tập đã dừng hẳn; phần đã xong được dùng lại. */
  onRetry: () => void;
}) {
  if (run.status === "failed")
    return (
      <JobStatus
        state="failed"
        title="Tập này dừng giữa chừng"
        detail={run.error ? humanizeError(run.error) : "Phần đã làm vẫn được giữ."}
        refundedPoints={refundedPoints}
        onRetry={busy ? undefined : onRetry}
        retryLabel="Làm lại tập này"
      />
    );
  const current = runStep(run);
  const stopped = run.status === "cancelled";
  const percent = Math.min(100, Math.round((run.points_committed / Math.max(1, run.max_points_per_film)) * 100));
  return (
    <section className="flex flex-col gap-4 rounded-2xl border th-border th-bg-card p-4 sm:p-5" aria-label="Tiến độ">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-base font-medium th-text-primary" role="status" aria-live="polite">
          {runIsActive(run) && <span className="h-2 w-2 animate-pulse rounded-full th-bg-accent" aria-hidden />}
          {runHeadline(run)}
        </p>
        <div className="flex gap-2">
          {runIsActive(run) && (
            <Button variant="outline" size="sm" onClick={onPause} disabled={busy}>
              <Pause size={16} aria-hidden /> Tạm dừng
            </Button>
          )}
          {run.status === "paused" && (
            <Button size="sm" onClick={onResume} disabled={busy}>
              <Play size={16} aria-hidden /> Làm tiếp
            </Button>
          )}
          {!stopped && run.status !== "completed" && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              <X size={16} aria-hidden /> Huỷ tập
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
                className={`h-1.5 rounded-full ${done ? "th-bg-accent" : now ? "th-bg-accent opacity-50" : "th-bg-tertiary"}`}
                aria-hidden
              />
              <span className={`text-xs leading-tight ${now ? "font-medium th-text-primary" : done ? "th-text-secondary" : "th-text-muted"}`}>
                {step.label}
                <span className="sr-only">{done ? " (xong)" : now ? " (đang làm)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3 text-xs th-text-secondary">
        <div className="h-1 flex-1 overflow-hidden rounded-full th-bg-tertiary" aria-hidden>
          <div className="h-full th-bg-accent opacity-60" style={{ width: `${percent}%` }} />
        </div>
        Đã dùng {formatPoints(run.points_committed)} / {formatPoints(run.max_points_per_film)}
      </div>
      {stopped && refundedPoints > 0 && (
        <p className="text-xs th-text-secondary">Đã hoàn {formatPoints(refundedPoints)} vào kênh.</p>
      )}
    </section>
  );
}

function MediaPreview({ task }: { task: StudioTask }) {
  if (!task.url) return null;
  if (["image", "frame"].includes(task.kind))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={task.url} alt="Kết quả cần xem" className="max-h-80 w-full rounded-xl object-contain th-bg-tertiary" />;
  if (task.kind === "tts") return <audio src={task.url} controls className="w-full" />;
  return <video src={task.url} poster={task.posterUrl} controls playsInline className="max-h-80 w-full rounded-xl th-bg-tertiary" />;
}

export function AttentionPanel({
  attention,
  busy,
  onUseAnyway,
  onRegenerate,
  onRaiseBudget,
  onTopUp,
  onAcceptScript,
  onRewriteScript,
  onRetry,
}: {
  attention: Attention;
  busy: boolean;
  onUseAnyway: (task: StudioTask) => void;
  onRegenerate: (task: StudioTask, reason: string) => void;
  onRaiseBudget: (limit: number) => void;
  /** Kênh hết điểm: mở hộp nạp, nạp xong tập tự làm tiếp. */
  onTopUp: () => void;
  onAcceptScript: () => void;
  onRewriteScript: () => void;
  onRetry: () => void;
}) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  if (attention.kind === "none") return null;
  const frame = (title: string, body: React.ReactNode) => (
    <section className="flex flex-col gap-4 rounded-2xl border th-border-warning th-bg-warning-light p-4 sm:p-5" aria-label="Cần bạn quyết định">
      <h3 className="flex items-center gap-2 text-base font-semibold th-text-primary">
        <AlertTriangle size={20} className="th-text-warning" aria-hidden /> {title}
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

  if (attention.kind === "budget" && attention.cause === "wallet")
    return frame(
      "Kênh hết điểm",
      <>
        <p className="text-sm th-text-primary">
          Tập này đã dùng {formatPoints(attention.used)}. Phần đã làm được giữ nguyên; nạp thêm là tập tự làm tiếp.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onTopUp} disabled={busy}>
            <Coins size={16} aria-hidden /> Nạp điểm
          </Button>
        </div>
      </>,
    );

  if (attention.kind === "budget")
    return frame(
      "Tập này sắp vượt mức chi bạn đặt",
      <>
        <p className="text-sm th-text-primary">
          Đã dùng {formatPoints(attention.used)} / {formatPoints(attention.limit)}. Phần đã làm được giữ nguyên.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onRaiseBudget(attention.suggested)} disabled={busy}>
            Nâng lên {formatPoints(attention.suggested)} và làm tiếp
          </Button>
        </div>
      </>,
    );

  if (attention.kind === "script")
    return frame(
      "Kịch bản còn vài chỗ chưa ổn",
      <>
        {attention.summary && <p className="text-sm th-text-primary">{attention.summary}</p>}
        {issueList(attention.issues)}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRewriteScript} disabled={busy}>
            <RefreshCw size={16} aria-hidden /> Viết lại kịch bản
          </Button>
          <Button variant="outline" onClick={onAcceptScript} disabled={busy}>
            Kịch bản ổn, làm tiếp
          </Button>
        </div>
      </>,
    );

  if (attention.kind === "generic")
    return frame(
      "Cần bạn xem qua trước khi làm tiếp",
      <>
        <p className="text-sm th-text-primary">{attention.message}</p>
        <div>
          <Button onClick={onRetry} disabled={busy}>
            <Play size={16} aria-hidden /> Thử làm tiếp
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
          <p className="text-sm font-medium th-text-primary">Chỗ chưa ổn:</p>
          {issueList(attention.issues)}
          {!!task.refunded_points && (
            <p className="text-xs th-text-secondary">Đã hoàn {formatPoints(task.refunded_points)} của bước này vào kênh.</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm th-text-primary">Làm lại vì:</p>
        <div className="flex flex-wrap gap-2">
          {REGENERATE_REASONS.map((item) => {
            const on = reasons.includes(item);
            return (
              <Chip
                key={item}
                selected={on}
                onClick={() => setReasons((list) => (on ? list.filter((value) => value !== item) : [...list, item]))}
              >
                {item}
              </Chip>
            );
          })}
        </div>
        <Input
          aria-label="Ghi thêm"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi thêm nếu cần, ví dụ: nhân vật phải đi chân trần"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onRegenerate(task, reason || attention.issues.join("; ") || "Kết quả chưa đạt")} disabled={busy}>
          <RefreshCw size={16} aria-hidden /> Làm lại
        </Button>
        <Button variant="outline" onClick={() => onUseAnyway(task)} disabled={busy}>
          <Check size={16} aria-hidden /> Vẫn dùng bản này
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
    <section className="rounded-2xl border th-border th-bg-card" aria-labelledby="script-title">
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-2 text-left">
          <ChevronDown size={16} className={`th-text-secondary transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
          <h3 id="script-title" className="text-base font-semibold th-text-primary">Kịch bản · {title}</h3>
        </button>
        {editHref && (
          <Link href={editHref} className="text-sm th-text-accent underline-offset-2 hover:underline">
            Chỉnh tay
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
          <li key={scene.number} className="overflow-hidden rounded-xl border th-border th-bg-card">
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
  caption = "",
  hashtags = [],
}: {
  film: StudioTask;
  approving: boolean;
  onApprove: () => void;
  /** Lời giới thiệu tập phim, dùng làm nội dung bài đăng. */
  caption?: string;
  hashtags?: string[];
}) {
  const approved = Boolean(film.approved_at);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border th-border-success th-bg-card p-4 sm:p-5" aria-label="Phim đã xong">
      <h3 className="flex items-center gap-2 text-base font-semibold th-text-primary">
        <Sparkles size={20} className="th-text-success" aria-hidden /> Phim đã xong
      </h3>
      <video src={film.url} poster={film.posterUrl} controls playsInline className="w-full rounded-xl bg-black" />
      <div className="flex flex-wrap gap-2">
        {approved ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl th-bg-success-light px-3 py-2 text-sm th-text-success">
            <Check size={16} aria-hidden /> Đã duyệt
          </span>
        ) : (
          <Button onClick={onApprove} loading={approving}>
            <Check size={16} aria-hidden /> Duyệt phim
          </Button>
        )}
        <a href={film.url} download className={buttonClasses("outline")}>
          <Download size={16} aria-hidden /> Tải phim
        </a>
        {film.srtUrl && (
          <a href={film.srtUrl} download className={buttonClasses("outline")}>
            <Download size={16} aria-hidden /> Tải phụ đề
          </a>
        )}
      </div>
      {/* Tải phim về rồi vẫn còn phải tự nghĩ nội dung bài đăng; đưa luôn khối
          chữ dán được vào bài. */}
      <SharePost caption={caption} hashtags={hashtags} label="Sao chép bài đăng" />
    </section>
  );
}

export type VoiceCharacter = { id: string; name: string; hasSample: boolean };
export type VoiceCandidate = {
  key: string;
  characterId: string;
  name: string;
  dialogue: string;
  taskId: string;
  inSeconds: number;
  outSeconds: number;
};

/**
 * Giọng mẫu giữ cho mỗi nhân vật nói một giọng qua mọi cảnh khi nhân vật tự
 * nói. Cách dễ nhất là nghe phim rồi bấm vào câu nói hay nhất; thêm file thu
 * sẵn dành cho ai có giọng thật được phép dùng.
 */
export function VoiceSamplePanel({
  characters,
  candidates,
  busy,
  onUseClip,
  onUpload,
}: {
  characters: VoiceCharacter[];
  candidates: VoiceCandidate[];
  busy: boolean;
  onUseClip: (candidate: VoiceCandidate) => void;
  onUpload: (input: { characterId: string; file: File; seconds: number; direction: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [characterId, setCharacterId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [direction, setDirection] = useState("");
  const [rights, setRights] = useState(false);
  if (!characters.length) return null;
  const pick = (value: File | null) => {
    setFile(value);
    setSeconds(0);
    if (!value) return;
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      setSeconds(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.src = URL.createObjectURL(value);
  };
  const lengthOk = seconds >= 3 && seconds <= 12;
  return (
    <section aria-labelledby="voice-title" className="flex flex-col gap-3 rounded-2xl border th-border th-bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 id="voice-title" className="flex items-center gap-2 text-sm font-semibold th-text-primary">
            <Mic size={16} aria-hidden /> Giọng nhân vật
          </h3>
          <p className="mt-1 text-xs th-text-secondary">
            Sau tập đầu, câu nói hay nhất của mỗi nhân vật được giữ làm giọng cho các tập sau. Muốn thì đổi.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "Thu gọn" : "Đổi giọng"}
        </Button>
      </header>
      <ul className="flex flex-wrap gap-2">
        {characters.map((character) => (
          <li
            key={character.id}
            className={`rounded-full border px-3 py-1 text-xs ${character.hasSample ? "th-border-success th-text-success" : "th-border th-text-secondary"}`}
          >
            {character.name} · {character.hasSample ? "đã có giọng chuẩn" : "sẽ chọn sau tập này"}
          </li>
        ))}
      </ul>
      {expanded && candidates.length > 0 && (
        <ul className="flex flex-col">
          {candidates.map((candidate) => (
            <li key={candidate.key} className="flex flex-wrap items-center justify-between gap-2 border-t th-border py-2 first:border-t-0">
              <span className="min-w-0 text-sm th-text-primary">
                <span className="font-medium">{candidate.name}:</span> “{candidate.dialogue}”
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUseClip(candidate)}>
                Dùng giọng câu này
              </Button>
            </li>
          ))}
        </ul>
      )}
      {expanded && (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setOpen((value) => !value)}>
          {open ? "Đóng" : "Hoặc thêm giọng thu sẵn"}
        </Button>
      )}
      {expanded && open && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (file && characterId && lengthOk && rights) onUpload({ characterId, file, seconds, direction });
          }}
        >
          <Select aria-label="Giọng của ai" value={characterId} onChange={(event) => setCharacterId(event.target.value)}>
            <option value="">Giọng của ai?</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>{character.name}</option>
            ))}
          </Select>
          <input
            type="file"
            aria-label="Chọn file giọng"
            accept="audio/wav,audio/x-wav,audio/mpeg"
            onChange={(event) => pick(event.target.files?.[0] || null)}
            className="text-sm th-text-secondary"
          />
          {file && !lengthOk && (
            <p className="text-xs th-text-warning">File dài 3–12 giây, chỉ có giọng một người.</p>
          )}
          <Input
            aria-label="Tả giọng"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            placeholder="Tả giọng, ví dụ: giọng nữ trẻ, nói nhanh, hơi khàn"
          />
          <label className="flex items-start gap-2 text-xs th-text-secondary">
            <input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />
            Tôi có quyền dùng giọng trong file này.
          </label>
          <Button type="submit" size="sm" className="w-fit" disabled={busy || !file || !characterId || !lengthOk || !rights}>
            Lưu giọng chuẩn
          </Button>
        </form>
      )}
    </section>
  );
}

/**
 * Lựa chọn thứ hai sau "làm một tập": để kênh tự ra phim đều đặn. Ý tưởng mỗi
 * tập tự nghĩ (chống lặp các tập gần đây), nên người dùng chỉ chọn nhịp và mức
 * chi; hàng chờ chỉ dành cho ai đã có sẵn tập muốn làm trước. Đây là nơi duy
 * nhất sửa lịch phim.
 */
export function AutopilotPanel({
  settings,
  episodes,
  saving,
  onSave,
}: {
  settings: FilmSchedule;
  episodes: EpisodeSummary[];
  saving: boolean;
  onSave: (next: FilmSchedule) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const dirty = scheduleChanged(draft, settings);
  const candidates = draft.queue.length < QUEUE_LIMIT ? queueCandidates(episodes, draft.queue) : [];
  const setQueue = (queue: FilmSchedule["queue"]) => setDraft({ ...draft, queue });
  return (
    <Card className="p-4">
      <section aria-labelledby="autopilot-title" className="flex flex-col gap-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 id="autopilot-title" className="text-sm font-semibold th-text-primary">Tự làm mỗi ngày</h3>
            <p className="mt-1 text-xs th-text-secondary">
              Mỗi ngày tự nghĩ ý mới và làm thành phim. Phim xong nằm trong danh sách tập.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm th-text-primary">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              className="th-accent-control h-4 w-4"
            />
            {draft.enabled ? "Đang bật" : "Tắt"}
          </label>
        </header>
        {draft.enabled && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              id="autopilot-count"
              label="Mỗi ngày"
              value={draft.filmsPerDay}
              onChange={(event) => setDraft({ ...draft, filmsPerDay: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>{count} phim</option>
              ))}
            </Select>
            <Input
              id="autopilot-time"
              label="Bắt đầu lúc"
              type="time"
              value={draft.localTime}
              onChange={(event) => setDraft({ ...draft, localTime: event.target.value })}
            />
            <Input
              id="autopilot-limit"
              label="Chi tối đa mỗi phim"
              type="number"
              min={50}
              step={50}
              value={draft.maxPointsPerFilm}
              onChange={(event) => setDraft({ ...draft, maxPointsPerFilm: Number(event.target.value) || 0 })}
            />
          </div>
        )}
        {draft.enabled && (
          <PriceLine
            points={draft.maxPointsPerFilm * draft.filmsPerDay}
            note="mức chi tối đa cả ngày, các phim làm lần lượt"
          />
        )}
        {draft.enabled && (
          <div className="flex flex-col gap-2 border-t th-border pt-3">
            <div>
              <h4 className="text-sm font-medium th-text-primary">Hàng chờ</h4>
              <p className="mt-0.5 text-xs th-text-secondary">
                Lịch mỗi ngày sẽ làm các tập này trước, hết hàng chờ thì AIDA tự nghĩ ý mới.
              </p>
            </div>
            {draft.queue.length ? (
              <ol className="flex flex-col gap-1.5" aria-label="Các tập trong hàng chờ">
                {draft.queue.map((item, index) => {
                  const title = item.title || "Tập chưa đặt tên";
                  return (
                    <li key={item.id} className="flex items-center gap-1 rounded-xl border th-border py-1 pl-3 pr-1">
                      <span className="w-5 shrink-0 text-xs th-text-muted">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm th-text-primary" title={title}>{title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2"
                        aria-label={`Đưa “${title}” lên trước`}
                        disabled={index === 0}
                        onClick={() => setQueue(moveInQueue(draft.queue, index, -1))}
                      >
                        <ArrowUp size={16} aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2"
                        aria-label={`Đưa “${title}” xuống sau`}
                        disabled={index === draft.queue.length - 1}
                        onClick={() => setQueue(moveInQueue(draft.queue, index, 1))}
                      >
                        <ArrowDown size={16} aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2"
                        aria-label={`Bỏ “${title}” khỏi hàng chờ`}
                        onClick={() => setQueue(draft.queue.filter((other) => other.id !== item.id))}
                      >
                        <X size={16} aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState
                icon={ListOrdered}
                title="Chưa xếp tập nào"
                hint={
                  candidates.length
                    ? "Không xếp cũng được: AIDA tự nghĩ ý mới mỗi ngày."
                    : "Tập đã có kịch bản mà chưa thành phim sẽ hiện ở đây để bạn xếp trước."
                }
                className="py-6"
              />
            )}
            {candidates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs th-text-secondary">Thêm vào hàng chờ:</p>
                <div className="flex flex-wrap gap-2">
                  {candidates.map((item) => (
                    <Chip key={item.id} title={item.title} onClick={() => setQueue([...draft.queue, item])}>
                      <Plus size={12} aria-hidden />
                      <span className="max-w-48 truncate">{item.title || "Tập chưa đặt tên"}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {dirty && (
          <Button size="sm" className="w-fit" loading={saving} disabled={draft.maxPointsPerFilm < 50} onClick={() => onSave(draft)}>
            Lưu
          </Button>
        )}
      </section>
    </Card>
  );
}
