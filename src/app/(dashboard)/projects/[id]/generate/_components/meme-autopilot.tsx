"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Sparkles, Wand2 } from "lucide-react";
import Button from "@/components/ui/button";
import SharePost from "@/components/content/share-post";

type MemeRunView = {
  id: string;
  source: "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "failed";
  phase: string;
  error: string | null;
  created_at: string;
  memes: {
    id: string;
    image_url: string | null;
    generated_content: { headline?: string; caption?: string; hashtags?: string[] } | null;
  } | null;
};

const PHASE_LABEL: Record<string, string> = {
  queued: "Đang chờ tới lượt",
  copy: "AI đang nghĩ ý tưởng và viết chữ",
  charge: "AI đang chuẩn bị vẽ",
  image: "AI đang vẽ ảnh",
};
const FORMATS = [
  { value: "", label: "Theo kênh" },
  { value: "1:1", label: "Vuông 1:1" },
  { value: "4:5", label: "Dọc 4:5" },
  { value: "9:16", label: "Dọc 9:16" },
  { value: "16:9", label: "Ngang 16:9" },
];

async function call(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không kết nối được. Hãy thử lại.");
  return data;
}

/**
 * Luồng chính của trang Tạo ảnh: một nút để AI làm trọn một meme (nghĩ ý, viết
 * chữ, vẽ, lưu vào thư viện) ở phía server. Lựa chọn khung và số lượng nằm
 * trong mục thu gọn; lịch tự làm meme mỗi ngày nằm ngay dưới.
 */
