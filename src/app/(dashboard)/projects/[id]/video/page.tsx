"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { Clapperboard, ImagePlus, Loader2, Plus, RotateCcw, Wand2, X } from "lucide-react";
import { PageContainer, PageHeader, PageSkeleton, Skeleton } from "@/components/ui/page";
import Card from "@/components/ui/card";
import Button, { buttonClasses } from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import Textarea from "@/components/ui/textarea";
import Alert from "@/components/ui/alert";
import PriceLine from "@/components/ui/price-line";
import { useToast } from "@/components/ui/toast";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { formatPoints } from "@/lib/format";
import { useCharacters, useMemes, useProject } from "@/lib/use-store";
import { takeVideoHandoff } from "@/lib/home-handoff";
import { createClient } from "@/lib/supabase/client";
import { stripImageMetadataFromFile } from "@/lib/image-metadata";
import VideoOptions, { type Candidate } from "./_components/video-options";
import VideoResult from "./_components/video-result";
import {
  DEFAULT_FIELDS,
  canReuseOutput,
  fieldsFromOutput,
  insufficientPoints,
  isWorking,
  parseDraft,
  speakerIds,
  videoView,
  type DraftFields,
  type VideoOutput,
  type VideoStatus,
  type VoiceRow,
} from "./_components/video-flow";

