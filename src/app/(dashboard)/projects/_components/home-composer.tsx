"use client";

import { FormEvent, useEffect, useState } from "react";
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

const LAST_CHANNEL = "aida:home-channel";
const LANDING_DRAFT = "aida:landing-draft";

/**
 * Lối vào chính của AIDA: gõ ý tưởng (hoặc để trống), chọn kênh và loại nội
 * dung, AI làm phần còn lại. Phim chuyển sang Studio phim của kênh vì có thể
 * cần hỏi người dùng giữa chừng; meme làm ngay và hiện kết quả ở trang này.
 */
export default function HomeComposer({ projects, onStarted }: { projects: Project[]; onStarted: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [idea, setIdea] = useState("");
  const [kind, setKind] = useState<Kind>("film");
  const [format, setFormat] = useState<FilmFormat | null>(null);
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    if (!projects.length || projects.some((project) => project.id === channelId)) return;
    let remembered = "";
    try {
      remembered = window.localStorage.getItem(LAST_CHANNEL) || "";
    } catch {
      // Không đọc được thì dùng kênh vừa cập nhật gần nhất.
    }
    setChannelId(projects.find((project) => project.id === remembered)?.id || projects[0].id);
  }, [projects, channelId]);

  const channel = projects.find((project) => project.id === channelId) || null;
  const written = idea.trim();
  const tooShort = written.length > 0 && written.length < 10;
  const film = QUALITY_OPTIONS[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort || busy) return;
    setError("");
    if (!channel) {
      // Chưa có kênh: giữ ý tưởng để bước tạo kênh dùng lại.
      try {
        window.sessionStorage.setItem(LANDING_DRAFT, JSON.stringify({ idea: written, output: kind === "film" ? "Tạo phim ngắn" : "Tạo ảnh" }));
      } catch {
        // Mất nháp không chặn việc tạo kênh.
      }
      router.push("/onboarding");
      return;
    }
    try {
      window.localStorage.setItem(LAST_CHANNEL, channel.id);
      window.sessionStorage.removeItem(LANDING_DRAFT);
    } catch {
      // Chỉ là ghi nhớ cho lần sau.
    }
    const ref = getProjectRouteRef(channel);
    if (kind === "film") {
      giveFilmHandoff(ref, { idea: written, format, key: crypto.randomUUID() });
      router.push(`/projects/${ref}/short-films`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${channel.id}/meme-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceVersion: channel.workspace_version,
          intent: written,
          count: 1,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Chưa bắt đầu được. Hãy thử lại.");
      setIdea("");
      toast.success(`AI đang làm meme cho ${channel.name}. Ảnh sẽ hiện ở bên dưới.`);
      onStarted();
    } catch (cause) {
      setError(humanizeError((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby="home-title">
      <div className="text-center">
        <h1 id="home-title" className="text-2xl font-bold tracking-[-0.02em] th-text-primary sm:text-3xl">
          Hôm nay kênh của bạn đăng gì?
        </h1>
        <p className="mt-2 text-sm th-text-secondary">Gõ ý tưởng hoặc để trống. AI tự nghĩ, dựng, quay và gửi kết quả về đây.</p>
      </div>

      <div className="rounded-2xl border th-border th-bg-card p-3 shadow-sm focus-within:th-border-accent sm:p-4">
        <textarea
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
          className="w-full resize-none bg-transparent px-1 py-1 text-base th-text-primary outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Loại nội dung" className="flex rounded-full border th-border p-0.5">
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
                className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${kind === value ? "th-bg-accent-light th-text-accent" : "th-text-secondary"}`}
              >
                <Icon size={15} aria-hidden /> {label}
              </button>
            ))}
          </div>
          {projects.length > 0 && (
            <label className="flex min-h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border th-border px-3 text-sm th-text-secondary">
              <span className="shrink-0">Kênh</span>
              <select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                className="min-w-0 max-w-[180px] truncate bg-transparent font-medium th-text-primary outline-none"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit" loading={busy} disabled={tooShort} className="ml-auto rounded-full" aria-label={written ? "Bắt đầu làm" : "Để AI tự nghĩ và làm"}>
            {written ? <ArrowUp size={17} aria-hidden /> : <Sparkles size={17} aria-hidden />}
            {written ? (kind === "film" ? "Làm phim" : "Làm meme") : "AI tự nghĩ"}
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
              className={`min-h-8 rounded-full border px-3 text-xs ${format === choice.value ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-bg-card th-text-secondary hover:th-bg-hover"}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-xs th-text-secondary">
        {tooShort
          ? "Viết thêm một chút, hoặc xoá hết để AI tự nghĩ."
          : !projects.length
            ? "Bạn chưa có kênh nào. Bấm làm để tạo kênh đầu tiên, ý tưởng này được giữ lại."
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
