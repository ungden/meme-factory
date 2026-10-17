"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { notFound, useParams } from "next/navigation";
import { Copy, Download, Mic2, Plus } from "lucide-react";
import { PHASE_LABELS, type BattleInput, type BattleRun } from "@/lib/battle-rap/contracts";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { notifyProjectBalanceChanged } from "@/lib/client-fetch";
import { useWallet } from "@/contexts/WalletContext";
import { useToast } from "@/components/ui/toast";
import Button, { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import Alert from "@/components/ui/alert";
import EmptyState from "@/components/ui/empty-state";
import JobStatus from "@/components/ui/job-status";
import PriceLine from "@/components/ui/price-line";
import { PageContainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";

type Detail = { run: BattleRun; steps: { id: string; step_key: string; status: string }[]; media: { audio: string | null; images: Record<string, string>; output: { video: string; subtitles: string; plan: string } | null } };
const overrideLabels: Record<keyof BattleInput["overrides"], string> = { A: "Nhân vật thứ nhất", B: "Nhân vật thứ hai", MC: "Người dẫn", DJ: "Người chơi nhạc", stage: "Sân khấu", music: "Chất nhạc", visual: "Phong cách hình ảnh" };
const defaultOverrides: BattleInput["overrides"] = { A: "", B: "", MC: "", DJ: "", stage: "", music: "", visual: "" };
const active = (run: BattleRun) => ["queued", "running"].includes(run.status);
function runLabel(run: BattleRun) {
  const labels: Partial<Record<BattleRun["status"], string>> = { completed: "Bài đã xong", cancelled: "Bài đã dừng", failed: "Bài bị gián đoạn", needs_review: "Cần kiểm tra để làm tiếp", awaiting_music: "Chờ bản nhạc", awaiting_lyrics: "Chờ tệp lời có thời gian" };
  return labels[run.status] || PHASE_LABELS[run.phase];
}

function saveText(name: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BattleStudio() {
  const { id } = useParams<{ id: string }>(), base = `/api/projects/${id}/battle-rap`;
  const toast = useToast(), wallet = useWallet();
  const [runs, setRuns] = useState<BattleRun[]>([]), [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null), selectedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true), [missing, setMissing] = useState(false), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [musicReady, setMusicReady] = useState(false);
  const [idea, setIdea] = useState(""), [budget, setBudget] = useState(600), [seconds, setSeconds] = useState(100);
  const [language, setLanguage] = useState("vi"), [format, setFormat] = useState("9:16"), [quality, setQuality] = useState("seedance-2.0-fast");
  const [overrides, setOverrides] = useState(defaultOverrides);
  const [audio, setAudio] = useState<File | null>(null), [srt, setSrt] = useState("");
  const audioInput = useRef<HTMLInputElement>(null), srtInput = useRef<HTMLInputElement>(null);
  const [newBudget, setNewBudget] = useState(0);
  const [shortage, setShortage] = useState<{ required: number; current: number } | null>(null);
  const requestKey = useRef<string | null>(null);
  const select = useCallback((key: string | null) => { selectedRef.current = key; setSelected(key); setDetail(null); setAudio(null); setSrt(""); }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(base, { cache: "no-store" }), json = await response.json();
      if (response.status === 404) { setMissing(true); return; }
      if (!response.ok) throw new Error(json.error || "Chưa tải được các bài.");
      setRuns(json.runs); setMusicReady(json.musicReady); setError("");
      const key = selectedRef.current;
      if (key) {
        const response = await fetch(`${base}/${key}`, { cache: "no-store" }), json = await response.json();
        if (!response.ok) throw new Error(json.error || "Chưa tải được bài.");
        if (selectedRef.current === key) setDetail(json);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Chưa tải được bài."); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { void load(); }, [load, selected]);
  useEffect(() => {
    if (!runs.some(active)) return;
    let cancelled = false;
    const tick = async () => { if (!cancelled) { await load(); if (!cancelled) timer = setTimeout(tick, 7000); } };
    let timer = setTimeout(tick, 7000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [load, runs]);

  async function mutate(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), json = await response.json();
    if (response.status === 402) setShortage({ required: json.required || budget, current: json.available || 0 });
    if (!response.ok) throw new Error(json.error || "Chưa thực hiện được. Thử lại nhé.");
    return json;
  }
  async function start() {
    if (busy || !idea.trim()) return;
    setBusy(true);
    requestKey.current ||= crypto.randomUUID();
    try {
      const json = await mutate(base, { idea, budgetPoints: budget, targetSeconds: seconds, language, aspectRatio: format, videoModel: quality, overrides, idempotencyKey: requestKey.current });
      requestKey.current = null; select(json.runId); notifyProjectBalanceChanged(); void wallet.refreshBalance();
      toast.success("Đã nhận ý tưởng. Bạn có thể rời trang trong lúc làm bài."); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Chưa nhận được ý tưởng."); }
    finally { setBusy(false); }
  }
  async function action(action: "cancel" | "resume" | "increase_budget") {
    if (!selected || busy) return;
    setBusy(true);
    try { await mutate(`${base}/${selected}`, { action, budgetPoints: newBudget || (detail?.run.budget_points || 0) + 200, idempotencyKey: crypto.randomUUID() }); notifyProjectBalanceChanged(); void wallet.refreshBalance(); toast.success(action === "cancel" ? "Đã dừng bài và hoàn phần mức chi còn dư." : "Đã tiếp tục từ phần còn lại."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Chưa thực hiện được."); }
    finally { setBusy(false); }
  }
  async function attach() {
    if (!selected || !detail || busy) return;
    setBusy(true);
    try {
      if (detail.run.status === "awaiting_music") {
        if (!audio || audio.size > 30 * 1024 ** 2 || !audio.type.startsWith("audio/")) throw new Error("Chọn bản nhạc MP3, M4A hoặc WAV dưới 30 MB.");
        const signed = await mutate(`${base}/${selected}`, { action: "prepareUpload" });
        const upload = await createClient().storage.from("content-media").uploadToSignedUrl(signed.path, signed.token, audio, { contentType: audio.type });
        if (upload.error) throw new Error("Chưa tải được bản nhạc lên. Thử lại nhé.");
        await mutate(`${base}/${selected}`, { action: "attachMusic", path: signed.path, srt });
      } else await mutate(`${base}/${selected}`, { action: "attachTiming", srt });
      setAudio(null); setSrt(""); toast.success("Đã nhận tệp. Bài sẽ tự làm tiếp."); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Chưa nhận được tệp."); }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success("Đã sao chép."); }
    catch { toast.error("Chưa sao chép được. Bạn có thể chọn và sao chép phần chữ."); }
  }
  if (missing) notFound();
  if (loading) return <PageSkeleton />;
  const run = detail?.run, brief = run?.state.brief;
  return <PageContainer>
    <PageHeader title="Rap đối kháng" description="Thả một cặp nhân vật hoặc kể ý tưởng. Lời rap, sân khấu đông khán giả và cả bài nhạc có hình sẽ được làm cùng nhau." actions={selected ? <Button variant="outline" onClick={() => select(null)}><Plus size={16} /> Bài mới</Button> : undefined} />
    {error && <Alert className="mb-5" action={<Button size="sm" variant="outline" onClick={() => void load()}>Tải lại</Button>}>{error}</Alert>}
    {!selected ? <Card className="p-5 sm:p-6">
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); void start(); }}>
        <Textarea id="battle-idea" label="Ý tưởng của bạn" placeholder="Ví dụ: Lữ Bố đấu Triệu Vân trong một quán rượu Tam Quốc. Cà khịa sắc, cả hai đều có đòn hay, khán giả chọn người thắng." value={idea} maxLength={4000} required onChange={e => { setIdea(e.target.value); requestKey.current = null; }} rows={5} />
        <p className="text-sm th-text-tertiary">Chỉ nhập tên hai nhân vật cũng được. Người dẫn, người chơi nhạc và khán giả đã có sẵn trong cách làm bài.</p>
        <details className="rounded-xl border th-border p-4"><summary className="cursor-pointer text-sm font-medium th-text-secondary">Tuỳ chọn thêm</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {Object.entries(overrideLabels).map(([key, label]) => <Input id={`battle-${key}`} key={key} label={label} placeholder="Để trống để tự chọn" value={overrides[key as keyof typeof overrides]} maxLength={1600} onChange={e => setOverrides(previous => ({ ...previous, [key]: e.target.value }))} />)}
            <Input id="battle-seconds" label="Thời lượng mong muốn (giây)" type="number" min={45} max={180} value={seconds} onChange={e => setSeconds(Number(e.target.value))} />
            <label className="text-sm th-text-secondary">Ngôn ngữ lời<select className="mt-1.5 w-full rounded-xl border th-border th-bg-input p-3" value={language} onChange={e => setLanguage(e.target.value)}><option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option></select></label>
            <label className="text-sm th-text-secondary">Khung hình<select className="mt-1.5 w-full rounded-xl border th-border th-bg-input p-3" value={format} onChange={e => setFormat(e.target.value)}><option value="9:16">Dọc</option><option value="16:9">Ngang</option><option value="1:1">Vuông</option></select></label>
            <label className="text-sm th-text-secondary">Chất lượng cảnh<select className="mt-1.5 w-full rounded-xl border th-border th-bg-input p-3" value={quality} onChange={e => setQuality(e.target.value)}><option value="seedance-2.0-fast">Tiết kiệm · đoạn tối đa 15 giây</option><option value="seedance-2.5">Chất lượng cao · đoạn tối đa 30 giây</option></select></label>
          </div>
        </details>
        {!musicReady && <Alert tone="info">Bạn sẽ nhận được tên bài, lời và chất nhạc để dùng trên Suno. Tải bản nhạc và tệp lời có thời gian lên đây, các cảnh sẽ được làm tiếp.</Alert>}
        <Input id="battle-budget" label="Mức chi tối đa cho bài (điểm)" type="number" min={1} max={100000} value={budget} onChange={e => setBudget(Number(e.target.value))} required />
        <div className="space-y-2"><PriceLine points={{ min: 0, max: budget }} note="Giữ trước mức chi; hoàn phần còn dư khi xong hoặc khi bạn dừng bài." /><Button type="submit" loading={busy} disabled={!idea.trim()}><Mic2 size={16} /> Làm bài rap</Button></div>
      </form>
    </Card> : !run ? <Card className="p-6"><p className="th-text-secondary">Đang tải bài…</p></Card> : <div className="space-y-5">
      <JobStatus state={run.status === "completed" ? "done" : ["failed", "needs_review", "cancelled"].includes(run.status) ? "failed" : "working"} title={run.status === "awaiting_music" ? "Lời đã xong · thêm bản nhạc để làm tiếp" : run.status === "awaiting_lyrics" ? "Thêm lời có thời gian để căn các cảnh" : runLabel(run)} detail={run.error || `Đã dùng ${formatPoints(run.points_used)} trong mức chi ${formatPoints(run.budget_points)}.`} refundedPoints={run.refunded_points} leaveHint={active(run) ? "Bạn có thể rời trang. Bài và tiến độ vẫn được giữ ở đây." : null} />
      <div className="flex flex-wrap gap-2">
        {["failed", "needs_review"].includes(run.status) && <Button loading={busy} onClick={() => void action("resume")}>Làm tiếp phần còn lại</Button>}
        {!["completed", "cancelled"].includes(run.status) && <Button variant="outline" loading={busy} onClick={() => void action("cancel")}>Dừng bài và hoàn phần dư</Button>}
      </div>
      {run.status === "needs_review" && run.error?.includes("mức chi") && <Card className="space-y-3 p-5"><Input id="battle-new-budget" label="Mức chi mới cho cả bài (điểm)" type="number" min={run.budget_points + 1} max={100000} value={newBudget || run.budget_points + 200} onChange={event => setNewBudget(Number(event.target.value))} /><PriceLine points={Math.max(0, (newBudget || run.budget_points + 200) - run.budget_points)} note="Phần giữ thêm để tiếp tục bài đang làm." /><Button loading={busy} onClick={() => void action("increase_budget")}>Tăng mức chi và làm tiếp</Button></Card>}
      {detail.media.output && <Card className="space-y-4 p-4"><video controls preload="metadata" src={detail.media.output.video} className="mx-auto max-h-[70vh] w-full rounded-xl" /><div className="flex flex-wrap gap-2">{Object.entries({ video: "Tải bài nhạc có hình", subtitles: "Tải tệp lời", plan: "Tải toàn bộ nội dung" }).map(([key, text]) => <a key={key} className={buttonClasses("outline", "sm")} href={detail.media.output![key as "video"]} download target="_blank" rel="noreferrer"><Download size={14} />{text}</a>)}</div></Card>}
      {detail.media.audio && <audio className="w-full" controls preload="metadata" src={detail.media.audio} />}
      {brief && <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold th-text-primary">{brief.suno.title}</h2><Button size="sm" variant="outline" onClick={() => saveText("bai-rap-suno.txt", `TITLE\n${brief.suno.title}\n\nLYRICS\n${brief.suno.lyrics}\n\nSTYLE\n${brief.suno.style}`)}><Download size={14} />Tải phần chữ cho Suno</Button></div>
        <p className="text-sm th-text-secondary">{brief.concept}</p>
        {Object.entries({ title: "Tên bài", lyrics: "Lời bài", style: "Chất nhạc" }).map(([key, label]) => <details key={key} open={key === "lyrics"}><summary className="cursor-pointer text-sm font-medium th-text-secondary">{label}</summary><div className="mt-2 space-y-2"><pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl th-bg-tertiary p-3 font-sans text-sm th-text-primary">{brief.suno[key as keyof typeof brief.suno]}</pre><Button variant="ghost" size="sm" onClick={() => void copy(brief.suno[key as keyof typeof brief.suno])}><Copy size={14} />Sao chép</Button></div></details>)}
      </Card>}
      {["awaiting_music", "awaiting_lyrics"].includes(run.status) && <Card className="space-y-4 p-5">
        <h2 className="font-semibold th-text-primary">{run.status === "awaiting_music" ? "Thêm bản nhạc đã chọn" : "Thêm tệp lời có thời gian"}</h2>
        {run.status === "awaiting_music" && <div className="space-y-2"><p className="text-sm th-text-secondary">Bản nhạc · MP3, M4A hoặc WAV dưới 30 MB</p><input ref={audioInput} aria-label="Bản nhạc" type="file" accept="audio/*" hidden onChange={e => setAudio(e.target.files?.[0] || null)} /><Button variant="outline" size="sm" onClick={() => audioInput.current?.click()}>Chọn bản nhạc</Button><p className="truncate text-xs th-text-tertiary">{audio?.name || "Chưa chọn tệp"}</p></div>}
        <div className="space-y-2"><p className="text-sm th-text-secondary">Tệp lời SRT{run.status === "awaiting_music" ? " · có thể thêm sau" : ""}</p><input ref={srtInput} aria-label="Tệp lời SRT" type="file" accept=".srt" hidden onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 150000) { toast.error("Tệp lời quá lớn."); return; } void file.text().then(setSrt); }} /><Button variant="outline" size="sm" onClick={() => srtInput.current?.click()}>Chọn tệp lời</Button><p className="text-xs th-text-tertiary">{srt ? "Đã chọn tệp lời" : "Chưa chọn tệp"}</p></div>
        <p className="text-xs th-text-tertiary">Tệp lời cần khớp bản nhạc thực tế, gồm cả phần người dẫn. Bạn có thể xuất SRT từ công cụ làm phụ đề.</p>
        <Button loading={busy} disabled={run.status === "awaiting_music" ? !audio : !srt} onClick={() => void attach()}>Nhận tệp và làm tiếp</Button>
      </Card>}
      {Object.keys(detail.media.images).length > 0 && <Card className="p-5"><h2 className="mb-3 font-semibold th-text-primary">Sân khấu và bộ ảnh nhân vật</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(detail.media.images).map(([key, url], index) => <a key={key} href={url} target="_blank" rel="noreferrer" className="relative aspect-[4/5] overflow-hidden rounded-xl th-bg-tertiary"><Image src={url} alt={`Ảnh mẫu ${formatNumber(index + 1)}`} fill unoptimized sizes="(max-width: 640px) 45vw, 22vw" className="object-contain" /></a>)}</div></Card>}
      {run.state.storyboard && <details className="rounded-xl border th-border p-5"><summary className="cursor-pointer font-medium th-text-secondary">Các cảnh của bài</summary><ol className="mt-4 space-y-3">{run.state.storyboard.shots.map((shot, index) => <li key={shot.id} className="rounded-xl th-bg-tertiary p-3 text-sm"><p className="font-medium th-text-primary">Cảnh {formatNumber(index + 1)} · {formatNumber(shot.start)}–{formatNumber(shot.end)} giây</p><p className="mt-1 th-text-secondary">{shot.description}</p></li>)}</ol></details>}
    </div>}
    <div className="mt-8 space-y-3"><h2 className="font-semibold th-text-primary">Các bài đã làm</h2>{runs.length ? <div className="grid gap-3 sm:grid-cols-2">{runs.map(item => <Card key={item.id} className="p-4" onClick={() => select(item.id)} ariaLabel={`Mở ${item.state.brief?.suno.title || item.input.idea}`}><p className="truncate font-medium th-text-primary">{item.state.brief?.suno.title || item.input.idea}</p><p className="mt-1 text-xs th-text-tertiary">{formatDateTime(item.created_at)} · {runLabel(item)}</p></Card>)}</div> : <EmptyState icon={Mic2} title="Chưa có trận rap nào" hint="Nhập cặp nhân vật đầu tiên ở trên để bắt đầu." />}</div>
    <OutOfPointsModal open={!!shortage} onClose={() => setShortage(null)} required={shortage?.required || 0} current={shortage?.current || 0} action="Làm bài rap" />
  </PageContainer>;
}
