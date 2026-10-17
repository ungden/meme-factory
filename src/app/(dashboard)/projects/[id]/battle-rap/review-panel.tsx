"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Check, Copy, Download, LockKeyhole, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { BattleRun, ReviewStage } from "@/lib/battle-rap/contracts";
import { eligibleAssetKeys, REVIEW_STAGES } from "@/lib/battle-rap/review";
import { formatNumber, formatPoints } from "@/lib/format";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Textarea from "@/components/ui/textarea";
import PriceLine from "@/components/ui/price-line";
import AssistSuggestions from "./assist-suggestions";

export type BattleDetail = {
  run: BattleRun;
  steps: { id: string; step_key: string; status: string }[];
  reviewPricing?: Record<string, number>;
  media: {
    audio: string | null; images: Record<string, string>;
    clips?: Record<string, string>; excerpts?: Record<string, string>;
    variants?: Record<string, { id: string; url: string; note?: string }[]>;
    output: { video: string; subtitles: string; plan: string } | null;
  };
};
export type ReviewCommand =
  | { action: "approveStage"; musicMode?: "upload" | "auto" }
  | { action: "replaceMusic" }
  | { action: "regenerateText"; target: "brief" | "storyboard"; feedback: string }
  | { action: "regenerateAsset"; assetKey: string; feedback: string }
  | { action: "selectVariant"; assetKey: string; variantId: string };

type ViewStage = ReviewStage | "render";
const stages: ViewStage[] = ["lyrics", "music", "storyboard", "cast", "stage", "scenes", "clips", "render"];
const names: Record<ViewStage, string> = { lyrics: "Lời bài", music: "Bản nhạc", storyboard: "Kịch bản hình", cast: "Nhân vật", stage: "Sân khấu", scenes: "Ảnh từng đoạn", clips: "Video từng đoạn", render: "Ghép bài" };
const nextLabels: Record<ReviewStage, string> = {
  lyrics: "Chốt lời và làm tiếp", music: "Chốt nhạc và viết kịch bản hình", storyboard: "Chốt kịch bản và vẽ nhân vật",
  cast: "Chốt nhân vật và vẽ sân khấu", stage: "Chốt sân khấu và vẽ từng đoạn", scenes: "Chốt ảnh và làm video", clips: "Chốt các đoạn và ghép bài",
};

function currentStage(run: BattleRun): ViewStage {
  const review = run.state.review!;
  if (run.status === "awaiting_review") return review.stage;
  if (["render", "done"].includes(run.phase)) return "render";
  if (["awaiting_music", "awaiting_lyrics"].includes(run.status)) return "music";
  return review.approved.includes(review.stage) ? stages[Math.min(stages.indexOf(review.stage) + 1, stages.length - 1)] : review.stage;
}

function ClipPreview({ url, excerpt, title }: { url: string; excerpt?: string; title: string }) {
  const video = useRef<HTMLVideoElement>(null), audio = useRef<HTMLAudioElement>(null);
  const [withMusic, setWithMusic] = useState(true), [audioError, setAudioError] = useState(false);
  useEffect(() => { const element = audio.current; return () => { element?.pause(); }; }, [url, excerpt]);
  function sync(play = false) {
    if (!audio.current || !video.current) return;
    if (Math.abs(audio.current.currentTime - video.current.currentTime) > 0.2) audio.current.currentTime = video.current.currentTime;
    audio.current.playbackRate = video.current.playbackRate;
    if (play && withMusic) void audio.current.play().catch(() => setAudioError(true));
  }
  return <div className="space-y-2">
    <video ref={video} aria-label={title} controls muted playsInline preload="metadata" src={url} className="max-h-[55vh] w-full rounded-xl th-bg-tertiary" onPlay={() => sync(true)} onPause={() => audio.current?.pause()} onEnded={() => audio.current?.pause()} onSeeking={() => sync()} onSeeked={() => sync(!video.current?.paused)} onTimeUpdate={() => sync()} onRateChange={() => sync()} />
    {excerpt && <><audio ref={audio} src={excerpt} preload="none" hidden /><Button variant="ghost" size="sm" onClick={() => { setWithMusic(!withMusic); if (withMusic) audio.current?.pause(); else if (!video.current?.paused) { if (audio.current && video.current) audio.current.currentTime = video.current.currentTime; void audio.current?.play().catch(() => setAudioError(true)); } }}>{withMusic ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}{withMusic ? "Đang dùng nhạc gốc" : "Bật nhạc gốc"}</Button></>}
    {audioError && excerpt && <div><p className="text-xs th-text-tertiary">Bấm phát để nghe riêng phần nhạc của đoạn này.</p><audio controls preload="none" src={excerpt} className="mt-2 w-full" /></div>}
  </div>;
}

