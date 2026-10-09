"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Clapperboard, Images, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { humanizeError } from "@/lib/error-messages";
import { giveFilmHandoff } from "@/lib/home-handoff";
import { getProjectRouteRef } from "@/lib/project-visuals";
import type { FilmFormat } from "@/lib/film-camera-language";
import type { Project } from "@/types/database";
import { FORMAT_CHOICES, QUALITY_OPTIONS } from "../[id]/short-films/_lib/studio";

type Kind = "film" | "meme";

/**
 * Chọn sẵn ô nhập từ nơi khác trên trang: "Làm thêm kiểu này" (cùng kênh, cùng
 * loại, cùng cách quay) hoặc "Kênh mới" (`projectId` = NEW_CHANNEL).
 */
export type ComposerPreset = { kind?: Kind; projectId: string; format?: FilmFormat | null; nonce: number };

export const NEW_CHANNEL = "new";

type Channel = { id: string; slug?: string | null; name: string; workspace_version?: number | null };

const LAST_CHANNEL = "aida:home-channel";

const LANDING_DRAFT = "aida:landing-draft";

/**
 * Lối vào chính của AIDA: gõ ý tưởng (hoặc để trống), chọn kênh và loại nội
 * dung, AI làm phần còn lại. Chưa có kênh thì ý tưởng thành mô tả cho bước tạo
 * kênh (hồ sơ kênh → nhân vật). Phim chuyển sang Studio phim của kênh vì có thể
 * cần hỏi người dùng giữa chừng; meme làm ngay và hiện kết quả ở trang này.
 */
