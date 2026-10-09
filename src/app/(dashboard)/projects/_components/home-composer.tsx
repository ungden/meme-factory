"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, AtSign, Check, Clapperboard, Film, Images, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { humanizeError } from "@/lib/error-messages";
import { giveFilmHandoff, giveVideoHandoff } from "@/lib/home-handoff";
import { getProjectRouteRef } from "@/lib/project-visuals";
import { isTaggable, referencesFor, type TaggableCharacter } from "@/lib/character-refs";
import type { FilmFormat } from "@/lib/film-camera-language";
import type { Project } from "@/types/database";
import { FORMAT_CHOICES, QUALITY_OPTIONS } from "../[id]/short-films/_lib/studio";

type Kind = "film" | "video" | "meme";

/** "Làm thêm kiểu này" từ một thẻ đã xong: cùng kênh, cùng loại, cùng cách quay. */
export type ComposerPreset = { kind?: Kind; projectId: string; format?: FilmFormat | null; nonce: number };

export const NEW_CHANNEL = "new";

type Channel = { id: string; slug?: string | null; name: string; workspace_version?: number | null };

const LAST_CHANNEL = "aida:home-channel";
const LANDING_DRAFT = "aida:landing-draft";

const KINDS: Array<[Kind, string, typeof Clapperboard]> = [
  ["film", "Phim ngắn", Clapperboard],
  ["video", "Video", Film],
  ["meme", "Meme", Images],
];