export function MemeAutopilot({ projectId, workspaceVersion }: { projectId: string; workspaceVersion: number | null }) {
  const base = `/api/projects/${projectId}`;
  const [idea, setIdea] = useState("");
  const [count, setCount] = useState(1);
  const [format, setFormat] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [runs, setRuns] = useState<MemeRunView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState(false);
  const [auto, setAuto] = useState({ enabled: false, memesPerDay: 1, localTime: "09:00" });
  const [savedAuto, setSavedAuto] = useState(auto);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const data = await call(`${base}/meme-runs`);
    setRuns(data.runs || []);
    return (data.runs || []) as MemeRunView[];
  }, [base]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const current = await load();
        const active = current.some((run) => run.status === "queued" || run.status === "running");
        if (!stopped) timer.current = setTimeout(tick, active ? 5000 : 30000);
      } catch {
        if (!stopped) timer.current = setTimeout(tick, 30000);
      }
    };
    tick();
    call(`${base}/meme-automation`)
      .then((data) => {
        setOwner(data.owner === true);
        const next = {
          enabled: data.automation?.enabled === true,
          memesPerDay: Number(data.automation?.memes_per_day || 1),
          localTime: String(data.automation?.local_time || "09:00").slice(0, 5),
        };
        setAuto(next);
        setSavedAuto(next);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [base, load]);

  const written = idea.trim();
  async function start() {
    setBusy(true);
    setError("");
    try {
      await call(`${base}/meme-runs`, {
        workspaceVersion,
        intent: written,
        count,
        options: format ? { format } : {},
        idempotencyKey: crypto.randomUUID(),
      });
      setIdea("");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAuto() {
    setBusy(true);
    setError("");
    try {
      const data = await call(`${base}/meme-automation`, { ...auto, options: format ? { format } : {} }, "PUT");
      const next = {
        enabled: data.automation.enabled === true,
        memesPerDay: Number(data.automation.memes_per_day),
        localTime: String(data.automation.local_time).slice(0, 5),
      };
      setAuto(next);
      setSavedAuto(next);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const autoDirty = JSON.stringify(auto) !== JSON.stringify(savedAuto);
  return (
    <section className="mb-8 flex flex-col gap-5" aria-labelledby="meme-autopilot-title">
      <div className="flex flex-col gap-3 rounded-xl border th-border th-bg-card p-4 sm:p-5">
        <h2 id="meme-autopilot-title" className="flex items-center gap-2 text-lg font-semibold th-text-primary">
          <Sparkles className="h-5 w-5 th-text-accent" aria-hidden /> AI làm meme
        </h2>
        <p className="text-sm th-text-secondary">
          Viết ý tưởng nếu bạn có, hoặc để trống. AI tự nghĩ chuyện hợp với kênh, viết chữ, vẽ ảnh với nhân vật của kênh và lưu vào thư viện.
        </p>
        <textarea
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          rows={3}
          aria-label="Ý tưởng meme (không bắt buộc)"
          placeholder="Ví dụ: Khi sếp nhắn 'em rảnh không' lúc 10 giờ tối."
          className="w-full rounded-lg border th-border th-bg-input px-3 py-2.5 text-sm th-text-primary th-ring-accent focus:outline-none focus:ring-2"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="lg" onClick={start} loading={busy} disabled={Boolean(written) && written.length < 6}>
            <Wand2 className="h-5 w-5" aria-hidden />
            {written ? "Làm meme" : "AI tự nghĩ và làm meme"}
          </Button>
          <span className="text-xs th-text-secondary">
            {count > 1 ? `${count} meme · ` : ""}khoảng 1 phút mỗi meme · có thể rời trang.
          </span>
        </div>
        <div className="rounded-lg border th-border">
          <button
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm th-text-secondary"
          >
            Tự chọn số lượng, khung ảnh
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {advanced && (
            <div className="flex flex-wrap items-center gap-3 border-t th-border px-3 py-3 text-sm th-text-primary">
              <label className="flex items-center gap-2">
                Số meme
                <select value={count} onChange={(event) => setCount(Number(event.target.value))} className="rounded-lg border th-border th-bg-input px-2 py-1.5">
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Khung
                <select value={format} onChange={(event) => setFormat(event.target.value)} className="rounded-lg border th-border th-bg-input px-2 py-1.5">
                  {FORMATS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        {error && <p role="alert" className="text-sm th-text-danger">{error}</p>}
      </div>

      {owner && (
        <div className="flex flex-col gap-3 rounded-xl border th-border th-bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold th-text-primary">Tự làm meme mỗi ngày</h3>
              <p className="mt-1 text-xs th-text-secondary">AI tự nghĩ ý mới mỗi lần, không lặp các meme gần đây. Meme xong nằm trong thư viện để bạn duyệt và đăng.</p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm th-text-primary">
              <input
                type="checkbox"
                checked={auto.enabled}
                onChange={(event) => setAuto({ ...auto, enabled: event.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {auto.enabled ? "Đang bật" : "Tắt"}
            </label>
          </div>
          {auto.enabled && (
            <div className="flex flex-wrap items-center gap-2 text-sm th-text-primary">
              Mỗi ngày
              <select
                value={auto.memesPerDay}
                onChange={(event) => setAuto({ ...auto, memesPerDay: Number(event.target.value) })}
                className="rounded-lg border th-border th-bg-input px-2 py-1.5"
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value} meme</option>
                ))}
              </select>
              bắt đầu lúc
              <input
                type="time"
                value={auto.localTime}
                onChange={(event) => setAuto({ ...auto, localTime: event.target.value })}
                className="rounded-lg border th-border th-bg-input px-2 py-1.5"
              />
            </div>
          )}
          {autoDirty && (
            <Button size="sm" className="w-fit" loading={busy} onClick={saveAuto}>Lưu</Button>
          )}
        </div>
      )}

      {runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium th-text-secondary">Meme gần đây</h3>
            <Link href={`/projects/${projectId}/gallery`} className="text-xs th-text-accent underline">Mở thư viện</Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {runs.map((run) => {
              const meme = run.memes;
              const content = meme?.generated_content || {};
              return (
                <li key={run.id} className="flex flex-col overflow-hidden rounded-lg border th-border th-bg-card">
                  <div className="flex aspect-square items-center justify-center th-bg-tertiary">
                    {run.status === "completed" && meme?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meme.image_url} alt={content.headline || "Meme"} className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-3 text-center text-xs th-text-secondary">
                        {run.status === "failed" ? run.error || "Chưa làm được meme này." : PHASE_LABEL[run.phase] || "AI đang làm"}
                      </span>
                    )}
                  </div>
                  {run.status === "completed" && meme && (
                    <div className="flex flex-col gap-2 p-2.5">
                      <p className="line-clamp-2 text-xs font-medium th-text-primary">{content.headline}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {content.caption && <SharePost caption={content.caption} hashtags={content.hashtags || []} />}
                        {meme.image_url && (
                          <a href={meme.image_url} download className="inline-flex items-center gap-1 text-xs th-text-secondary">
                            <Download className="h-3.5 w-3.5" aria-hidden /> Tải
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {run.source === "scheduled" && (
                    <span className="px-2.5 pb-2 text-[11px] th-text-muted">Tự làm theo lịch</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
