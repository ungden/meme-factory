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
// Hồ sơ kênh mặc định cho kênh AI vừa dựng; chủ kênh sửa sau trong Studio phim.
const DEFAULT_TONE = "Hài tự nhiên và cảm động có nguyên nhân";
const LANDING_DRAFT = "aida:landing-draft";

/**
 * Lối vào chính của AIDA: gõ ý tưởng (hoặc để trống), chọn kênh và loại nội
 * dung, AI làm phần còn lại. Chưa có kênh thì AI dựng kênh từ chính ý tưởng đó,
 * không qua bước khởi tạo nào. Phim chuyển sang Studio phim của kênh vì có thể
 * cần hỏi người dùng giữa chừng; meme làm ngay và hiện kết quả ở trang này.
 */
export default function HomeComposer({
  projects,
  onStarted,
  onChannelCreated,
  preset,
}: {
  projects: Project[];
  onStarted: () => void;
  onChannelCreated: () => void;
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
  // Kênh vừa dựng chưa có trong danh sách cho tới khi trang tải lại danh sách;
  // trong lúc đó không được tự nhảy sang kênh khác.
  const justCreated = useRef<string | null>(null);

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
    if (justCreated.current === channelId && !projects.some((project) => project.id === channelId)) return;
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
  // Kênh mới cần một ý tưởng thật: AI dựng tên, người xem và nhân vật từ nó.
  const tooShort = (written.length > 0 || newChannel) && written.length < 10;
  const film = QUALITY_OPTIONS[0];

  /** Dựng kênh từ ý tưởng; với phim, đặt luôn hồ sơ kênh để Studio không hỏi lại. */
  async function createChannel(): Promise<Channel> {
    setStage("AI đang dựng kênh và nhân vật từ ý tưởng của bạn…");
    const response = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: written }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.project) throw new Error(payload.error || "Chưa dựng được kênh. Hãy thử lại.");
    const created = payload.project as Channel;
    if (kind === "film")
      // Hỏng ở đây thì Studio hiện lại mẫu hồ sơ kênh; không đáng chặn cả lượt.
      await fetch(`/api/projects/${created.id}/channel-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: payload.audience || "Người xem video ngắn ở Việt Nam",
          tone: DEFAULT_TONE,
          positioning: written,
          speechRegister: "natural",
          genres: ["comedy", "emotion"],
          characterIds: payload.characterIds || [],
        }),
      }).catch(() => undefined);
    justCreated.current = created.id;
    setChannelId(created.id);
    onChannelCreated();
    toast.success(`Đã dựng kênh "${created.name}". Đổi tên hay nhân vật lúc nào cũng được.`);
    return created;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort || busy) return;
    setError("");
    setBusy(true);
    try {
      const target: Channel | null = newChannel ? await createChannel() : channel;
      if (!target) return;
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
        <h1 id="home-title" className="text-2xl font-bold tracking-[-0.02em] th-text-primary sm:text-3xl">
          Hôm nay kênh của bạn đăng gì?
        </h1>
        <p className="mt-2 text-sm th-text-secondary">Gõ ý tưởng hoặc để trống. AI tự nghĩ, dựng, quay và gửi kết quả về đây.</p>
      </div>

      <div className="rounded-2xl border th-border th-bg-card p-3 shadow-sm focus-within:th-border-accent sm:p-4">
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
          <label className="flex min-h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border th-border px-3 text-sm th-text-secondary">
            <span className="shrink-0">Kênh</span>
            <select
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              className="min-w-0 max-w-[200px] truncate bg-transparent font-medium th-text-primary outline-none"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
              <option value={NEW_CHANNEL}>+ Kênh mới, AI tự dựng</option>
            </select>
          </label>
          <Button type="submit" loading={busy} disabled={tooShort} className="ml-auto rounded-full" aria-label={written ? "Bắt đầu làm" : "Để AI tự nghĩ và làm"}>
            {written ? <ArrowUp size={17} aria-hidden /> : <Sparkles size={17} aria-hidden />}
            {written || newChannel ? (kind === "film" ? "Làm phim" : "Làm meme") : "AI tự nghĩ"}
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
        {stage
          ? stage
          : tooShort
          ? newChannel
            ? "Gõ ý tưởng đầu tiên (ít nhất vài chữ). AI dựng kênh, đặt tên và nghĩ nhân vật từ nó."
            : "Viết thêm một chút, hoặc xoá hết để AI tự nghĩ."
          : newChannel
            ? "AI dựng kênh mới từ ý tưởng này rồi làm luôn. Đổi tên hay nhân vật lúc nào cũng được."
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
