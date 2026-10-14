"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Clapperboard, Download, Images, Repeat2, Wand2 } from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import Alert from "@/components/ui/alert";
import Select from "@/components/ui/select";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import PriceLine from "@/components/ui/price-line";
import JobStatus from "@/components/ui/job-status";
import EmptyState from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/page";
import SharePost from "@/components/content/share-post";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { POINT_COSTS } from "@/lib/point-pricing";
import {
  memeRunPhaseLabel,
  memeRunShortfall,
  quickMemeCost,
  recentFailedRuns,
  similarMemeDraft,
  type MemeRunCard,
} from "@/lib/meme-run-view";

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
  if (!response.ok) throw new Error(data.error || "Không kết nối được. Bạn thử lại nhé.");
  return data;
}

type Draft = { intent: string; count: number; format: string };

/**
 * Luồng chính của trang Meme: một nút để AIDA làm trọn một meme (nghĩ ý, viết
 * chữ, vẽ, lưu vào thư viện) ở máy chủ. Tuỳ chọn nằm trong mục thu gọn; lịch
 * tự làm mỗi ngày nằm ngay dưới.
 */
export function MemeAutopilot({
  projectId,
  workspaceVersion,
  availablePoints,
  onPointsChanged,
}: {
  projectId: string;
  workspaceVersion: number | null;
  /** Điểm kênh còn, để dòng giá báo trước khi thiếu. */
  availablePoints: number | null;
  onPointsChanged?: () => void;
}) {
  const base = `/api/projects/${projectId}`;
  const [idea, setIdea] = useState("");
  const [count, setCount] = useState(1);
  const [format, setFormat] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [runs, setRuns] = useState<MemeRunCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState(false);
  const [auto, setAuto] = useState({ enabled: false, memesPerDay: 1, localTime: "09:00" });
  const [savedAuto, setSavedAuto] = useState(auto);
  const [savingAuto, setSavingAuto] = useState(false);
  // Lượt bấm ở lần mở trang này: hỏng vì hết điểm thì mở ngay hộp nạp, còn lượt
  // cũ hỏng từ hôm trước chỉ hiện nút để người dùng tự mở.
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [shortfall, setShortfall] = useState<{ run: MemeRunCard; required: number; current: number } | null>(null);
  const promptedRef = useRef<Set<string>>(new Set());
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unit = POINT_COSTS.meme;
  // Giữ trong ref: hàm cha đổi mỗi lần render thì vòng hỏi trạng thái không khởi động lại.
  const pointsChangedRef = useRef(onPointsChanged);
  useEffect(() => {
    pointsChangedRef.current = onPointsChanged;
  }, [onPointsChanged]);

  const load = useCallback(async () => {
    const data = await call(`${base}/meme-runs`);
    const next = (data.runs || []) as MemeRunCard[];
    setRuns(next);
    return next;
  }, [base]);

  useEffect(() => {
    let stopped = false;
    let wasActive = false;
    const tick = async () => {
      try {
        const current = await load();
        const active = current.some((run) => run.status === "queued" || run.status === "running");
        // Một lượt vừa xong là điểm kênh vừa đổi.
        if (wasActive && !active) pointsChangedRef.current?.();
        wasActive = active;
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

  // Lượt vừa bấm hỏng vì hết điểm: mở hộp nạp một lần, nạp xong làm lại đúng lượt đó.
  useEffect(() => {
    if (!runs) return;
    const run = runs.find((item) => item.status === "failed" && startedIds.has(item.id) && !promptedRef.current.has(item.id));
    if (!run) return;
    promptedRef.current.add(run.id);
    const lack = memeRunShortfall(run.error);
    if (lack) setShortfall({ run, required: lack.required ?? unit, current: lack.current ?? availablePoints ?? 0 });
  }, [runs, startedIds, unit, availablePoints]);

  const start = useCallback(
    async (draft: Draft) => {
      setBusy(true);
      setError("");
      try {
        const data = await call(`${base}/meme-runs`, {
          workspaceVersion,
          intent: draft.intent,
          count: draft.count,
          options: draft.format ? { format: draft.format } : {},
          idempotencyKey: crypto.randomUUID(),
        });
        const ids = Array.isArray(data.runIds) ? (data.runIds as string[]) : [];
        setStartedIds((current) => new Set([...current, ...ids]));
        await load();
        return true;
      } catch (cause) {
        setError((cause as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [base, workspaceVersion, load],
  );

  async function startFromForm() {
    if (await start({ intent: idea.trim(), count, format })) setIdea("");
  }

  async function retry(run: MemeRunCard) {
    setRetried((current) => new Set([...current, run.id]));
    await start({ intent: run.intent || "", count: 1, format: run.options?.format || "" });
  }

  function makeSimilar(run: MemeRunCard) {
    const draft = similarMemeDraft(run);
    setIdea(draft.idea);
    setFormat(draft.format);
    setCount(1);
    if (draft.format) setAdvanced(true);
    ideaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ideaRef.current?.focus({ preventScroll: true });
  }

  async function saveAuto() {
    setSavingAuto(true);
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
      setSavingAuto(false);
    }
  }

  const written = idea.trim();
  const autoDirty = JSON.stringify(auto) !== JSON.stringify(savedAuto);
  const working = (runs || []).filter((run) => run.status === "queued" || run.status === "running");
  const failed = recentFailedRuns(runs || [], retried);
  const done = (runs || []).filter((run) => run.status === "completed" && run.memes?.image_url);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="meme-autopilot-title">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 id="meme-autopilot-title" className="text-lg font-semibold th-text-primary">
          Làm meme
        </h2>
        <Textarea
          ref={ideaRef}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          rows={3}
          aria-label="Ý tưởng meme (không bắt buộc)"
          placeholder="Ví dụ: Khi sếp nhắn “em rảnh không” lúc 10 giờ tối. Để trống thì AIDA tự nghĩ."
          className="min-h-0 text-base"
        />
        <PriceLine
          points={quickMemeCost(unit, count)}
          available={availablePoints}
          note={`${count > 1 ? `${count} meme · ` : ""}khoảng 1 phút mỗi meme`}
        />
        <Button
          size="lg"
          className="w-full sm:w-fit"
          onClick={startFromForm}
          loading={busy}
          disabled={Boolean(written) && written.length < 6}
        >
          <Wand2 size={18} aria-hidden />
          Làm meme
        </Button>
        <div className="rounded-xl border th-border">
          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
            className="flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm th-text-secondary th-bg-hover"
          >
            Tuỳ chọn thêm
            <ChevronDown size={16} className={`shrink-0 transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {advanced && (
            <div className="space-y-3 border-t px-3 py-3 th-border">
              <div>
                <p className="mb-1.5 text-xs font-medium th-text-secondary">Khung</p>
                <div role="radiogroup" aria-label="Khung" className="flex flex-wrap gap-1.5">
                  {FORMATS.map((item) => (
                    <Chip key={item.value} role="radio" selected={format === item.value} onClick={() => setFormat(item.value)}>
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium th-text-secondary">Số meme</p>
                <div role="radiogroup" aria-label="Số meme" className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4].map((value) => (
                    <Chip key={value} role="radio" selected={count === value} onClick={() => setCount(value)}>
                      {value}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
      </Card>

      {owner && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold th-text-primary">Tự làm meme mỗi ngày</h3>
              <p className="mt-1 text-xs th-text-secondary">Mỗi ngày nghĩ ý mới, không lặp meme gần đây. Meme xong nằm trong Thư viện.</p>
            </div>
            <label className="flex min-h-9 shrink-0 cursor-pointer items-center gap-2 text-sm th-text-primary">
              <input
                type="checkbox"
                checked={auto.enabled}
                onChange={(event) => setAuto({ ...auto, enabled: event.target.checked })}
                className="h-4 w-4 th-accent-control"
              />
              {auto.enabled ? "Đang bật" : "Tắt"}
            </label>
          </div>
          {auto.enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                id="meme-auto-per-day"
                label="Mỗi ngày"
                value={auto.memesPerDay}
                onChange={(event) => setAuto({ ...auto, memesPerDay: Number(event.target.value) })}
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value} meme
                  </option>
                ))}
              </Select>
              <Input
                id="meme-auto-time"
                label="Bắt đầu lúc"
                type="time"
                value={auto.localTime}
                onChange={(event) => setAuto({ ...auto, localTime: event.target.value })}
              />
            </div>
          )}
          {auto.enabled && (
            <PriceLine points={quickMemeCost(unit, 1) * auto.memesPerDay} available={availablePoints} note="mỗi ngày" />
          )}
          {autoDirty && (
            <Button size="sm" className="w-fit" loading={savingAuto} onClick={saveAuto}>
              Lưu
            </Button>
          )}
        </Card>
      )}

      {(working.length > 0 || failed.length > 0) && (
        <div className="flex flex-col gap-2">
          {working.map((run) => (
            <JobStatus
              key={run.id}
              state="working"
              title={memeRunPhaseLabel(run.phase)}
              detail={run.intent ? `“${run.intent.slice(0, 120)}”` : run.source === "scheduled" ? "Meme theo lịch" : "AIDA tự nghĩ ý"}
            />
          ))}
          {failed.map((run) => {
            const lack = memeRunShortfall(run.error);
            return (
              <JobStatus
                key={run.id}
                state="failed"
                title={lack ? "Chưa làm được: kênh không đủ điểm" : "Chưa làm được meme này"}
                detail={lack ? undefined : run.error || undefined}
                refundedPoints={run.refunded_points ?? undefined}
                onRetry={lack ? undefined : () => void retry(run)}
              >
                {lack && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setShortfall({ run, required: lack.required ?? unit, current: lack.current ?? availablePoints ?? 0 })
                    }
                  >
                    Nạp điểm rồi làm tiếp
                  </Button>
                )}
              </JobStatus>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium th-text-secondary">Gần đây</h3>
          <Link href={`/projects/${projectId}/gallery`} className="text-xs font-medium th-text-accent hover:underline">
            Mở Thư viện
          </Link>
        </div>
        {runs === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="aspect-square" />
            ))}
          </div>
        ) : done.length === 0 ? (
          <EmptyState icon={Images} title="Chưa có meme nào" hint="Meme làm xong sẽ hiện ở đây và nằm sẵn trong Thư viện." />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {done.map((run) => {
              const meme = run.memes!;
              const content = meme.generated_content || {};
              return (
                <li key={run.id} className="flex flex-col overflow-hidden rounded-2xl border th-border th-bg-card">
                  <div className="relative aspect-square th-bg-tertiary">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh meme nằm ở kho lưu trữ, không qua tối ưu ảnh của Next */}
                    <img src={meme.image_url!} alt={content.headline || "Meme"} loading="lazy" className="h-full w-full object-cover" />
                    {run.source === "scheduled" && (
                      <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs th-bg-card th-text-secondary">Theo lịch</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2.5">
                    {content.headline && <p className="line-clamp-2 text-xs font-medium th-text-primary">{content.headline}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                      {content.caption && <SharePost caption={content.caption} hashtags={content.hashtags || []} />}
                      <a
                        href={meme.image_url!}
                        download
                        className="inline-flex min-h-8 items-center gap-1 text-xs th-text-secondary hover:th-text-primary"
                      >
                        <Download size={14} aria-hidden /> Tải ảnh
                      </a>
                    </div>
                    <div className="flex flex-col gap-1 border-t pt-2 th-border">
                      <button
                        type="button"
                        onClick={() => makeSimilar(run)}
                        className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium th-text-accent hover:underline"
                      >
                        <Repeat2 size={14} aria-hidden /> Làm bài tương tự
                      </button>
                      <Link
                        href={`/projects/${projectId}/video?from=${encodeURIComponent(meme.id)}`}
                        className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium th-text-secondary hover:th-text-primary"
                      >
                        <Clapperboard size={14} aria-hidden /> Làm video từ ảnh này
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {done.length > 0 && (
          <Link href={`/projects/${projectId}/gallery`} className={buttonClasses("ghost", "sm", "w-fit self-center")}>
            Xem tất cả trong Thư viện
          </Link>
        )}
      </div>

      <OutOfPointsModal
        open={Boolean(shortfall)}
        onClose={() => setShortfall(null)}
        required={shortfall?.required ?? unit}
        current={shortfall?.current ?? 0}
        action="Làm meme"
        onFunded={() => {
          const run = shortfall?.run;
          setShortfall(null);
          onPointsChanged?.();
          if (run) void retry(run);
        }}
      />
    </section>
  );
}