type Quote = { points: number; expiresAt: number; key: string };
type Slot = { id: string; status: string };
type LoadedStatus = VideoStatus & { output: VideoOutput & { source_snapshot?: Record<string, unknown> | null } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const message = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

const imageOf = (character: { avatar_url?: string | null; poses?: { image_url?: string | null }[] }) =>
  character.avatar_url || character.poses?.[0]?.image_url || "";

async function loadStatus(outputId: string): Promise<LoadedStatus | null> {
  const response = await fetch(`/api/content-outputs/${outputId}/video`, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

export default function VideoPage() {
  const { id: projectRef } = useParams<{ id: string }>();
  const query = useSearchParams();
  const toast = useToast();
  const { project, loading: projectLoading } = useProject(projectRef);
  const { characters, loading: charactersLoading } = useCharacters(projectRef);

  const [fields, setFields] = useState<DraftFields>(DEFAULT_FIELDS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mediaWanted, setMediaWanted] = useState(false);
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<LoadedStatus | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [shortfall, setShortfall] = useState<{ required: number; current: number } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftOffline, setDraftOffline] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);

  // Bài (content_output) dùng để xem giá và làm video. Giữ trong ref vì giá tự
  // tính sau mỗi lần ngừng gõ: hai lần tính sát nhau không được tạo hai bài.
  const slotRef = useRef<Slot | null>(null);
  const slotPromise = useRef<Promise<Slot> | null>(null);
  const quoteSeq = useRef(0);
  const editedRef = useRef(false);
  const draftRef = useRef<{ id: string | null; version: number | null }>({ id: null, version: null });
  const lastSavedRef = useRef<string | null>(null);
  const latestRef = useRef<{ key: string; fields: DraftFields; outputId: string | null }>({ key: "", fields: DEFAULT_FIELDS, outputId: null });
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const mode = fields.opening ? "image" : "text";
  const working = isWorking(current);
  const view = videoView(current);
  const showing = Boolean(view);
  const { memes, loading: memesLoading } = useMemes(projectRef, mediaWanted);

  const setSlot = (slot: Slot | null) => {
    slotRef.current = slot;
    setSlotId(slot?.id ?? null);
  };

  const change = useCallback((patch: Partial<DraftFields>) => {
    editedRef.current = true;
    setFields((value) => ({ ...value, ...patch }));
  }, []);

  const candidates = useMemo<Candidate[]>(
    () => [
      ...memes
        .filter((meme) => Boolean(meme.image_url))
        .map((meme) => ({ id: meme.id, label: meme.title || "Meme", url: meme.image_url!, memeId: meme.id })),
      ...characters.flatMap((character) => {
        const url = imageOf(character);
        return url ? [{ id: `character-${character.id}`, label: character.name, url, memeId: null }] : [];
      }),
    ],
    [characters, memes],
  );

  const config = useMemo(
    () => ({
      mode,
      model: fields.model,
      prompt: fields.prompt.trim(),
      ...(fields.opening ? { image: fields.opening.url } : {}),
      // Video mở đầu bằng ảnh không dùng ảnh mẫu: nhà cung cấp bỏ qua chúng.
      ...(mode === "text" && fields.references.length ? { reference_images: fields.references } : {}),
      duration: fields.duration,
      resolution: fields.resolution,
      aspect_ratio: fields.aspect,
      generate_audio: false,
      dubbing: fields.audio ? { text: fields.dialogue.trim(), characterId: fields.speaker } : null,
    }),
    [mode, fields],
  );
  const configKey = JSON.stringify(config);
  const blocker = !fields.prompt.trim()
    ? "Tả video trước, giá sẽ hiện ở đây."
    : fields.audio && (!fields.dialogue.trim() || !fields.speaker)
      ? "Nhập lời lồng tiếng và chọn người nói để xem giá nhé."
      : null;

  // --- Mở trang: bản nháp, việc đang làm, ý tưởng chuyển từ trang khác ---

  useEffect(() => {
    let active = true;
    const videoParam = query.get("video");
    try {
      const stored = window.sessionStorage.getItem(`aida:video-draft:${projectRef}`);
      if (stored) setFields(parseDraft(JSON.parse(stored) as Record<string, unknown>));
    } catch {
      window.sessionStorage.removeItem(`aida:video-draft:${projectRef}`);
    }

    // Ý tưởng gõ ở ô nhập trang chính: mô tả và ảnh nhân vật được gắn.
    const handoff = takeVideoHandoff(projectRef);
    if (handoff) {
      editedRef.current = true;
      setFields({ ...DEFAULT_FIELDS, prompt: handoff.prompt, references: handoff.references });
    }
    const idea = query.get("idea");
    if (idea) {
      editedRef.current = true;
      setFields((value) => ({ ...value, prompt: value.prompt || idea }));
    }
    const image = query.get("image");
    if (image && /^https:\/\//.test(image)) {
      editedRef.current = true;
      setFields((value) => ({ ...value, opening: { url: image, memeId: null } }));
    }

    // Mở từ thẻ "Gần đây": xem đúng video đó, không phải bản nháp.
    if (videoParam && UUID.test(videoParam))
      void loadStatus(videoParam).then((status) => {
        if (active && status && status.output.status !== "draft") setCurrent(status);
      });

    fetch(`/api/projects/${projectRef}/drafts?tool=video`)
      .then((response) => (response.ok ? response.json() : null))
      .then(async (payload) => {
        if (!active || !payload?.draft) return;
        const draft = payload.draft;
        draftRef.current = { id: draft.id, version: draft.version };
        if (!editedRef.current && draft.payload) setFields(parseDraft(draft.payload));
        const outputId = draft.content_output_id as string | null;
        if (!outputId) return;
        const status = await loadStatus(outputId);
        if (!active || !status) return;
        if (canReuseOutput(status.output)) setSlot({ id: status.output.id, status: status.output.status });
        // Quay lại trang khi video đang làm, vừa xong hay vừa hỏng: hiện luôn.
        if (!videoParam && status.output.status !== "draft") setCurrent(status);
      })
      .catch(() => {
        if (active) setDraftOffline(true);
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
    // Chỉ chạy khi mở trang; đổi query sau đó không nạp lại bản nháp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRef]);

  // Từ trang Meme, "Làm video từ ảnh này" mở trang với ?from=<memeId>.
  const fromMeme = query.get("from");
  const projectId = project?.id;
  useEffect(() => {
    if (!fromMeme || !UUID.test(fromMeme) || !projectId) return;
    let active = true;
    void createClient()
      .from("memes")
      .select("id, image_url, project_id")
      .eq("id", fromMeme)
      .maybeSingle()
      .then(({ data }: { data: { id: string; image_url: string | null; project_id: string } | null }) => {
        if (!active || !data?.image_url || data.project_id !== projectId) return;
        editedRef.current = true;
        setFields((value) => ({ ...value, opening: { url: data.image_url as string, memeId: data.id as string } }));
      });
    return () => {
      active = false;
    };
  }, [fromMeme, projectId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectRef}/voices`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && Array.isArray(payload?.voices)) setSpeakers(speakerIds(payload.voices as VoiceRow[]));
      })
      .catch(() => {
        // Không đọc được giọng thì chỉ không bật được lồng tiếng.
      });
    return () => {
      active = false;
    };
  }, [projectRef]);

  // --- Lưu bản nháp: trên máy ngay, lên mạng sau khi ngừng gõ ---

  const persistedOutputId = (working ? current?.output.id : null) ?? slotId ?? current?.output.id ?? null;
  const saveKey = JSON.stringify({ fields, outputId: persistedOutputId });
  useEffect(() => {
    latestRef.current = { key: saveKey, fields, outputId: persistedOutputId };
  }, [fields, persistedOutputId, saveKey]);

  const persist = useCallback(async () => {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      do {
        pendingRef.current = false;
        const { key, fields: payload, outputId } = latestRef.current;
        if (key === lastSavedRef.current) break;
        const draft = draftRef.current;
        const response = await fetch(
          draft.id ? `/api/projects/${projectRef}/drafts/${draft.id}` : `/api/projects/${projectRef}/drafts`,
          {
            method: draft.id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(draft.id ? { expected_version: draft.version } : { tool: "video" }),
              payload,
              ...(outputId ? { content_output_id: outputId } : {}),
            }),
          },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error();
        draftRef.current = { id: json.draft.id, version: json.draft.version };
        lastSavedRef.current = key;
      } while (pendingRef.current);
      setDraftOffline(false);
    } catch {
      setDraftOffline(true);
    } finally {
      savingRef.current = false;
    }
  }, [projectRef]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      window.sessionStorage.setItem(`aida:video-draft:${projectRef}`, JSON.stringify(fields));
    } catch {
      // Máy hết chỗ thì vẫn còn bản trên mạng.
    }
    const empty = !fields.prompt.trim() && !fields.opening && !fields.references.length && !persistedOutputId;
    if (empty || saveKey === lastSavedRef.current) return;
    const timer = window.setTimeout(() => void persist(), 800);
    return () => window.clearTimeout(timer);
  }, [draftReady, fields, persist, persistedOutputId, projectRef, saveKey]);

  // --- Theo dõi video đang làm ---

  const currentId = current?.output.id;
  useEffect(() => {
    if (!currentId || !working) return;
    let active = true;
    let attempts = 0;
    let timer: number | undefined;
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState !== "hidden" && navigator.onLine) {
        const next = await loadStatus(currentId).catch(() => null);
        if (!active) return;
        if (next) {
          setCurrent(next);
          if (!isWorking(next)) return;
        }
      }
      attempts += 1;
      timer = window.setTimeout(poll, attempts < 20 ? 4000 : 10000);
    };
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    timer = window.setTimeout(poll, 3000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [currentId, working]);

  // --- Giá ---

  async function createSlot(): Promise<Slot> {
    if (!project) throw new Error("Không tìm thấy kênh.");
    const selected = characters.filter((character) => fields.references.includes(imageOf(character))).map((character) => character.id);
    const setResponse = await fetch("/api/content-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: project.id, title: "Video", brief: fields.prompt.trim(), selected_character_ids: selected }),
    });
    const setJson = await setResponse.json().catch(() => ({}));
    if (!setResponse.ok) throw new Error(setJson.error || "Chưa tính được giá. Bạn thử lại nhé.");
    const outputResponse = await fetch(`/api/content-sets/${setJson.contentSet.id}/outputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "video",
        format: mode === "text" ? fields.aspect : "9:16",
        ...(fields.opening?.memeId ? { meme_id: fields.opening.memeId } : {}),
        poster_url: fields.opening?.url || null,
        script: fields.prompt.trim(),
        caption: fields.caption.trim() || null,
        duration_seconds: fields.duration,
        source_snapshot: { mode, image: fields.opening?.url || null, referenceImages: fields.references },
      }),
    });
    const outputJson = await outputResponse.json().catch(() => ({}));
    if (!outputResponse.ok) throw new Error(outputJson.error || "Chưa tính được giá. Bạn thử lại nhé.");
    return { id: outputJson.output.id, status: outputJson.output.status };
  }

  async function ensureSlot() {
    if (slotRef.current && canReuseOutput(slotRef.current)) return slotRef.current;
    if (!slotPromise.current)
      slotPromise.current = createSlot()
        .then((slot) => {
          setSlot(slot);
          return slot;
        })
        .finally(() => {
          slotPromise.current = null;
        });
    return slotPromise.current;
  }

  async function fetchQuote(): Promise<Quote | null> {
    const seq = ++quoteSeq.current;
    const key = configKey;
    setQuoting(true);
    setQuoteError("");
    try {
      const slot = await ensureSlot();
      const response = await fetch(`/api/content-outputs/${slot.id}/video/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Chưa tính được giá. Bạn thử lại nhé.");
      if (seq !== quoteSeq.current) return null;
      const next = { points: Number(json.quote.customerPoints), expiresAt: Date.parse(json.expiresAt), key };
      setQuote(next);
      if (typeof json.available === "number") setAvailable(json.available);
      return next;
    } catch (reason) {
      if (seq === quoteSeq.current) setQuoteError(message(reason, "Chưa tính được giá. Bạn thử lại nhé."));
      return null;
    } finally {
      if (seq === quoteSeq.current) setQuoting(false);
    }
  }

  // Giá tự hiện khi người dùng ngừng gõ, không có bước "Xem giá" riêng. Khi
  // đang hiện một video (đang làm, xong, hỏng) thì chưa tính, kẻo mỗi lần mở
  // trang lại tạo thêm một bài nháp.
  useEffect(() => {
    quoteSeq.current += 1;
    setQuote(null);
    setQuoteError("");
    setQuoting(false);
    if (!projectId || blocker || !draftReady || showing) return;
    const timer = window.setTimeout(() => void fetchQuote(), 900);
    return () => window.clearTimeout(timer);
    // fetchQuote đọc configKey của lần render này; chạy lại theo đúng các giá trị dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, projectId, blocker, draftReady, showing]);

  // --- Làm video ---

  async function submit() {
    if (!quote || submitting || working) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      if (Date.now() > quote.expiresAt - 15_000) {
        const fresh = await fetchQuote();
        if (!fresh) return;
        if (fresh.points !== quote.points) {
          toast.toast("info", `Giá vừa cập nhật: ${formatPoints(fresh.points)}. Bấm lại để làm video nhé.`);
          return;
        }
      }
      const slot = slotRef.current;
      if (!slot) return;
      const response = await fetch(`/api/content-outputs/${slot.id}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, request_id: requestId() }),
      });
      const json = await response.json().catch(() => ({}));
      const short = insufficientPoints(response.status, json);
      if (short) {
        setShortfall(short);
        return;
      }
      if (json.code === "QUOTE_EXPIRED") {
        setSubmitError(json.error);
        void fetchQuote();
        return;
      }
      if (json.code === "SUBMIT_FAILED") {
        setSlot({ id: slot.id, status: "failed" });
        setCurrent(await loadStatus(slot.id));
        return;
      }
      if (!response.ok) throw new Error(json.error || "Chưa bắt đầu làm video được. Bạn thử lại nhé.");
      // Bài này giờ đã có video (hoặc sắp có): lần làm sau phải mở bài mới.
      setSlot({ id: slot.id, status: "running" });
      setCurrent({
        output: { id: slot.id, status: "running", poster_url: fields.opening?.url ?? null, caption: fields.caption.trim() || null },
        job: { id: json.jobId, status: "running", phase: null, reason: null, refundedPoints: null },
      });
    } catch (reason) {
      setSubmitError(message(reason, "Chưa bắt đầu làm video được. Bạn thử lại nhé."));
    } finally {
      setSubmitting(false);
    }
  }

  /** Thử lại một video hỏng: làm lại trên chính bài đó, giá mới hiện để bấm xác nhận. */
  function retry() {
    if (current) {
      // Mở từ "Gần đây" thì form đang chứa thứ khác: điền lại đúng video đã hỏng.
      if (current.output.id !== slotRef.current?.id) setFields((value) => fieldsFromOutput(current.output, value));
      setSlot({ id: current.output.id, status: "failed" });
    }
    editedRef.current = true;
    setCurrent(null);
    setSubmitError("");
  }

  function startOver() {
    setCurrent(null);
    if (!canReuseOutput(slotRef.current)) setSlot(null);
    setSubmitError("");
  }

  // --- Gợi ý kịch bản (miễn phí) ---

  async function suggest() {
    if (!fields.prompt.trim()) return;
    setAssisting(true);
    try {
      const selected = characters.filter((character) => fields.references.includes(imageOf(character))).map((character) => character.id);
      const response = await fetch(`/api/projects/${projectRef}/creative-assists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "video_clip_plan",
          intent: fields.prompt,
          selectedCharacterIds: selected,
          imageMode: mode,
          sourceImageDescription: fields.opening ? "Người dùng đã chọn ảnh mở đầu trong kênh." : undefined,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const resultResponse = await fetch(`/api/projects/${projectRef}/creative-assists/${json.jobId}`, { cache: "no-store" });
        const result = await resultResponse.json().catch(() => ({}));
        if (!resultResponse.ok) throw new Error(result.error);
        if (result.job?.status === "completed") {
          const plan = result.job.result as { prompt: string; caption?: string; dialogue?: string; speakerCharacterId?: string | null };
          const speaker = plan.speakerCharacterId && speakers.has(plan.speakerCharacterId) ? plan.speakerCharacterId : "";
          const dialogue = plan.dialogue?.trim() || "";
          // Chỉ bật lồng tiếng khi có lời và nhân vật nói được; còn lại giữ lời
          // trong ô để người dùng tự quyết, không chặn việc xem giá.
          change({ prompt: plan.prompt, caption: plan.caption || "", dialogue, speaker, audio: Boolean(dialogue && speaker) });
          toast.success(dialogue && speaker ? "Đã viết gợi ý, có cả lời lồng tiếng." : "Đã viết gợi ý kịch bản.");
          return;
        }
        // Mã lỗi của job là mã nội bộ (CREATIVE_ASSIST_…), không đưa ra màn hình.
        if (result.job?.status === "failed") throw new Error();
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
      throw new Error("Gợi ý đang lâu hơn bình thường. Bạn thử lại sau nhé.");
    } catch (reason) {
      toast.error(message(reason, "Chưa gợi ý được. Bạn thử lại nhé."));
    } finally {
      setAssisting(false);
    }
  }

  // --- Ảnh mẫu của người dùng ---

  async function addReference(file: File) {
    if (!project) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error("Chọn ảnh PNG, JPG hoặc WEBP nhé.");
    if (file.size > 10 * 1024 * 1024) return toast.error("Ảnh lớn quá 10 MB.");
    if (fields.references.length >= 9) return toast.error("Tối đa 9 ảnh mẫu.");
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${project.id}/references/${requestId()}.${ext}`;
      // Kho công khai: gỡ GPS và dấu vết máy chụp trước khi đưa lên.
      const clean = await stripImageMetadataFromFile(file);
      const { error } = await supabase.storage.from("memes").upload(path, clean, { contentType: file.type });
      if (error) throw new Error("Chưa thêm được ảnh. Bạn thử lại nhé.");
      const url = supabase.storage.from("memes").getPublicUrl(path).data.publicUrl;
      setFields((value) => ({ ...value, references: [...value.references, url] }));
      editedRef.current = true;
    } catch (reason) {
      toast.error(message(reason, "Chưa thêm được ảnh. Bạn thử lại nhé."));
    } finally {
      setUploading(false);
    }
  }

  if (!projectLoading && !project) notFound();
  if (projectLoading || !project) return <PageSkeleton width="work" />;

  const tagged = characters.filter((character) => imageOf(character));
  const uploads = fields.references.filter((url) => !tagged.some((character) => imageOf(character) === url));

  return (
    <PageContainer width="work">
      <PageHeader
        title="Video"
        description="Tả cảnh, gắn nhân vật nếu muốn. AIDA lo phần còn lại, xong là tải về được."
        actions={
          <Link href={`/projects/${projectRef}/brand`} className={buttonClasses("ghost", "sm")}>
            Logo của kênh
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
        <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="video-idea" className="text-sm font-medium th-text-primary">
                Video kể gì?
              </label>
              <Button variant="ghost" size="sm" onClick={suggest} loading={assisting} disabled={!fields.prompt.trim()}>
                {!assisting && <Wand2 size={14} aria-hidden />}
                {assisting ? "Đang viết…" : "Gợi ý kịch bản"}
              </Button>
            </div>
            <Textarea
              id="video-idea"
              rows={5}
              value={fields.prompt}
              onChange={(event) => change({ prompt: event.target.value })}
              placeholder="Ví dụ: Bánh Bao giấu miếng bánh cuối cùng, bị phát hiện, cả hai cùng cười…"
            />
          </div>

          {fields.opening ? (
            <div className="flex items-center gap-3 rounded-xl border th-border p-2">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg th-bg-tertiary">
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh có thể đến từ trang Meme, ngoài danh sách ảnh của Next */}
                <img src={fields.opening.url} alt="Ảnh mở đầu" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium th-text-primary">Mở đầu bằng ảnh này</p>
                <p className="text-xs th-text-tertiary">Video bắt đầu từ ảnh và cùng khổ với ảnh.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => change({ opening: null })} aria-label="Bỏ ảnh mở đầu">
                <X size={14} aria-hidden /> Bỏ
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium th-text-primary">
                Nhân vật và ảnh mẫu <span className="font-normal th-text-tertiary">(không bắt buộc, tối đa 9)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {charactersLoading
                  ? [1, 2].map((item) => <Skeleton key={item} className="h-8 w-24 rounded-full" />)
                  : tagged.map((character) => {
                      const url = imageOf(character);
                      const selected = fields.references.includes(url);
                      return (
                        <Chip
                          key={character.id}
                          selected={selected}
                          disabled={!selected && fields.references.length >= 9}
                          onClick={() =>
                            change({ references: selected ? fields.references.filter((value) => value !== url) : [...fields.references, url] })
                          }
                        >
                          <span className="relative -ml-1.5 h-6 w-6 overflow-hidden rounded-full">
                            <Image src={url} alt="" fill sizes="24px" className="object-cover" />
                          </span>
                          {character.name}
                        </Chip>
                      );
                    })}
                <label
                  className={`${buttonClasses("outline", "sm")} cursor-pointer ${uploading || fields.references.length >= 9 ? "pointer-events-none opacity-50" : ""}`}
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                  {uploading ? "Đang thêm ảnh…" : "Thêm ảnh mẫu"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void addReference(file);
                    }}
                  />
                </label>
              </div>
              {uploads.length > 0 && (
                <ul className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                  {uploads.map((url) => (
                    <li key={url} className="relative aspect-square overflow-hidden rounded-xl border th-border th-bg-tertiary">
                      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app */}
                      <img src={url} alt="Ảnh mẫu" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        aria-label="Bỏ ảnh mẫu này"
                        onClick={() => change({ references: fields.references.filter((value) => value !== url) })}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs th-text-tertiary">Video vẽ cảnh mới nhưng giữ đúng gương mặt, trang phục trong ảnh.</p>
            </div>
          )}

          <VideoOptions
            open={optionsOpen}
            onToggle={() => {
              setOptionsOpen((value) => !value);
              setMediaWanted(true);
            }}
            fields={fields}
            onChange={change}
            candidates={candidates}
            candidatesLoading={memesLoading || charactersLoading}
            characters={characters}
            speakers={speakers}
            charactersHref={`/projects/${projectRef}/characters`}
          />

          {submitError && <Alert tone="danger">{submitError}</Alert>}

          <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border th-border th-bg-card p-3 th-shadow-sm">
            {view?.state === "working" ? (
              <>
                <p className="text-xs th-text-tertiary">Video đang làm. Rời trang cũng được, xong sẽ có thông báo.</p>
                <Button size="lg" className="w-full" disabled>
                  <Loader2 size={16} className="animate-spin" aria-hidden /> Đang làm video…
                </Button>
              </>
            ) : view?.state === "failed" ? (
              <>
                <p className="text-xs th-text-tertiary">Video vừa rồi chưa làm được. Thử lại sẽ hiện giá mới trước khi làm.</p>
                <Button size="lg" variant="outline" className="w-full" onClick={retry}>
                  <RotateCcw size={16} aria-hidden /> Thử lại
                </Button>
              </>
            ) : view?.state === "done" ? (
              <>
                <p className="text-xs th-text-tertiary">Video đã xong, tải ở khung bên cạnh. Muốn làm tiếp thì sửa nội dung rồi bấm dưới đây.</p>
                <Button size="lg" variant="outline" className="w-full" onClick={startOver}>
                  <Plus size={16} aria-hidden /> Làm video khác
                </Button>
              </>
            ) : (
              <>
                {blocker ? (
                  <p className="text-xs th-text-tertiary">{blocker}</p>
                ) : quoteError ? (
                  <Alert
                    tone="warning"
                    action={
                      <Button size="sm" variant="outline" onClick={() => void fetchQuote()}>
                        Thử lại
                      </Button>
                    }
                  >
                    {quoteError}
                  </Alert>
                ) : (
                  <PriceLine points={quoting || !quote ? null : quote.points} available={available} />
                )}
                <Button size="lg" className="w-full" onClick={submit} loading={submitting} disabled={!quote || quoting || Boolean(blocker)}>
                  {submitting ? (
                    "Đang gửi…"
                  ) : (
                    <>
                      <Clapperboard size={16} aria-hidden /> Làm video{quote ? ` · ${formatPoints(quote.points)}` : ""}
                    </>
                  )}
                </Button>
              </>
            )}
            {draftOffline && <p className="text-center text-xs th-text-tertiary">Chưa lưu lên mạng, bản nháp vẫn còn trên máy này.</p>}
          </div>
        </Card>

        <VideoResult status={current} view={view} galleryHref={`/projects/${projectRef}/gallery`} onRetry={retry} onNew={startOver} />
      </div>

      <OutOfPointsModal
        open={Boolean(shortfall)}
        onClose={() => setShortfall(null)}
        required={shortfall?.required ?? 0}
        current={shortfall?.current ?? 0}
        action="Video này"
        onFunded={() => {
          setShortfall(null);
          void submit();
        }}
      />
    </PageContainer>
  );
}