function AssetCard({ detail, assetKey, locked, busy, endpoint, onAction, onCopy }: {
  detail: BattleDetail; assetKey: string; locked: boolean; busy: boolean; endpoint: string;
  onAction: (command: ReviewCommand) => Promise<boolean>; onCopy: (text: string) => void;
}) {
  const { run, media } = detail, review = run.state.review!;
  const [feedback, setFeedback] = useState("");
  const video = assetKey.startsWith("video:"), id = assetKey.slice(6);
  const blockId = video ? id : id.startsWith("scene-") ? id.slice(6) : null;
  const index = blockId ? (run.state.blocks || []).findIndex(block => block.id === blockId) : -1;
  const block = index >= 0 ? run.state.blocks![index] : null;
  const role = id.startsWith("cast-") ? id.slice(5) : null;
  const roleName = { A: "Người rap thứ nhất", B: "Người rap thứ hai", MC: "Người dẫn", DJ: "Người chơi nhạc" }[role || ""];
  const castName = run.state.brief?.cast.find(person => person.role === role)?.name;
  const title = roleName ? `${roleName}${castName ? ` · ${castName}` : ""}` : id === "stage" ? "Sân khấu và khán giả" : `${video ? "Video" : "Ảnh"} đoạn ${formatNumber(index + 1)}`;
  const variants = media.variants?.[assetKey] || [], selected = review.selected[assetKey];
  const current = variants.find(variant => variant.id === selected);
  const url = current?.url || (video ? media.clips?.[id] : media.images[id]);
  const price = detail.reviewPricing?.[assetKey];
  const blocked = locked || busy;
  return <Card className="min-w-0 space-y-3 p-4">
    <h3 className="break-words font-medium th-text-primary">{title}</h3>
    {block && <p className="text-xs th-text-tertiary">{formatNumber(block.start)}–{formatNumber(block.end)} giây</p>}
    {url ? video ? <ClipPreview key={url} url={url} excerpt={media.excerpts?.[id]} title={title} /> : <a href={url} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${title}`} className="relative block aspect-[4/5] overflow-hidden rounded-xl th-bg-tertiary"><Image src={url} alt={title} fill unoptimized sizes="(max-width: 640px) 85vw, 42vw" className="object-contain" /></a> : <div className="flex min-h-36 items-center justify-center rounded-xl th-bg-tertiary p-4 text-center text-sm th-text-tertiary">Đang chuẩn bị bản mới. Các bản trước vẫn được giữ bên dưới.</div>}
    {variants.length > 0 && <div className="space-y-2"><p className="text-xs th-text-secondary">{formatNumber(variants.length)} bản đã làm · {selected ? "bản đánh dấu sẽ được dùng" : "đang làm thêm một bản"}</p><div className="grid grid-cols-3 gap-2">
      {variants.map((variant, variantIndex) => <button key={variant.id} type="button" aria-label={`Chọn bản ${formatNumber(variantIndex + 1)} của ${title}`} aria-pressed={selected === variant.id} disabled={blocked || selected === variant.id} onClick={() => void onAction({ action: "selectVariant", assetKey, variantId: variant.id })} className={`min-w-0 overflow-hidden rounded-lg border text-xs transition-colors disabled:cursor-default ${selected === variant.id ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-bg-tertiary th-text-secondary"}`}>
        {!video && <span className="relative block aspect-square"><Image src={variant.url} alt="" fill unoptimized sizes="140px" className="object-cover" /></span>}
        <span className="flex items-center justify-center gap-1 p-2">{selected === variant.id && <Check size={12} aria-hidden />}Bản {formatNumber(variantIndex + 1)}</span>
      </button>)}
    </div>{current?.note && <p className="break-words text-xs th-text-tertiary">Góp ý của bản đang chọn: {current.note}</p>}</div>}
    {block && <details><summary className="cursor-pointer text-xs th-text-secondary">Nội dung đoạn này</summary><div className="mt-2 space-y-2">{run.state.storyboard?.shots.filter(shot => shot.blockId === blockId).map(shot => <p key={shot.id} className="break-words text-sm th-text-secondary">{shot.description}</p>)}</div></details>}
    {!locked && <div className="space-y-3 border-t th-border pt-3">
      <AssistSuggestions endpoint={endpoint} runId={run.id} revision={review.revision} assetKey={assetKey} disabled={busy} onChoose={setFeedback} onCopy={onCopy} />
      <Textarea id={`feedback-${assetKey}`} label="Muốn chỉnh gì? (không bắt buộc)" placeholder={video ? "Ví dụ: Đổi sang cận cảnh người đang rap, khán giả phản ứng mạnh hơn." : "Ví dụ: Giữ trang phục, đổi ánh sáng và làm rõ khuôn mặt."} rows={2} value={feedback} maxLength={1600} onChange={event => setFeedback(event.target.value)} disabled={busy} />
      <PriceLine points={price ?? null} note="Điểm dự kiến cho một bản làm lại, trong mức chi. Các bản trước vẫn được giữ." />
      <Button className="w-full" variant="outline" loading={busy} disabled={price === undefined} onClick={() => void onAction({ action: "regenerateAsset", assetKey, feedback }).then(ok => { if (ok) setFeedback(""); })}><RotateCcw size={14} aria-hidden />{video ? "Làm lại đoạn này" : "Vẽ lại ảnh này"}</Button>
    </div>}
  </Card>;
}

