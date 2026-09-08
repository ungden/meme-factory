"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Clapperboard, ImagePlus, LoaderCircle, Play, RefreshCw, Volume2, Wand2 } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import { useCharacters, useMemes, useProject } from "@/lib/use-store";

type VideoMode = "text" | "image";
type Quote = { customerPoints: number; providerCostUsd: number };
type Output = { id: string; media_url?: string | null; poster_url?: string | null; status?: string; duration_seconds?: number | null };

const DURATIONS = [5, 10, 15, 30] as const;
const RESOLUTIONS = ["720p", "1080p"] as const;
const ASPECTS = ["9:16", "1:1", "16:9"] as const;

function requestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export default function VideoStudioPage() {
  const { id: projectRef } = useParams<{ id: string }>();
  const query = useSearchParams();
  const { project, loading: projectLoading } = useProject(projectRef);
  const { characters, loading: charactersLoading } = useCharacters(projectRef);
  const [mode, setMode] = useState<VideoMode>(query.get("image") ? "image" : "text");
  const shouldLoadMedia = mode === "image" || Boolean(query.get("image"));
  const { memes, loading: memesLoading } = useMemes(projectRef, shouldLoadMedia);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [assisting, setAssisting] = useState(false);
  const [image, setImage] = useState(query.get("image") || "");
  const [lastImage, setLastImage] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(5);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("9:16");
  const [audio, setAudio] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftState, setDraftState] = useState<"loading" | "saved" | "saving" | "offline">("loading");
  const [jobId, setJobId] = useState<string | null>(null);
  const draftRef = useRef<{ id: string | null; version: number | null }>({ id: null, version: null });
  const latestPayloadRef = useRef<Record<string, unknown>>({});
  const lastSavedPayloadRef = useRef<string | null>(null);
  const lastSavedOutputIdRef = useRef<string | null>(null);
  const draftReadyRef = useRef(false);
  const editedBeforeRestoreRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const candidateImages = useMemo(() => [
    ...memes.filter((m) => Boolean(m.image_url)).map((m) => ({ id: m.id, label: m.title || "Ảnh đã lưu", url: m.image_url! })),
    ...characters.flatMap((c) => {
      const first = c.avatar_url || c.poses?.[0]?.image_url;
      return first ? [{ id: `character-${c.id}`, label: c.name, url: first }] : [];
    }),
  ], [characters, memes]);

  const payload = useMemo(() => ({ mode, prompt, caption, image, lastImage, references, duration, resolution, aspect, audio }), [mode, prompt, caption, image, lastImage, references, duration, resolution, aspect, audio]);
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);
  const hasDraftContent = prompt.trim().length > 0 || image.length > 0 || references.length > 0 || lastImage.length > 0;

  const applyDraft = (draft: Record<string, unknown>) => {
    setMode(draft.mode === "image" ? "image" : "text"); setPrompt(typeof draft.prompt === "string" ? draft.prompt : ""); setCaption(typeof draft.caption === "string" ? draft.caption : ""); setImage(typeof draft.image === "string" ? draft.image : ""); setLastImage(typeof draft.lastImage === "string" ? draft.lastImage : "");
    setReferences(Array.isArray(draft.references) ? draft.references.filter((value): value is string => typeof value === "string") : []); setDuration(DURATIONS.includes(draft.duration as (typeof DURATIONS)[number]) ? draft.duration as (typeof DURATIONS)[number] : 5);
    setResolution(RESOLUTIONS.includes(draft.resolution as (typeof RESOLUTIONS)[number]) ? draft.resolution as (typeof RESOLUTIONS)[number] : "720p"); setAspect(ASPECTS.includes(draft.aspect as (typeof ASPECTS)[number]) ? draft.aspect as (typeof ASPECTS)[number] : "9:16"); setAudio(draft.audio !== false);
  };

  const markEdited = () => { editedBeforeRestoreRef.current = true; };

  async function assistVideo() {
    if (!prompt.trim()) { setError("Nhập ý tưởng trước để AI soạn video."); return; }
    setError(""); setAssisting(true);
    try {
      const selectedCharacterIds = characters.filter((character) => references.includes(character.avatar_url || character.poses?.[0]?.image_url || "")).map((character) => character.id);
      const response = await fetch(`/api/projects/${projectRef}/creative-assists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "video_clip_plan", intent: prompt, selectedCharacterIds, imageMode: mode, sourceImageDescription: image ? "Người dùng đã chọn ảnh đầu trong dự án." : undefined }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || "Không thể bắt đầu soạn video.");
      for (let attempt = 0; attempt < 30; attempt += 1) { const resultResponse = await fetch(`/api/projects/${projectRef}/creative-assists/${json.jobId}`, { cache: "no-store" }); const result = await resultResponse.json(); if (!resultResponse.ok) throw new Error(result.error || "Không đọc được kết quả AI."); if (result.job.status === "completed") { setPrompt(result.job.result.prompt); setCaption(result.job.result.caption || ""); markEdited(); return; } if (result.job.status === "failed") throw new Error(result.job.error?.code || "AI chưa soạn được video."); await new Promise((resolve) => window.setTimeout(resolve, 500)); }
      throw new Error("AI đang xử lý lâu hơn bình thường.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "AI chưa soạn được video."); } finally { setAssisting(false); }
  }

  useEffect(() => {
    if (query.get("output") !== "Tạo video" && !query.get("idea")) return;
    let landing: { idea?: string; character?: string } | null = null;
    try { landing = JSON.parse(window.sessionStorage.getItem("aida:landing-draft") || "null"); } catch { /* ignore malformed landing draft */ }
    const idea = query.get("idea") || landing?.idea;
    if (idea) {
      editedBeforeRestoreRef.current = true;
      setPrompt((current) => current || idea);
    }
    const characterName = query.get("character") || landing?.character;
    if (characterName && characterName !== "Thêm nhân vật mới" && characters.length) {
      const character = characters.find((item) => item.name.toLocaleLowerCase() === characterName.toLocaleLowerCase());
      const imageUrl = character?.avatar_url || character?.poses?.[0]?.image_url;
      if (imageUrl) setReferences((current) => current.length ? current : [imageUrl]);
    }
  }, [characters, query]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(`aida:video-draft:${projectRef}`);
    if (stored) {
      try { applyDraft(JSON.parse(stored) as Record<string, unknown>); } catch { window.sessionStorage.removeItem(`aida:video-draft:${projectRef}`); }
    }
    let active = true;
    fetch(`/api/projects/${projectRef}/drafts?tool=video`).then(async (response) => response.ok ? response.json() : null).then((payload) => {
      if (!active) return;
      if (payload?.draft) {
        const draft = payload.draft;
        draftRef.current = { id: draft.id, version: draft.version };
        if (payload.output) {
          setOutput(payload.output);
          lastSavedOutputIdRef.current = payload.output.id;
          if (payload.output.generation_job_id && ["queued", "running"].includes(payload.output.status)) setJobId(payload.output.generation_job_id);
        } else if (draft.content_output_id) {
          setOutput({ id: draft.content_output_id });
          lastSavedOutputIdRef.current = draft.content_output_id;
        }
        if (!editedBeforeRestoreRef.current && draft.payload) {
          applyDraft(draft.payload);
          lastSavedPayloadRef.current = JSON.stringify(draft.payload);
        }
      }
    }).catch(() => { if (active) setDraftState("offline"); }).finally(() => {
      if (active) { draftReadyRef.current = true; setDraftState((current) => current === "offline" ? current : "saved"); }
    });
    return () => { active = false; };
  }, [projectRef]);

  useEffect(() => {
    latestPayloadRef.current = payload;
    window.sessionStorage.setItem(`aida:video-draft:${projectRef}`, payloadKey);
    setQuote(null);
  }, [projectRef, payload, payloadKey]);

  useEffect(() => {
    if (!draftReadyRef.current || !hasDraftContent || (payloadKey === lastSavedPayloadRef.current && output?.id === lastSavedOutputIdRef.current)) return;
    const timer = window.setTimeout(() => {
      if (saveInFlightRef.current) return;
      const persist = async () => {
        saveInFlightRef.current = true;
        setDraftState("saving");
        try {
          while (hasDraftContent) {
            const nextPayload = latestPayloadRef.current;
            const nextKey = JSON.stringify(nextPayload);
            if (nextKey === lastSavedPayloadRef.current) break;
            const draft = draftRef.current;
            const response = draft.id
              ? await fetch(`/api/projects/${projectRef}/drafts/${draft.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: draft.version, payload: nextPayload, ...(output ? { content_output_id: output.id } : {}) }) })
              : await fetch(`/api/projects/${projectRef}/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "video", payload: nextPayload, ...(output ? { content_output_id: output.id } : {}) }) });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || "Không thể lưu bản nháp.");
            draftRef.current = { id: json.draft.id, version: json.draft.version };
            lastSavedOutputIdRef.current = output?.id ?? null;
            lastSavedPayloadRef.current = nextKey;
          }
          setDraftState("saved");
        } catch { setDraftState("offline"); } finally { saveInFlightRef.current = false; }
      };
      void persist();
    }, 750);
    return () => window.clearTimeout(timer);
  }, [projectRef, payloadKey, hasDraftContent, output]);

  const outputId = output?.id;

  useEffect(() => {
    if (!jobId || !outputId) return;
    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      if (!active || document.visibilityState === "hidden" || !navigator.onLine) return;
      try {
        const response = await fetch(`/api/continuity/jobs/${jobId}`, { cache: "no-store" });
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || "Không đọc được tiến trình video.");
        if (job.contentOutput) setOutput((current) => current ? { ...current, ...job.contentOutput } : job.contentOutput);
        if (["completed", "failed", "cancelled"].includes(job.status)) {
          setJobId(null);
          return;
        }
        attempts += 1;
      } catch {
        attempts += 1;
      }
      timer = window.setTimeout(poll, attempts < 20 ? 3000 : 10000);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") { window.clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);
    void poll();
    return () => { active = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("online", onVisibility); };
  }, [jobId, outputId]);

  const config = () => ({ mode, prompt: prompt.trim(), ...(image ? { image } : {}), ...(lastImage ? { last_image: lastImage } : {}), ...(references.length ? { reference_images: references } : {}), duration, resolution, aspect_ratio: aspect, generate_audio: audio });

  async function createOutput() {
    if (!project) throw new Error("Không tìm thấy dự án.");
    const setResponse = await fetch("/api/content-sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: project.id, title: "Video", brief: prompt.trim(), selected_character_ids: characters.filter((c) => references.includes(c.avatar_url || c.poses?.[0]?.image_url || "")).map((c) => c.id) }) });
    const setJson = await setResponse.json();
    if (!setResponse.ok) throw new Error(setJson.error || "Không tạo được bản nháp video.");
    const outputResponse = await fetch(`/api/content-sets/${setJson.contentSet.id}/outputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "video", format: mode === "text" ? aspect : "9:16", poster_url: image || null, script: prompt.trim(), caption: caption.trim() || null, duration_seconds: duration, source_snapshot: { mode, image: image || null, lastImage: lastImage || null, referenceImages: references } }) });
    const outputJson = await outputResponse.json();
    if (!outputResponse.ok) throw new Error(outputJson.error || "Không tạo được đầu ra video.");
    return outputJson.output as Output;
  }

  async function getQuote() {
    setError("");
    if (!prompt.trim() || (mode === "image" && !image)) { setError(mode === "image" ? "Chọn ảnh đầu trước khi báo giá." : "Nhập mô tả video trước khi báo giá."); return; }
    setBusy(true);
    try {
      const next = output ?? await createOutput(); setOutput(next);
      const response = await fetch(`/api/content-outputs/${next.id}/video/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config()) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || "Không lấy được báo giá."); setQuote(json.quote);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không lấy được báo giá."); } finally { setBusy(false); }
  }

  async function generate() {
    if (!quote || !output) return getQuote();
    setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/content-outputs/${output.id}/video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config(), request_id: requestId() }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || "Không gửi được video.");
      setOutput((current) => current ? { ...current, status: "running" } : current);
      setJobId(json.jobId || null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không gửi được video."); } finally { setBusy(false); }
  }

  const loading = projectLoading || charactersLoading || (shouldLoadMedia && memesLoading);
  if (!project && !projectLoading) return <div className="min-h-screen th-bg-primary" />;

  return <div className="flex"><Sidebar projectId={projectRef} projectName={project?.name} />
    <main className="ml-0 min-h-screen flex-1 p-4 pt-16 lg:ml-56 md:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight th-text-primary">Tạo video</h1><p className="mt-1 text-sm th-text-tertiary">Tạo trực tiếp từ mô tả hoặc ảnh trong dự án. Kịch bản chỉ là hỗ trợ, không phải bước bắt buộc.</p></div><nav className="flex rounded-lg border p-1" style={{ borderColor: "var(--border-primary)" }} aria-label="Chế độ tạo video"><span className="rounded-md px-3 py-2 text-sm font-semibold th-bg-accent-light th-text-accent">Một clip</span><Link className="rounded-md px-3 py-2 text-sm font-medium th-text-secondary th-bg-hover" href={`/projects/${projectRef}/video/multiscene`}>Nhiều cảnh</Link></nav></header>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)]">
          <section className="rounded-xl border p-5 md:p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
            <div className="mb-6 grid grid-cols-2 rounded-xl p-1" style={{ background: "var(--bg-tertiary)" }}>
              {([['text','Từ mô tả'],['image','Từ ảnh']] as const).map(([value,label]) => <button key={value} onClick={() => { markEdited(); setMode(value); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === value ? "text-white shadow-sm" : "th-text-muted th-bg-hover"}`} style={mode === value ? { background: "var(--accent)" } : undefined}>{label}</button>)}
            </div>
            <div className="flex items-center justify-between gap-3"><label className="block text-sm font-semibold th-text-primary">Bạn muốn làm nội dung gì?</label><button onClick={assistVideo} disabled={assisting || !prompt.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold th-text-accent th-bg-accent-light disabled:opacity-50"><Wand2 size={15} />{assisting ? "AI đang soạn…" : "AI soạn video"}</button></div><textarea value={prompt} onChange={(event) => { markEdited(); setPrompt(event.target.value); }} className="mt-2 min-h-36 w-full rounded-lg border p-3 text-sm outline-none th-bg-input th-text-primary th-ring-accent focus:ring-2" style={{ borderColor: "var(--border-primary)" }} placeholder="Ví dụ: Bánh Bao cố giấu chiếc bánh cuối cùng, Đậu Đỏ phát hiện ra và cả hai kết thúc bằng một câu đùa…" /><label className="mt-3 block text-xs font-semibold th-text-secondary">Caption bài đăng <span className="font-normal th-text-tertiary">· tách riêng khỏi lời thoại/video</span><textarea value={caption} onChange={(event) => { markEdited(); setCaption(event.target.value); }} className="mt-1.5 min-h-16 w-full rounded-lg border p-2 text-sm th-bg-input th-text-primary" style={{ borderColor: "var(--border-primary)" }} placeholder="AI sẽ đề xuất caption khi bạn bấm soạn video." /></label>
            {mode === "image" ? <div className="mt-5"><p className="text-sm font-semibold th-text-primary">Ảnh đầu</p><p className="mt-1 text-xs th-text-tertiary">Tỷ lệ video sẽ theo ảnh đầu.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{candidateImages.slice(0, 9).map((item) => <button key={item.id} onClick={() => { markEdited(); setImage(item.url); }} className={`relative aspect-square overflow-hidden rounded-xl border ${image === item.url ? "border-blue-500 ring-2 ring-blue-500/30" : ""}`} style={{ borderColor: "var(--border-primary)" }}><Image src={item.url} alt={item.label} fill sizes="180px" className="object-cover" /><span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[10px] text-white">{item.label}</span></button>)}</div>{memesLoading ? <p className="mt-3 text-sm th-text-tertiary">Đang tải ảnh của dự án…</p> : candidateImages.length === 0 && <p className="mt-3 rounded-xl border border-dashed p-4 text-sm th-text-tertiary">Chưa có ảnh trong dự án. Tạo ảnh trước hoặc tải ảnh lên trong phiên bản tiếp theo.</p>}</div> : <div className="mt-5"><p className="text-sm font-semibold th-text-primary">Nhân vật tham chiếu <span className="font-normal th-text-tertiary">(tuỳ chọn)</span></p><div className="mt-3 flex flex-wrap gap-2">{characters.map((character) => { const url = character.avatar_url || character.poses?.[0]?.image_url; if (!url) return null; const active = references.includes(url); return <button key={character.id} onClick={() => { markEdited(); setReferences(active ? references.filter((value) => value !== url) : [...references, url]); }} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "th-text-secondary"}`}><span className="relative h-7 w-7 overflow-hidden rounded-full"><Image src={url} alt="" fill sizes="28px" className="object-cover" /></span>{character.name}</button>; })}</div></div>}
            <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><p className="text-sm font-semibold th-text-primary">Thời lượng</p><div className="mt-2 flex gap-2">{DURATIONS.map((value) => <button key={value} onClick={() => { markEdited(); setDuration(value); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${duration === value ? "border-blue-500 bg-blue-50 text-blue-700" : "th-text-secondary"}`}>{value}s</button>)}</div></div><div><p className="text-sm font-semibold th-text-primary">Độ phân giải</p><div className="mt-2 flex gap-2">{RESOLUTIONS.map((value) => <button key={value} onClick={() => { markEdited(); setResolution(value); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${resolution === value ? "border-blue-500 bg-blue-50 text-blue-700" : "th-text-secondary"}`}>{value}</button>)}</div></div></div>
            {mode === "text" && <div className="mt-5"><p className="text-sm font-semibold th-text-primary">Tỷ lệ</p><div className="mt-2 flex gap-2">{ASPECTS.map((value) => <button key={value} onClick={() => { markEdited(); setAspect(value); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${aspect === value ? "border-blue-500 bg-blue-50 text-blue-700" : "th-text-secondary"}`}>{value}</button>)}</div></div>}
            <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm th-text-primary"><input checked={audio} onChange={(event) => { markEdited(); setAudio(event.target.checked); }} type="checkbox" className="h-4 w-4 accent-blue-600" /><Volume2 size={16} /> Tạo âm thanh đồng bộ</label>
            {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="sticky bottom-3 mt-6 rounded-xl border p-3 backdrop-blur" style={{ background: "color-mix(in srgb, var(--bg-card) 94%, transparent)", borderColor: "var(--border-primary)" }}><button disabled={busy || loading} onClick={quote ? generate : getQuote} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Clapperboard size={17} />}{quote ? `Tạo video · ${quote.customerPoints.toLocaleString("vi-VN")} điểm` : "Xem giá video"}</button><p className="mt-2 text-center text-xs th-text-tertiary">{draftState === "saving" ? "Đang lưu bản nháp…" : draftState === "offline" ? "Chưa đồng bộ; vẫn giữ bản trên thiết bị này" : quote ? "Giá đã khoá trong 5 phút" : "5 giây · 720p · có âm thanh là mặc định"}</p></div>
          </section>
          <aside className="rounded-2xl border p-5 md:p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-500">Kết quả</p><h2 className="mt-1 text-lg font-semibold th-text-primary">Video của dự án</h2></div><RefreshCw size={18} className="th-text-muted" /></div>{output?.media_url ? <video controls playsInline className="mt-5 aspect-video w-full rounded-xl bg-black" poster={output.poster_url || undefined} src={`/api/content-outputs/${output.id}/media`} /> : <div className="mt-5 flex aspect-[9/11] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border-primary)", background: "var(--bg-tertiary)" }}><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><Play size={20} /></span><strong className="th-text-primary">Kết quả sẽ xuất hiện ở đây</strong><p className="mt-2 max-w-xs text-sm th-text-tertiary">Bạn có thể rời trang. Trạng thái job và video hoàn tất được giữ trong thư viện.</p></div>}<Link href={`/projects/${projectRef}/gallery`} className="mt-5 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold th-text-primary"><ImagePlus size={16} /> Xem nội dung đã lưu</Link></aside>
        </div>
      </div>
    </main>
  </div>;
}