/**
 * Lối vào chính của AIDA: gõ ý tưởng, chọn kênh và loại nội dung, gắn nhân vật
 * nếu muốn, AI làm phần còn lại. Nhân vật được gắn là tham chiếu: meme và video
 * lấy đúng bộ ảnh của họ nên ai cũng giữ một gương mặt. Không gắn ai thì là bài
 * riêng lẻ (meme để AI chọn từ dàn nhân vật, video để AI tự vẽ).
 * Phim chuyển sang Studio phim vì có thể cần hỏi giữa chừng; video sang trang
 * video để xem giá; meme làm ngay và hiện kết quả ở trang này.
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
  const [cast, setCast] = useState<{ channelId: string; characters: TaggableCharacter[] } | null>(null);
  const [tagged, setTagged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
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

  // Dàn nhân vật của kênh đang chọn, để gắn vào bài.
  useEffect(() => {
    setTagged([]);
    if (!channelId || channelId === NEW_CHANNEL) return setCast(null);
    let active = true;
    fetch(`/api/projects/${channelId}/film-setup`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { characters?: TaggableCharacter[] } | null) => {
        if (active) setCast({ channelId, characters: (payload?.characters || []).filter(isTaggable) });
      })
      .catch(() => {
        if (active) setCast({ channelId, characters: [] });
      });
    return () => {
      active = false;
    };
  }, [channelId]);

  const channel = projects.find((project) => project.id === channelId) || null;
  const newChannel = channelId === NEW_CHANNEL;
  const written = idea.trim();
  // Video cần mô tả cảnh; phim và meme để trống thì AI tự nghĩ.
  const tooShort = !newChannel && (kind === "video" ? written.length < 10 : written.length > 0 && written.length < 10);
  const characters = cast?.channelId === channelId ? cast.characters : [];
  const taggedCharacters = characters.filter((character) => tagged.includes(character.id));

  function remember(target: Channel) {
    try {
      window.localStorage.setItem(LAST_CHANNEL, target.id);
      window.sessionStorage.removeItem(LANDING_DRAFT);
    } catch {
      // Chỉ là ghi nhớ cho lần sau.
    }
  }

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
    remember(channel);
    const ref = getProjectRouteRef(channel);
    if (kind === "film") {
      giveFilmHandoff(ref, { idea: written, format, key: crypto.randomUUID() });
      router.push(`/projects/${ref}/short-films`);
      return;
    }
    if (kind === "video") {
      giveVideoHandoff(ref, { prompt: written, references: referencesFor(taggedCharacters) });
      router.push(`/projects/${ref}/video`);
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
          options: tagged.length ? { characterIds: tagged } : {},
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

  const placeholder =
    kind === "film"
      ? "Kể một chuyện nhỏ cho tập phim, hoặc để trống cho AI tự nghĩ…"
      : kind === "video"
        ? "Tả cảnh trong video: ai, đang làm gì, ở đâu, nói gì…"
        : "Ví dụ: Thứ Hai đi làm mà lương chưa về… hoặc để trống cho AI tự nghĩ";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby="home-title">
      <div className="text-center">
        <h1 id="home-title" className="text-[28px] font-semibold leading-tight tracking-[-0.035em] th-text-primary sm:text-[40px]">
          Hôm nay kênh của bạn <span className="th-text-gradient">đăng gì?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] th-text-secondary">
          Gõ ý tưởng, gắn nhân vật nếu muốn. AI tự viết, dựng, quay và gửi kết quả về đây.
        </p>
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
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed th-text-primary outline-none placeholder:th-text-muted"
        />

        {kind !== "film" && !newChannel && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2" role="group" aria-label="Gắn nhân vật">
            <span className="flex items-center gap-1 text-xs th-text-muted">
              <AtSign size={13} aria-hidden /> Gắn nhân vật
            </span>
            {characters.map((character) => {
              const on = tagged.includes(character.id);
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTagged((list) => (on ? list.filter((id) => id !== character.id) : [...list, character.id]))}
                  className={`flex min-h-8 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors ${on ? "th-border-accent th-bg-accent-light th-text-primary" : "th-border th-text-secondary th-bg-hover"}`}
                >
                  <span className="relative h-6 w-6 overflow-hidden rounded-full th-bg-tertiary">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nhân vật nằm ở kho lưu trữ của app */}
                    <img src={character.references?.identity_face || character.avatarUrl || ""} alt="" className="h-full w-full object-cover" />
                    {on && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                        <Check size={12} aria-hidden />
                      </span>
                    )}
                  </span>
                  {character.name}
                </button>
              );
            })}
            {cast?.channelId === channelId && !characters.length && channel && (
              <Link href={`/projects/${getProjectRouteRef(channel)}/characters`} className="text-xs font-medium th-text-accent underline-offset-2 hover:underline">
                Kênh chưa có nhân vật · Dựng nhân vật
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Loại nội dung" className="flex rounded-full p-0.5 th-bg-tertiary">
            {KINDS.map(([value, label, Icon]) => (
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
            {newChannel
              ? "Tạo kênh"
              : kind === "video"
                ? "Làm video"
                : written
                  ? kind === "film" ? "Làm phim" : "Làm meme"
                  : "AI tự nghĩ"}
          </Button>
        </div>
      </div>

      {kind === "film" && !newChannel && (
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
        {newChannel
          ? "Kênh mới: AI điền hồ sơ kênh từ ý tưởng này, rồi dựng nhân vật. Xong mới làm nội dung."
          : tooShort
            ? kind === "video"
              ? "Tả cảnh trong video (ít nhất vài chữ)."
              : "Viết thêm một chút, hoặc xoá hết để AI tự nghĩ."
            : kind === "film"
              ? `Phim dùng dàn nhân vật của kênh · khoảng ${QUALITY_OPTIONS[0].estimatedPoints.toLocaleString("vi-VN")}–${QUALITY_OPTIONS[1].estimatedPoints.toLocaleString("vi-VN")} điểm · 5–10 phút · AI hỏi bạn trước khi vượt mức.`
              : kind === "video"
                ? taggedCharacters.length
                  ? `Video tới 30 giây, giữ đúng gương mặt ${taggedCharacters.map((character) => character.name).join(", ")} · xem giá trước khi làm.`
                  : "Video tới 30 giây · gắn nhân vật hoặc thêm ảnh của bạn ở bước sau để giữ đúng gương mặt."
                : taggedCharacters.length
                  ? `Một meme có ${taggedCharacters.map((character) => character.name).join(", ")} · khoảng 1 phút.`
                  : "Một meme · AI chọn nhân vật hợp ý tưởng · khoảng 1 phút."}
      </p>
      {error && (
        <p role="alert" className="rounded-lg border th-border-danger th-bg-danger-light px-3 py-2 text-sm th-text-danger">{error}</p>
      )}
    </form>
  );
}
