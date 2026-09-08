"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Clapperboard, LoaderCircle, Plus, Trash2, Volume2 } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import { useCharacters, useMemes, useProject } from "@/lib/use-store";

type Scene = { characterIds: string[]; speakerCharacterId: string | null; dialogue: string; action: string; setting: string; durationSeconds: 5 | 10 | 15 | 30; startImageUrl: string | null; endImageUrl: string | null; followsPrevious: boolean };
type Plan = { id: string; version: number; status: string; quote_snapshot?: { totals?: { customerPoints?: number; providerCostUsd?: number } } | null; video_plan_scenes?: Array<{ id: string; status: string; clip_url?: string | null }> };
const durations = [5, 10, 15, 30] as const;
const initialScene = (): Scene => ({ characterIds: [], speakerCharacterId: null, dialogue: "", action: "", setting: "", durationSeconds: 5, startImageUrl: null, endImageUrl: null, followsPrevious: false });

export default function MultiSceneVideoPage() {
  const { id: projectRef } = useParams<{ id: string }>();
  const { project } = useProject(projectRef); const { characters } = useCharacters(projectRef); const { memes } = useMemes(projectRef, true);
  const [title, setTitle] = useState("Video nhiều cảnh"); const [brief, setBrief] = useState("");
  const [scenes, setScenes] = useState<Scene[]>(() => Array.from({ length: 6 }, initialScene));
  const [plan, setPlan] = useState<Plan | null>(null); const [renderJobId, setRenderJobId] = useState<string | null>(null); const [busy, setBusy] = useState<"save" | "quote" | "run" | null>(null); const [error, setError] = useState("");
  const choices = useMemo(() => [
    ...characters.flatMap((character) => { const url = character.avatar_url || character.poses?.[0]?.image_url; return url ? [{ id: `character-${character.id}`, url, label: `${character.name} · ảnh chuẩn` }] : []; }),
    ...memes.filter((meme) => meme.image_url).map((meme) => ({ id: `meme-${meme.id}`, url: meme.image_url!, label: meme.title || "Ảnh thư viện" })),
  ], [characters, memes]);
  const total = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const update = (index: number, next: Partial<Scene>) => setScenes((current) => current.map((scene, itemIndex) => itemIndex === index ? { ...scene, ...next } : scene));
  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectRef}/video-plans`).then(async (response) => response.ok ? response.json() : null).then((payload) => {
      const latest = payload?.plans?.find((item: Plan) => ["draft", "quoted", "running"].includes(item.status));
      if (!active || !latest) return;
      setPlan(latest);
      setScenes((latest.video_plan_scenes ?? []).map((scene: { cast_snapshot?: Array<{ characterId: string }>; speaker_character_id?: string | null; dialogue?: string; action?: string; setting?: string; duration_seconds?: number; start_image_url?: string | null; end_image_url?: string | null; follows_previous?: boolean }) => ({ characterIds: (scene.cast_snapshot ?? []).map((character) => character.characterId), speakerCharacterId: scene.speaker_character_id ?? null, dialogue: scene.dialogue ?? "", action: scene.action ?? "", setting: scene.setting ?? "", durationSeconds: (durations.includes(scene.duration_seconds as Scene["durationSeconds"]) ? scene.duration_seconds : 5) as Scene["durationSeconds"], startImageUrl: scene.start_image_url ?? null, endImageUrl: scene.end_image_url ?? null, followsPrevious: scene.follows_previous === true })));
    }).catch(() => {});
    return () => { active = false; };
  }, [projectRef]);
  useEffect(() => {
    if (!renderJobId) return;
    let active = true; let timer: number | undefined;
    const poll = async () => { try { const response = await fetch(`/api/continuity/jobs/${renderJobId}`, { cache: "no-store" }); const json = await response.json(); if (!active) return; if (["completed", "failed", "cancelled"].includes(json.status)) { setPlan((current) => current ? { ...current, status: json.status } : current); setRenderJobId(null); return; } } catch {} timer = window.setTimeout(poll, 5000); };
    void poll(); return () => { active = false; window.clearTimeout(timer); };
  }, [renderJobId]);
  const toggleCast = (index: number, characterId: string) => {
    const scene = scenes[index]; const active = scene.characterIds.includes(characterId); const character = characters.find((item) => item.id === characterId); const image = character?.avatar_url || character?.poses?.[0]?.image_url || null;
    update(index, { characterIds: active ? scene.characterIds.filter((id) => id !== characterId) : [...scene.characterIds, characterId].slice(0, 4), speakerCharacterId: active && scene.speakerCharacterId === characterId ? null : scene.speakerCharacterId, startImageUrl: scene.startImageUrl || image });
  };
  async function savePlan() {
    setError(""); setBusy("save");
    try { const response = await fetch(`/api/projects/${projectRef}/video-plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, brief, format: "9:16", resolution: "720p", generateAudio: true, scenes }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "Không lưu được kế hoạch."); setPlan(json.plan); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không lưu được kế hoạch."); } finally { setBusy(null); }
  }
  async function quotePlan() {
    if (!plan) return savePlan(); setError(""); setBusy("quote");
    try { const response = await fetch(`/api/projects/${projectRef}/video-plans/${plan.id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: plan.version }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "Không lấy được báo giá."); setPlan((current) => current ? { ...current, status: "quoted", quote_snapshot: { totals: json.quote } } : current); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không lấy được báo giá."); } finally { setBusy(null); }
  }
  async function runPlan() {
    if (!plan) return quotePlan(); setError(""); setBusy("run");
    try { const response = await fetch(`/api/projects/${projectRef}/video-plans/${plan.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: plan.version }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "Không gửi được các cảnh."); setPlan((current) => current ? { ...current, status: "running" } : current); setRenderJobId(json.jobId || null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không gửi được các cảnh."); } finally { setBusy(null); }
  }
  const points = plan?.quote_snapshot?.totals?.customerPoints;
  return <div className="flex"><Sidebar projectId={projectRef} projectName={project?.name} />
    <main className="ml-0 min-h-screen flex-1 p-4 pt-16 md:ml-64 md:p-8 lg:p-10"><div className="mx-auto max-w-6xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-blue-500">Seedance 2.5 · native audio</p><h1 className="text-3xl font-semibold tracking-tight th-text-primary">Video nhiều cảnh</h1><p className="mt-2 max-w-2xl text-sm th-text-tertiary">Mỗi cảnh dùng cùng nhân vật 3D đã chọn, có một người nói rõ ràng, rồi được ghép thành một MP4.</p></div><Link href={`/projects/${projectRef}/video`} className="rounded-xl border px-4 py-2 text-sm font-semibold th-text-primary" style={{ borderColor: "var(--border-primary)" }}>Video một clip</Link></header>
      <section className="rounded-2xl border p-5 md:p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold th-text-primary">Tên video<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!!plan} className="mt-2 w-full rounded-xl border p-3 text-sm th-bg-primary" style={{ borderColor: "var(--border-primary)" }} /></label><label className="text-sm font-semibold th-text-primary">Ý tưởng chung<textarea value={brief} onChange={(event) => setBrief(event.target.value)} disabled={!!plan} className="mt-2 min-h-24 w-full rounded-xl border p-3 text-sm th-bg-primary" style={{ borderColor: "var(--border-primary)" }} placeholder="Tình huống mở đầu, diễn biến và điểm chốt…" /></label></div>
        <div className="mt-5 flex items-center justify-between gap-3"><div><h2 className="font-semibold th-text-primary">Cảnh · {scenes.length} cảnh / {total}s dự kiến</h2><p className="mt-1 text-xs th-text-tertiary">Thời lượng thật được lấy từ clip sau khi render; AIDA không kéo giãn hoặc lặp cảnh.</p></div>{!plan && <button onClick={() => setScenes((value) => value.length < 12 ? [...value, initialScene()] : value)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold th-text-primary"><Plus size={16} /> Thêm cảnh</button>}</div>
        <div className="mt-5 space-y-4">{scenes.map((scene, index) => <article key={index} className="rounded-xl border p-4" style={{ borderColor: "var(--border-primary)" }}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold th-text-primary">Cảnh {index + 1}</h3>{!plan && scenes.length > 1 && <button aria-label={`Bỏ cảnh ${index + 1}`} onClick={() => setScenes((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-red-500"><Trash2 size={16} /></button>}</div><p className="mt-3 text-xs font-semibold uppercase tracking-wide th-text-tertiary">Cast xuất hiện</p><div className="mt-2 flex flex-wrap gap-2">{characters.map((character) => <button key={character.id} disabled={!!plan} onClick={() => toggleCast(index, character.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${scene.characterIds.includes(character.id) ? "border-blue-500 bg-blue-50 text-blue-700" : "th-text-secondary"}`}>{character.name}</button>)}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold th-text-secondary">Người nói<select value={scene.speakerCharacterId ?? ""} disabled={!!plan} onChange={(event) => update(index, { speakerCharacterId: event.target.value || null })} className="mt-1.5 w-full rounded-lg border p-2 text-sm th-bg-primary"><option value="">Không có lời thoại</option>{scene.characterIds.map((id) => <option key={id} value={id}>{characters.find((character) => character.id === id)?.name}</option>)}</select></label><label className="text-xs font-semibold th-text-secondary">Thời lượng<select value={scene.durationSeconds} disabled={!!plan} onChange={(event) => update(index, { durationSeconds: Number(event.target.value) as Scene["durationSeconds"] })} className="mt-1.5 w-full rounded-lg border p-2 text-sm th-bg-primary">{durations.map((value) => <option key={value} value={value}>{value} giây</option>)}</select></label></div>
            <div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-xs font-semibold th-text-secondary">Lời thoại<textarea value={scene.dialogue} disabled={!!plan} onChange={(event) => update(index, { dialogue: event.target.value })} className="mt-1.5 min-h-20 w-full rounded-lg border p-2 text-sm th-bg-primary" placeholder="Một người nói một câu trọn vẹn…" /></label><label className="text-xs font-semibold th-text-secondary">Hành động<textarea value={scene.action} disabled={!!plan} onChange={(event) => update(index, { action: event.target.value })} className="mt-1.5 min-h-20 w-full rounded-lg border p-2 text-sm th-bg-primary" placeholder="Cử chỉ, chuyển động máy quay…" /></label><label className="text-xs font-semibold th-text-secondary">Bối cảnh<textarea value={scene.setting} disabled={!!plan} onChange={(event) => update(index, { setting: event.target.value })} className="mt-1.5 min-h-20 w-full rounded-lg border p-2 text-sm th-bg-primary" placeholder="Không gian, ánh sáng…" /></label></div>
            <div className="mt-4"><p className="text-xs font-semibold th-text-secondary">Ảnh đầu <span className="font-normal">(bắt buộc để giữ cast và tỷ lệ)</span></p><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{choices.slice(0, 18).map((choice) => <button key={choice.id} disabled={!!plan} onClick={() => update(index, { startImageUrl: choice.url })} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${scene.startImageUrl === choice.url ? "border-blue-500 ring-2 ring-blue-500/30" : ""}`}><Image src={choice.url} alt={choice.label} fill sizes="64px" className="object-cover" /></button>)}</div></div>
          </article>)}</div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="sticky bottom-3 mt-6 rounded-xl border p-3 backdrop-blur" style={{ background: "color-mix(in srgb, var(--bg-card) 92%, transparent)", borderColor: "var(--border-primary)" }}>{plan?.status === "running" ? <p className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-50 text-sm font-semibold text-blue-700"><LoaderCircle className="animate-spin" size={17} /> Đang tạo từng cảnh và ghép video</p> : <button disabled={!!busy} onClick={points ? runPlan : plan ? quotePlan : savePlan} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Clapperboard size={17} />}{points ? `Tạo ${scenes.length} cảnh · ${points.toLocaleString("vi-VN")} điểm` : plan ? "Xem tổng giá" : "Lưu kịch bản để xem giá"}</button>}<p className="mt-2 flex items-center justify-center gap-1 text-center text-xs th-text-tertiary"><Volume2 size={13} /> 720p · 9:16 · âm thanh native · giá được khoá 5 phút sau khi duyệt</p></div>
      </section>
    </div></main></div>;
}