export default function HomeComposer({
  projects,
  onStarted,
  preset,
}: {
  projects: Project[];
  onStarted: () => void;
  preset: ComposerPreset | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [idea, setIdea] = useState("");
  const [kind, setKind] = useState<Kind>("film");
  const [format, setFormat] = useState<FilmFormat | null>(null);
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  // Ý tưởng để trống: AI tự nghĩ chuyện mới, chỉ giữ kiểu của bài người dùng thích.
  useEffect(() => {
    if (!preset) return;
    if (preset.kind) setKind(preset.kind);
    setChannelId(preset.projectId);
    setFormat(preset.kind === "film" ? preset.format || null : null);
    setIdea("");
    setError("");
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    box.current?.focus({ preventScroll: true });
  }, [preset]);

  // Ý tưởng gõ ở trang giới thiệu trước khi đăng nhập vẫn còn ở đây.
  useEffect(() => {
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(LANDING_DRAFT) || "null") as { idea?: string; output?: string } | null;
      if (draft?.idea) setIdea(draft.idea);
      if (draft?.output) setKind(draft.output === "Tạo phim ngắn" ? "film" : "meme");
    } catch {
      // Nháp hỏng thì bắt đầu trống.
    }
  }, []);

  useEffect(() => {
    if (channelId === NEW_CHANNEL || projects.some((project) => project.id === channelId)) return;
    if (!projects.length) return setChannelId(NEW_CHANNEL);
    let remembered = "";
    try {
      remembered = window.localStorage.getItem(LAST_CHANNEL) || "";
    } catch {
      // Không đọc được thì dùng kênh vừa cập nhật gần nhất.
    }
    setChannelId(projects.find((project) => project.id === remembered)?.id || projects[0].id);
  }, [projects, channelId]);

  const channel = projects.find((project) => project.id === channelId) || null;
  const newChannel = channelId === NEW_CHANNEL;
  const written = idea.trim();
  const tooShort = !newChannel && written.length > 0 && written.length < 10;
  const film = QUALITY_OPTIONS[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort || busy) return;
    setError("");
    if (newChannel || !channel) {
      // Kênh mới đi qua đủ hai bước: hồ sơ kênh rồi nhân vật. Ý tưởng được giữ
      // làm mô tả kênh ban đầu.
      try {
        window.sessionStorage.setItem(LANDING_DRAFT, JSON.stringify({ idea: written, output: kind === "film" ? "Tạo phim ngắn" : "Tạo ảnh" }));
      } catch {
        // Mất nháp không chặn việc tạo kênh.
      }
      router.push("/projects/new");
      return;
    }
    setBusy(true);
    try {
      const target: Channel = channel;
      try {
        window.localStorage.setItem(LAST_CHANNEL, target.id);
        window.sessionStorage.removeItem(LANDING_DRAFT);
      } catch {
        // Chỉ là ghi nhớ cho lần sau.
      }
      const ref = getProjectRouteRef(target);
      if (kind === "film") {
        giveFilmHandoff(ref, { idea: written, format, key: crypto.randomUUID() });
        router.push(`/projects/${ref}/short-films`);
        return;
      }
      setStage("");
      const response = await fetch(`/api/projects/${target.id}/meme-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceVersion: target.workspace_version,
          intent: written,
          count: 1,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Chưa bắt đầu được. Hãy thử lại.");
      setIdea("");
      toast.success(`AI đang làm meme cho ${target.name}. Ảnh sẽ hiện ở bên dưới.`);
      onStarted();
    } catch (cause) {
      setError(humanizeError((cause as Error).message));
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby="home-title">
      <div className="text-center">
        <h1 id="home-title" className="text-[28px] font-semibold leading-tight tracking-[-0.035em] th-text-primary sm:text-[40px]">
          Hôm nay kênh của bạn <span className="th-text-gradient">đăng gì?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] th-text-secondary">Gõ ý tưởng hoặc để trống. AI tự nghĩ, dựng, quay và gửi kết quả về đây.</p>
      </div>

      <div className="mt-2 rounded-[22px] border th-border th-bg-elevated p-2.5 th-shadow-lg transition-shadow focus-within:shadow-[0_0_0_1px_var(--accent-border),0_24px_70px_-24px_var(--accent-shadow)] sm:p-3">
        <textarea
          ref={box}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={3}
          maxLength={2000}
          aria-label="Ý tưởng"
          placeholder={
            kind === "film"
              ? "Kể một chuyện nhỏ cho tập phim, hoặc để trống cho AI tự nghĩ…"
              : "Ví dụ: Thứ Hai đi làm mà lương chưa về… hoặc để trống cho AI tự nghĩ"
          }
          className="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed th-text-primary outline-none placeholder:th-text-muted"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Loại nội dung" className="flex rounded-full p-0.5 th-bg-tertiary">
            {([
              ["film", "Phim ngắn", Clapperboard],
              ["meme", "Meme", Images],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${kind === value ? "th-bg-card th-text-primary th-shadow-sm" : "th-text-tertiary hover:th-text-primary"}`}
              >
                <Icon size={15} aria-hidden /> {label}
              </button>
            ))}
          </div>
          <label className="flex min-h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border th-border px-3 text-[13px] th-text-tertiary th-bg-hover">
            <span className="shrink-0">Kênh</span>
            <select
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              className="min-w-0 max-w-[200px] truncate bg-transparent font-medium th-text-primary outline-none"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
              <option value={NEW_CHANNEL}>+ Tạo kênh mới</option>
            </select>
          </label>
          <Button type="submit" loading={busy} disabled={tooShort} className="ml-auto rounded-full px-4" aria-label={written ? "Bắt đầu làm" : "Để AI tự nghĩ và làm"}>
            {written ? <ArrowUp size={17} aria-hidden /> : <Sparkles size={17} aria-hidden />}
            {newChannel ? "Tạo kênh" : written ? (kind === "film" ? "Làm phim" : "Làm meme") : "AI tự nghĩ"}
          </Button>
        </div>
      </div>

      {kind === "film" && (
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Cách quay">
          {FORMAT_CHOICES.map((choice) => (
            <button
              key={choice.value || "auto"}
              type="button"
              role="radio"
              aria-checked={format === choice.value}
              title={choice.description}
              onClick={() => setFormat(choice.value)}
              className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${format === choice.value ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-text-tertiary th-bg-hover"}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-xs th-text-muted">
        {stage
          ? stage
          : tooShort
          ? "Viết thêm một chút, hoặc xoá hết để AI tự nghĩ."
          : newChannel
            ? "Kênh mới: AI điền hồ sơ kênh từ ý tưởng này, rồi dựng nhân vật. Xong mới làm nội dung."
            : kind === "film"
              ? `Khoảng ${film.estimatedPoints.toLocaleString("vi-VN")}–${QUALITY_OPTIONS[1].estimatedPoints.toLocaleString("vi-VN")} điểm · 5–10 phút · AI hỏi bạn trước khi vượt mức.`
              : "Một meme · khoảng 1 phút · có thể rời trang."}
      </p>
      {error && (
        <p role="alert" className="rounded-lg border th-border-danger th-bg-danger-light px-3 py-2 text-sm th-text-danger">{error}</p>
      )}
    </form>
  );
}
