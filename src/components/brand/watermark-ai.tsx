"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, Eraser } from "lucide-react";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";

type Mode = "remove_background" | "generate";
type Quote = { id: string; maxPoints: number };
type Job = { id: string; mode: Mode; status: string; max_points: number; charged_points: number | null; output_url: string | null; error: string | null };
const activeStatuses = ["queued", "processing", "waiting", "saving", "needs_review"];
const statusLabels: Record<string, string> = { queued: "Đã nhận", processing: "Đang gửi AI", waiting: "AI đang tạo ảnh", saving: "Đang lưu ảnh", needs_review: "Cần đối soát", completed: "Hoàn tất", failed: "Chưa tạo được" };

export default function WatermarkAi({ projectId, ownerId, workspaceVersion, projectName, onApply }: {
  projectId: string; ownerId: string; workspaceVersion: number; projectName: string; onApply: (url: string) => void;
}) {
  const storageKey = `watermark-ai:${ownerId}:${projectId}:${workspaceVersion}`;
  const [mode, setMode] = useState<Mode | null>(null);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestEpoch = useRef(0);
  const shouldPoll = useRef(false);
  const active = jobs.find(job => activeStatuses.includes(job.status));
  const url = `/api/projects/${projectId}/watermark/ai`;

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

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(url, { signal, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Chưa tải được tiến trình.");
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
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Chưa tải được tiến trình."); }
      finally { pending = false; }
    };
    void read();
    const timer = setInterval(() => { if (shouldPoll.current) void read(); }, 5000);
    document.addEventListener("visibilitychange", read); window.addEventListener("online", read);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", read); window.removeEventListener("online", read); requestEpoch.current = epoch + 1; };
  }, [refresh]);

  const changeMode = (value: Mode) => { setMode(value); setQuote(null); setError(""); if (!prompt) setPrompt(`Watermark ${projectName}, chữ rõ, gọn, dễ nhận diện.`); };
  const getQuote = async () => {
    if (inFlight.current || !mode) return;
    if (mode === "remove_background" && !file) { setError("Chọn ảnh logo cần xóa nền."); return; }
    inFlight.current = true; setBusy(true); setError("");
    const epoch = requestEpoch.current;
    try {
      const body = new FormData(); body.append("mode", mode); body.append("prompt", prompt); body.append("workspaceVersion", String(workspaceVersion));
      if (file && mode === "remove_background") body.append("file", file);
      const response = await fetch(url, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chưa lấy được giá.");
      if (epoch === requestEpoch.current) setQuote(result);
    } catch (e) { if (epoch === requestEpoch.current) setError(e instanceof Error ? e.message : "Chưa lấy được giá."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const run = async () => {
    if (inFlight.current || !quote) return;
    inFlight.current = true; setBusy(true); setError("");
    const epoch = requestEpoch.current;
    try {
      const response = await fetch(`${url}/${quote.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceVersion }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chưa nhận được xác nhận. Bấm lại sẽ kiểm tra cùng lượt này.");
      if (epoch === requestEpoch.current) { await refresh(); setQuote(null); }
    } catch (e) { if (epoch === requestEpoch.current) setError(e instanceof Error ? e.message : "Mất kết nối. Bấm lại để kiểm tra cùng lượt, không tạo trùng."); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <div className="space-y-3 border-t th-border-secondary pt-4">
    <p className="text-sm font-medium th-text-primary">Chưa có logo trong suốt?</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={busy || Boolean(active)} onClick={() => changeMode("remove_background")}><Eraser size={14} /> AI xóa nền</Button>
      <Button size="sm" variant="secondary" disabled={busy || Boolean(active)} onClick={() => changeMode("generate")}><Sparkles size={14} /> AI tạo watermark mới</Button>
    </div>
    <p className="text-xs th-text-secondary">Dùng ChatGPT Image, có thu điểm. Xem giá trước khi chạy; xem ảnh trước khi áp dụng.</p>
    {mode && !active && <div className="space-y-3 rounded-lg border th-border-secondary p-3">
      {mode === "remove_background" ? <>
        <label className="block text-sm th-text-primary">Logo cần xóa nền
          <input className="mt-2 block w-full min-w-0 text-xs" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
            const selected = event.target.files?.[0]; setQuote(null); setError("");
            if (selected && selected.size > 3 * 1024 * 1024) { setError("Ảnh tối đa 3 MB."); event.target.value = ""; setFile(null); return; }
            setFile(selected || null);
          }} />
        </label>
        {sourcePreview && <Image src={sourcePreview} width={240} height={100} className="max-h-28 w-auto object-contain" alt="Logo nguồn" unoptimized />}
        <p className="text-xs th-text-secondary">Nhận JPG, PNG, WebP có nền, tối đa 3 MB. AI có thể thay đổi chi tiết nhỏ; hãy kiểm tra chữ và logo ở kết quả.</p>
      </> : <Textarea label="Mô tả watermark" value={prompt} maxLength={1500} rows={3} disabled={busy} onChange={event => { setPrompt(event.target.value); setQuote(null); }} placeholder="Tên thương hiệu, màu sắc, biểu tượng và phong cách…" />}
      {quote ? <>
        <p className="text-xs th-text-secondary">Giữ tối đa {quote.maxPoints} điểm. Tính phí theo chi phí AI +30%, làm tròn theo điểm; hoàn phần giữ dư. Báo giá có hiệu lực 15 phút.</p>
        <Button className="w-full" loading={busy} onClick={run}>{mode === "remove_background" ? "Xóa nền" : "Tạo watermark"} · tối đa {quote.maxPoints} điểm</Button>
        <button className="text-xs th-text-secondary underline" disabled={busy} onClick={() => setQuote(null)}>Lấy báo giá mới</button>
      </> : <Button size="sm" variant="secondary" loading={busy} onClick={getQuote}>Xem giá điểm</Button>}
    </div>}
    {error && <div role="alert" className="text-sm text-red-600"><p>{error}</p><Link href={`/projects/${projectId}/wallet`} className="underline">Điểm dự án</Link></div>}
    <div aria-live="polite" className="space-y-3">
      {jobs.map(job => <div key={job.id} className="space-y-2 rounded-lg border th-border-secondary p-3">
        <p className="text-xs font-medium th-text-primary">{job.mode === "generate" ? "Watermark mới" : "Xóa nền logo"} · {statusLabels[job.status] || job.status}
          {job.charged_points !== null ? ` · ${job.charged_points} điểm` : ` · đang giữ ${job.max_points} điểm`}</p>
        {job.error && <p className="text-xs th-text-secondary">{job.error}</p>}
        {job.output_url && <>
          <div className="grid grid-cols-2 gap-2">
            {["bg-white", "bg-slate-800"].map(background => <div key={background} className={`rounded p-2 ${background}`}><Image src={job.output_url!} alt="Watermark AI trên nền sáng và tối" width={300} height={200} className="aspect-[3/2] w-full object-contain" unoptimized /></div>)}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => { onApply(job.output_url!); setApplied(job.id); }}>Dùng watermark này</Button>
            <a className="text-xs th-text-secondary underline" href={job.output_url} target="_blank" rel="noreferrer">Mở PNG</a>
          </div>
          {applied === job.id && <p className="text-xs th-text-secondary">Đã chọn. Bấm Lưu cài đặt để áp dụng cho các nội dung tiếp theo.</p>}
        </>}
      </div>)}
    </div>
  </div>;
}