export default function ReviewPanel({ detail, busy, musicReady, endpoint, manualMusic, onAction, onCopy, onDownload }: {
  detail: BattleDetail; busy: boolean; musicReady: boolean; endpoint: string; manualMusic: ReactNode;
  onAction: (command: ReviewCommand) => Promise<boolean>; onCopy: (text: string) => void; onDownload: () => void;
}) {
  const { run, media } = detail, review = run.state.review!, current = currentStage(run);
  const [view, setView] = useState<{ current: ViewStage; stage: ViewStage }>({ current, stage: current });
  const visible = view.current === current ? view.stage : current;
  const [feedback, setFeedback] = useState("");
  const [musicMode, setMusicMode] = useState<"upload" | "auto">(musicReady ? "auto" : "upload");
  const editable = visible !== "render" && visible === review.stage && run.status === "awaiting_review" && !review.approved.includes(visible);
  const brief = run.state.brief;
  const remaining = Math.max(0, run.budget_points - run.points_used);
  const nextStage = stages[Math.min(stages.indexOf(visible) + 1, stages.length - 1)];
  const nextKeys = nextStage === "render" ? [] : eligibleAssetKeys(run.state, nextStage);
  const nextPrices = nextKeys.map(key => detail.reviewPricing?.[key]);
  const price = visible === "lyrics" ? musicMode === "auto" ? detail.reviewPricing?.music ?? { min: 0, max: remaining } : 0
    : ["music", "clips"].includes(visible) ? 0 : nextPrices.length && nextPrices.every(value => value !== undefined) ? nextPrices.reduce<number>((total, value) => total + (value || 0), 0) : { min: 0, max: remaining };
  const assets = visible === "render" ? [] : eligibleAssetKeys(run.state, visible);
  const complete = visible === "lyrics" ? !!brief : visible === "music" ? !!media.audio : visible === "storyboard" ? !!run.state.storyboard : assets.length > 0 && assets.every(key => key.startsWith("image:") ? !!media.images[key.slice(6)] : !!media.clips?.[key.slice(6)]);
  return <div className="space-y-4">
    <nav aria-label="Các bước làm bài" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stages.map((stage, index) => { const approved = stage === "render" ? run.status === "completed" : review.approved.includes(stage); const accessible = approved || stage === current; return <button key={stage} type="button" onClick={() => { setView({ current, stage }); setFeedback(""); }} disabled={!accessible || busy} aria-current={visible === stage ? "step" : undefined} className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 text-left text-xs ${visible === stage ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-bg-card th-text-secondary"} disabled:cursor-default`}><span className="shrink-0">{approved ? <Check size={14} aria-label="Đã chốt" /> : accessible ? formatNumber(index + 1) : <LockKeyhole size={13} aria-label="Chưa tới bước này" />}</span><span className="break-words">{names[stage]}</span></button>; })}
    </nav>
    <div className="space-y-1"><h2 className="text-lg font-semibold th-text-primary">{visible === "render" ? names.render : REVIEW_STAGES[visible]}</h2><p className="text-sm th-text-secondary">{editable ? "Xem từng bản, chọn bản ưng ý rồi chốt để làm bước tiếp theo." : visible !== current ? "Bước này đã chốt. Bạn vẫn xem lại được các bản đã chọn." : "Các bản đã chọn được giữ lại trong lúc làm bước này."}</p></div>
    {visible === "lyrics" && brief && <Card className="min-w-0 space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="break-words text-lg font-semibold th-text-primary">{brief.suno.title}</h3><Button size="sm" variant="outline" onClick={onDownload}><Download size={14} aria-hidden />Tải phần chữ cho Suno</Button></div>
      <p className="break-words text-sm th-text-secondary">{brief.concept}</p>
      {Object.entries({ title: "Tên bài", lyrics: "Lời bài", style: "Chất nhạc" }).map(([key, label]) => <details key={key} open={key === "lyrics"}><summary className="cursor-pointer text-sm font-medium th-text-secondary">{label}</summary><div className="mt-2 space-y-2"><pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl th-bg-tertiary p-3 font-sans text-sm th-text-primary">{brief.suno[key as keyof typeof brief.suno]}</pre><Button variant="ghost" size="sm" onClick={() => onCopy(brief.suno[key as keyof typeof brief.suno])}><Copy size={14} aria-hidden />Sao chép</Button></div></details>)}
    </Card>}
    {visible === "music" && <div className="space-y-4">{media.audio && <Card className="space-y-3 p-4"><h3 className="font-medium th-text-primary">{brief?.suno.title || "Bản nhạc đang chọn"}</h3><audio controls preload="metadata" src={media.audio} className="w-full" /><p className="text-xs th-text-tertiary">Nghe lại hai giọng rap, lời và phần kết trước khi chọn hình cho bài.</p>{editable && <Button variant="outline" loading={busy} onClick={() => void onAction({ action: "replaceMusic" })}>Thay bằng bản nhạc khác</Button>}</Card>}{manualMusic}{editable && <AssistSuggestions endpoint={endpoint} runId={run.id} revision={review.revision} disabled={busy} onCopy={onCopy} />}</div>}
    {visible === "storyboard" && run.state.storyboard && <Card className="p-4 sm:p-5"><ol className="space-y-3">{run.state.storyboard.shots.map((shot, index) => <li key={shot.id} className="min-w-0 rounded-xl th-bg-tertiary p-3 text-sm"><p className="font-medium th-text-primary">Cảnh {formatNumber(index + 1)} · {formatNumber(shot.start)}–{formatNumber(shot.end)} giây</p><p className="mt-1 break-words th-text-secondary">{shot.description}</p></li>)}</ol></Card>}
    {assets.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{assets.map(key => <AssetCard key={key} detail={detail} assetKey={key} locked={!editable} busy={busy} endpoint={endpoint} onAction={onAction} onCopy={onCopy} />)}</div>}
    {editable && ["lyrics", "storyboard"].includes(visible) && <Card className="space-y-3 p-4">
      <AssistSuggestions endpoint={endpoint} runId={run.id} revision={review.revision} disabled={busy} onChoose={setFeedback} onCopy={onCopy} />
      <Textarea id={`feedback-${visible}`} label={visible === "lyrics" ? "Muốn chỉnh lời như thế nào?" : "Muốn đổi các cảnh như thế nào?"} placeholder={visible === "lyrics" ? "Ví dụ: Tăng phần đáp trả, câu ngắn hơn và đổi đoạn kết." : "Ví dụ: Thêm phản ứng khán giả, đổi góc cận ở đoạn cuối."} rows={3} value={feedback} maxLength={1600} onChange={event => setFeedback(event.target.value)} disabled={busy} />
      <PriceLine points={0} note="Viết lại phần chữ ở bước này." />
      <Button variant="outline" loading={busy} onClick={() => void onAction({ action: "regenerateText", target: visible === "lyrics" ? "brief" : "storyboard", feedback }).then(ok => { if (ok) setFeedback(""); })}><RotateCcw size={14} aria-hidden />{visible === "lyrics" ? "Viết lại lời bài" : "Viết lại kịch bản hình"}</Button>
    </Card>}
    {editable && visible === "lyrics" && <Card className="space-y-3 p-4"><h3 className="font-medium th-text-primary">Chọn cách làm bản nhạc</h3><fieldset className="space-y-3" disabled={busy}><legend className="sr-only">Cách nhận bản nhạc</legend>{musicReady && <label className="flex items-start gap-3 text-sm th-text-secondary"><input className="mt-1" type="radio" name="music-mode" value="auto" checked={musicMode === "auto"} onChange={() => setMusicMode("auto")} /><span>Làm nhạc từ lời đã chọn<span className="mt-1 block text-xs th-text-tertiary">Bạn sẽ nghe và chốt bản nhạc trước khi làm hình.</span></span></label>}<label className="flex items-start gap-3 text-sm th-text-secondary"><input className="mt-1" type="radio" name="music-mode" value="upload" checked={musicMode === "upload"} onChange={() => setMusicMode("upload")} /><span>Tôi sẽ tải bản nhạc lên<span className="mt-1 block text-xs th-text-tertiary">Dùng phần chữ trên Suno rồi tải bản bạn chọn vào bài này.</span></span></label></fieldset></Card>}
    {editable && <Card className="space-y-3 p-4 sm:p-5"><p className="text-sm th-text-secondary">Chốt bước này sẽ dùng các bản bạn chọn để làm bước tiếp theo. Phần đã chốt vẫn xem lại được.</p><PriceLine points={price} note={`Dự kiến cho công đoạn tiếp theo, trong mức chi còn lại ${formatPoints(remaining)}.`} /><Button className="w-full whitespace-normal sm:w-auto" loading={busy} disabled={!complete} onClick={() => void onAction({ action: "approveStage", ...(visible === "lyrics" ? { musicMode } : {}) }).then(ok => { if (ok) setFeedback(""); })}><Check size={15} aria-hidden />{nextLabels[visible]}</Button></Card>}
  </div>;
}
