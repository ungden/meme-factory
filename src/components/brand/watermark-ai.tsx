"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles, Eraser, Download } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import PriceLine from "@/components/ui/price-line";
import Textarea from "@/components/ui/textarea";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { useWallet } from "@/contexts/WalletContext";
import { humanizeError } from "@/lib/error-messages";
import { formatPoints } from "@/lib/format";

type Mode = "remove_background" | "generate";
type Quote = { id: string; maxPoints: number };
type Job = { id: string; mode: Mode; status: string; max_points: number; charged_points: number | null; output_url: string | null; error: string | null };
const activeStatuses = ["queued", "processing", "waiting", "saving", "needs_review"];
const statusLabels: Record<string, string> = {
  queued: "Đã nhận",
  processing: "Đang vẽ",
  waiting: "Đang vẽ",
  saving: "Đang lưu ảnh",
  needs_review: "Đang kiểm tra lại",
  completed: "Xong",
  failed: "Chưa làm được",
};

/**
 * Xoá nền một logo có sẵn, hoặc vẽ logo mới từ mô tả. Có tính điểm: xem giá
 * trước, giữ điểm tối đa, trừ theo thực tế và hoàn phần dư.
 */
export default function WatermarkAi({ projectId, ownerId, workspaceVersion, projectName, onApply }: {
  projectId: string; ownerId: string; workspaceVersion: number; projectName: string; onApply: (url: string) => void;
}) {
  // Khoá lưu tạm giữ tên cũ để bản nháp đang dở không mất sau khi cập nhật.
  const storageKey = `watermark-ai:${ownerId}:${projectId}:${workspaceVersion}`;
  const wallet = useWallet();
  const [mode, setMode] = useState<Mode | null>(null);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needPoints, setNeedPoints] = useState(false);
  const [channelPoints, setChannelPoints] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestEpoch = useRef(0);
  const shouldPoll = useRef(false);
  const active = jobs.find(job => activeStatuses.includes(job.status));
  const url = `/api/projects/${projectId}/watermark/ai`;
  const available = channelPoints === null ? null : channelPoints + (wallet.isLoading ? 0 : wallet.points);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved && ["generate", "remove_background"].includes(saved.mode)) {
        setMode(saved.mode); setPrompt(saved.prompt || ""); setQuote(saved.quote || null);
      }
    } catch {}
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (loaded) { try { sessionStorage.setItem(storageKey, JSON.stringify({ mode, prompt, quote })); } catch {} }
  }, [loaded, storageKey, mode, prompt, quote]);
  useEffect(() => {
    if (!file) { setSourcePreview(null); return; }
    const objectUrl = URL.createObjectURL(file); setSourcePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const refreshPoints = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/wallet`, { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (typeof result?.points === "number") setChannelPoints(result.points);
  }, [projectId]);
  useEffect(() => { void refreshPoints(); }, [refreshPoints]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(url, { signal, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Chưa xem được tiến độ. Tải lại trang nhé.");
    setJobs(result.jobs);
    shouldPoll.current = result.jobs.some((job: Job) => ["queued", "processing", "saving"].includes(job.status));
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    const epoch = requestEpoch.current;
    let pending = false;
    const read = async () => {
      if (pending || document.hidden || !navigator.onLine) return;
      pending = true;
      try { await refresh(controller.signal); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Chưa xem được tiến độ. Tải lại trang nhé."); }
      finally { pending = false; }
    };
    void read();
    const timer = setInterval(() => { if (shouldPoll.current) void read(); }, 5000);
    document.addEventListener("visibilitychange", read); window.addEventListener("online", read);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", read); window.removeEventListener("online", read); requestEpoch.current = epoch + 1; };
  }, [refresh]);

  const changeMode = (value: Mode) => { setMode(value); setQuote(null); setError(""); if (!prompt) setPrompt(`Logo ${projectName}, chữ rõ, gọn, dễ nhận ra.`); };
  const fail = (result: { error?: string; code?: string } | null, fallback: string) => {
    if (result?.code === "INSUFFICIENT_POINTS") { setNeedPoints(true); return; }
    setError(result?.error || fallback);
  };
  const getQuote = async () => {
    if (inFlight.current || !mode) return;
    if (mode === "remove_background" && !file) { setError("Chọn ảnh logo cần xoá nền nhé."); return; }
    inFlight.current = true; setBusy(true); setError("");
    const epoch = requestEpoch.current;
    try {
      const body = new FormData(); body.append("mode", mode); body.append("prompt", prompt); body.append("workspaceVersion", String(workspaceVersion));
      if (file && mode === "remove_background") body.append("file", file);
      const response = await fetch(url, { method: "POST", body });
      const result = await response.json();
      if (epoch !== requestEpoch.current) return;
      if (!response.ok) fail(result, "Chưa xem được giá. Bạn thử lại nhé.");
      else setQuote(result);
    } catch { if (epoch === requestEpoch.current) setError("Mất kết nối. Bạn thử lại nhé."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const run = async () => {
    if (inFlight.current || !quote) return;
    inFlight.current = true; setBusy(true); setError("");
    const epoch = requestEpoch.current;
    try {
      const response = await fetch(`${url}/${quote.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceVersion }) });
      const result = await response.json();
      if (epoch !== requestEpoch.current) return;
      if (!response.ok) fail(result, "Chưa nhận được xác nhận. Bấm lại sẽ kiểm tra đúng lần này, không trừ hai lần.");
      else { await refresh(); setQuote(null); void refreshPoints(); }
    } catch { if (epoch === requestEpoch.current) setError("Mất kết nối. Bấm lại để kiểm tra đúng lần này, không trừ hai lần."); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <div className="space-y-3 border-t th-border-secondary pt-4">
    <p className="text-sm font-medium th-text-primary">Chưa có logo nền trong suốt?</p>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cách làm logo">
      <Chip role="radio" selected={mode === "remove_background"} disabled={busy || Boolean(active)} onClick={() => changeMode("remove_background")}><Eraser size={14} /> Xoá nền logo có sẵn</Chip>
      <Chip role="radio" selected={mode === "generate"} disabled={busy || Boolean(active)} onClick={() => changeMode("generate")}><Sparkles size={14} /> Vẽ logo mới</Chip>
    </div>
    <p className="text-xs th-text-secondary">Có tính điểm. Xem giá trước khi làm, xem ảnh trước khi dùng.</p>
    {mode && !active && <div className="space-y-3 rounded-xl border th-border-secondary p-3">
      {mode === "remove_background" ? <>
        <label className="block text-sm th-text-primary">Ảnh logo cần xoá nền
          <input className="mt-2 block w-full min-w-0 text-xs th-text-secondary" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
            const selected = event.target.files?.[0]; setQuote(null); setError("");
            if (selected && selected.size > 3 * 1024 * 1024) { setError("Ảnh tối đa 3 MB."); event.target.value = ""; setFile(null); return; }
            setFile(selected || null);
          }} />
        </label>
        {sourcePreview && <Image src={sourcePreview} width={240} height={100} className="max-h-28 w-auto object-contain" alt="Logo gốc" unoptimized />}
        <p className="text-xs th-text-secondary">Nhận JPG, PNG, WebP có nền, tối đa 3 MB. Chi tiết nhỏ có thể bị đổi, nên xem kỹ chữ và hình ở kết quả nhé.</p>
      </> : <Textarea id="logo-prompt" label="Mô tả logo" value={prompt} maxLength={1500} rows={3} disabled={busy} onChange={event => { setPrompt(event.target.value); setQuote(null); }} placeholder="Tên kênh, màu sắc, biểu tượng và phong cách…" />}
      {quote ? <>
        <PriceLine points={quote.maxPoints} available={available} note="tối đa · trừ theo thực tế, phần dư được hoàn · giá giữ 15 phút" />
        <Button className="w-full" loading={busy} onClick={run}>Đồng ý và {mode === "remove_background" ? "xoá nền" : "vẽ logo"}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setQuote(null)}>Xem giá lại</Button>
      </> : <Button size="sm" variant="secondary" loading={busy} onClick={getQuote}>Xem giá</Button>}
    </div>}
    {error && <Alert>{error}</Alert>}
    <div aria-live="polite" className="space-y-3">
      {jobs.map(job => <div key={job.id} className="space-y-2 rounded-xl border th-border-secondary p-3">
        <p className="text-xs font-medium th-text-primary">{job.mode === "generate" ? "Logo mới" : "Xoá nền logo"} · {statusLabels[job.status] || "Đang làm"}
          {job.charged_points !== null ? ` · ${formatPoints(job.charged_points)}` : ` · đang giữ ${formatPoints(job.max_points)}`}</p>
        {job.error && <p className="text-xs th-text-secondary">{humanizeError(job.error)}</p>}
        {job.output_url && <>
          {/* Hai nền tương phản để thấy logo có thật sự trong suốt không. */}
          <div className="grid grid-cols-2 gap-2">
            {["th-bg-card border th-border", "th-bg-overlay"].map(background => <div key={background} className={`rounded-lg p-2 ${background}`}><Image src={job.output_url!} alt="Logo trên nền sáng và tối" width={300} height={200} className="aspect-[3/2] w-full object-contain" unoptimized /></div>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { onApply(job.output_url!); setApplied(job.id); }}>Dùng logo này</Button>
            <a className={buttonClasses("ghost", "sm")} href={job.output_url} target="_blank" rel="noreferrer" download><Download size={14} /> Tải ảnh</a>
          </div>
          {applied === job.id && <p className="text-xs th-text-secondary">Đã chọn. Bấm Lưu ở cuối trang để dùng cho bài sau nhé.</p>}
        </>}
      </div>)}
    </div>
    <OutOfPointsModal
      open={needPoints}
      onClose={() => setNeedPoints(false)}
      required={quote?.maxPoints ?? 1}
      current={available ?? 0}
      action={mode === "generate" ? "Vẽ logo" : "Xoá nền logo"}
      onFunded={() => { setNeedPoints(false); void wallet.refreshBalance(); void refreshPoints(); }}
    />
  </div>;
}
