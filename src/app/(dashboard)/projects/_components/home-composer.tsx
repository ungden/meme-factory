"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, AtSign, Check, Clapperboard, Film, Images, Sparkles } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import { useToast } from "@/components/ui/toast";
import { humanizeError } from "@/lib/error-messages";
import { formatPointsRange } from "@/lib/format";
import { giveFilmHandoff, giveVideoHandoff, parseComposeKind, type ComposeKind } from "@/lib/home-handoff";
import { getProjectRouteRef } from "@/lib/project-visuals";
import { isTaggable, referencesFor, type TaggableCharacter } from "@/lib/character-refs";
import type { FilmFormat } from "@/lib/film-camera-language";
import type { Project } from "@/types/database";
import { FORMAT_CHOICES, QUALITY_OPTIONS } from "../[id]/short-films/_lib/studio";

type Kind = ComposeKind;

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
  lockChannel = false,
}: {
  projects: Project[];
  onStarted: () => void;
  preset: ComposerPreset | null;
  /** Ở trang một kênh: chỉ làm cho kênh đó, không cho chọn kênh khác. */
  lockChannel?: boolean;
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
      const drafted = parseComposeKind(draft?.output);
      if (drafted) setKind(drafted);
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
      // làm mô tả kênh ban đầu; loại bài nằm cùng nháp để khi quay lại đây
      // (bước nhân vật đưa về trang chính) ô nhập vẫn đúng loại người dùng chọn.
      try {
        window.sessionStorage.setItem(LANDING_DRAFT, JSON.stringify({ idea: written, output: kind }));
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
      if (!response.ok) throw new Error(payload.error || "Chưa bắt đầu được. Bạn thử lại nhé.");
      setIdea("");
      toast.success(`Đang làm meme cho ${channel.name}. Xong sẽ hiện ngay bên dưới.`);
      onStarted();
    } catch (cause) {
      setError(humanizeError((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const placeholder =
    kind === "film"
      ? "Phim kể chuyện gì? Để trống thì AIDA tự nghĩ…"
      : kind === "video"
        ? "Tả cảnh trong video: ai, đang làm gì, ở đâu, nói gì…"
        : "Ví dụ: Thứ Hai đi làm mà lương chưa về… (để trống cũng được)";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby="home-title">
      <div className="text-center">
        <h1 id="home-title" className="text-3xl font-semibold leading-tight tracking-tight th-text-primary sm:text-4xl">
          Hôm nay {lockChannel && channel ? channel.name : "kênh của bạn"} <span className="th-text-gradient">đăng gì?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base th-text-secondary">
          Viết một ý tưởng, hoặc để trống cho AIDA tự nghĩ. Làm xong sẽ hiện ngay bên dưới.
        </p>
      </div>

      <div className="mt-2 rounded-3xl border th-border th-bg-elevated p-2.5 th-shadow-lg transition-colors focus-within:th-border-accent sm:p-3">
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
          className="w-full resize-none bg-transparent px-2 py-2 text-base leading-relaxed th-text-primary outline-none placeholder:th-text-muted"
        />

        {kind !== "film" && !newChannel && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2" role="group" aria-label="Gắn nhân vật">
            <span className="flex items-center gap-1 text-xs th-text-muted">
              <AtSign size={12} aria-hidden /> Gắn nhân vật
            </span>
            {characters.map((character) => {
              const on = tagged.includes(character.id);
              return (
                <Chip
                  key={character.id}
                  selected={on}
                  onClick={() => setTagged((list) => (on ? list.filter((id) => id !== character.id) : [...list, character.id]))}
                >
                  <span className="relative -ml-2.5 h-6 w-6 overflow-hidden rounded-full th-bg-tertiary">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nhân vật nằm ở kho lưu trữ của app */}
                    <img src={character.references?.identity_face || character.avatarUrl || ""} alt="" className="h-full w-full object-cover" />
                    {on && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                        <Check size={12} aria-hidden />
                      </span>
                    )}
                  </span>
                  {character.name}
                </Chip>
              );
            })}
            {cast?.channelId === channelId && !characters.length && channel && (
              <Link href={`/projects/${getProjectRouteRef(channel)}/characters`} className="text-xs font-medium th-text-accent underline-offset-2 hover:underline">
                Kênh chưa có nhân vật · Tạo nhân vật
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
                className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${kind === value ? "th-bg-card th-text-primary th-shadow-sm" : "th-text-tertiary hover:th-text-primary"}`}
              >
                <Icon size={14} aria-hidden /> {label}
              </button>
            ))}
          </div>
          {!lockChannel && (
          <label className="flex min-h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border th-border px-3 text-sm th-text-tertiary th-bg-hover">
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
          )}
          <Button type="submit" loading={busy} disabled={tooShort} className="ml-auto rounded-full px-4" aria-label={written ? "Bắt đầu làm" : "Tự nghĩ ý tưởng rồi làm"}>
            {written ? <ArrowUp size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {newChannel
              ? "Tạo kênh"
              : kind === "video"
                ? "Làm video"
                : kind === "film"
                  ? "Làm phim"
                  : "Làm meme"}
          </Button>
        </div>
      </div>

      {kind === "film" && !newChannel && (
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Cách quay">
          {FORMAT_CHOICES.map((choice) => (
            <Chip
              key={choice.value || "auto"}
              role="radio"
              selected={format === choice.value}
              title={choice.description}
              onClick={() => setFormat(choice.value)}
            >
              {choice.label}
            </Chip>
          ))}
        </div>
      )}

      <p className="text-center text-xs th-text-muted">
        {newChannel
          ? "Kênh mới: điền hồ sơ kênh từ ý tưởng này, rồi tạo nhân vật trước khi làm bài."
          : tooShort
            ? kind === "video"
              ? "Tả cảnh trong video (ít nhất vài chữ)."
              : "Viết thêm vài chữ, hoặc xoá hết để AIDA tự nghĩ."
            : kind === "film"
              ? `Dùng nhân vật của kênh · ${formatPointsRange(QUALITY_OPTIONS[0].estimatedPoints, QUALITY_OPTIONS[1].estimatedPoints)} · 5–10 phút · hỏi bạn trước khi chi quá mức.`
              : kind === "video"
                ? taggedCharacters.length
                  ? `Video tới 30 giây, giữ đúng gương mặt ${taggedCharacters.map((character) => character.name).join(", ")} · xem giá trước khi làm.`
                  : "Video tới 30 giây · gắn nhân vật hoặc thêm ảnh của bạn ở bước sau để giữ đúng gương mặt."
                : taggedCharacters.length
                  ? `Một meme có ${taggedCharacters.map((character) => character.name).join(", ")} · khoảng 1 phút.`
                  : "Một meme · tự chọn nhân vật hợp ý · khoảng 1 phút."}
      </p>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}
