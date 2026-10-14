"use client";

import Image from "next/image";
import Link from "next/link";
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import ConfirmModal from "@/components/ui/confirm-modal";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import JobStatus from "@/components/ui/job-status";
import { PageContainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import PriceLine from "@/components/ui/price-line";
import PromptModal from "@/components/ui/prompt-modal";
import Select from "@/components/ui/select";
import Textarea from "@/components/ui/textarea";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { useWallet } from "@/contexts/WalletContext";
import { formatDate, formatPoints } from "@/lib/format";
import { QUALITY_OPTIONS, readableFailure } from "../../short-films/_lib/studio";
import { FilmStoryboardEditor } from "@/components/film-storyboard-editor";
import { FilmSegmentEditor } from "@/components/film-segment-editor";
import { storyboardDialogue } from "@/lib/film-storyboard";
import { voicesLocked } from "@/lib/channel-behaviour";
import { compileStoryboards } from "@/lib/family-ai-contract";
import type {
  FilmSegmentPatch,
  FilmSegmentRevision,
} from "@/lib/short-film/segment-contracts";
import type { ChannelProfile } from "@/lib/family-catalogue";
import { notifyProjectBalanceChanged } from "@/lib/client-fetch";
import { humanizeError } from "@/lib/error-messages";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clapperboard,
  Download,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCharacters } from "@/lib/use-store";
import {
  GEMINI_TTS_MODELS,
  GEMINI_VOICE_PRESETS,
  currentSceneTask,
  referencePackReady,
  speechTasks,
  finalClipKind,
  type FilmKind,
  type FilmPlan,
  type FilmScene,
  type FilmTask,
} from "@/lib/short-film/contracts";
import {
  SEEDANCE_VARIANTS,
  seedanceReferenceModel,
  seedanceMaxDuration,
} from "@/lib/video-models";
import {
  api,
  blank,
  episodeHasHistory,
  episodePickerClasses,
  episodePickerLabels,
  episodePickerStatus,
  fromPlan,
  editableAudioMode,
  labels,
  sceneBlank,
  type Draft,
  type DraftGuest,
  type EpisodePickerStatus,
  type DraftScene,
  type ProductionRun,
  type Quote,
} from "./_lib/draft";


/** Mức chi mặc định theo chất lượng, cùng bảng với Studio phim. */
function qualityFor(model: string) {
  return QUALITY_OPTIONS.find((option) => option.model === model) || QUALITY_OPTIONS[0];
}

/**
 * Chỉnh tay một tập phim: sửa lời, từng cảnh, giọng nhân vật, rồi làm phim từ
 * bản đã sửa. Theo dõi tiến độ, lịch tự làm và quyết định giữa chừng nằm ở
 * Studio phim; trang này không có lịch riêng nữa.
 */
export default function ShortFilmPage() {
  const { id: ref } = useParams<{ id: string }>();
  const router = useRouter();
  const wallet = useWallet();
  const { characters } = useCharacters(ref);
  const base = `/api/projects/${ref}`;
  const [draft, setDraft] = useState<Draft>(blank);
  const [plan, setPlan] = useState<FilmPlan | null>(null);
  const [conflict, setConflict] = useState<Draft | null>(null);
  const [channel, setChannel] = useState<ChannelProfile | null>(null);
  const [plans, setPlans] = useState<FilmPlan[]>([]);
  const [ideas, setIdeas] = useState<{ title: string; idea: string }[]>([]);
  const [tasks, setTasks] = useState<FilmTask[]>([]);
  const [segments, setSegments] = useState<FilmSegmentRevision[]>([]);
  const [voiceTasks, setVoiceTasks] = useState<FilmTask[]>([]);
  const [voices, setVoices] = useState<
    { character_id: string; voice_id: string; approved_at: string | null }[]
  >([]);
  const [cast, setCast] = useState<string[]>([]),
    [selected, setSelected] = useState(0),
    [tab, setTab] = useState<"settings" | "results">("settings");
  const [workspace, setWorkspace] = useState(0),
    [storageKey, setStorageKey] = useState("");
  const [enabled, setEnabled] = useState(false),
    [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const [assistId, setAssistId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [voiceQuote, setVoiceQuote] = useState<Quote | null>(null);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [openingPlanId, setOpeningPlanId] = useState<string | null>(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  // Hộp xác nhận theo chủ đề thay cho window.confirm, vốn hiện tên miền như
  // một cảnh báo bảo mật và không dịch được nút.
  const [removePlanOpen, setRemovePlanOpen] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<FilmTask | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | EpisodePickerStatus>("all");
  const [nextPlansOffset, setNextPlansOffset] = useState<number | null>(null);
  // null = theo chất lượng đang chọn (cùng mức mặc định với Studio phim).
  const [limit, setLimit] = useState<number | null>(null);
  const [channelPoints, setChannelPoints] = useState<number | null>(null);
  const [pointsNeeded, setPointsNeeded] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false),
    edited = useRef(false),
    generation = useRef(0);
  // Cờ nằm trong hồ sơ kênh, không phải tên kênh: đổi tên kênh không được
  // làm đổi hành vi, và khách khác cũng bật được cái này.
  const familyVoicesLocked = voicesLocked(channel);
  const requestKeys = useRef<Record<string, string>>({});
  const nativeAllowed = useRef(false);
  const change = (patch: Partial<Draft>) => {
    edited.current = true;
    setDirty(true);
    setQuote(null);
    setDraft((d) => ({ ...d, ...patch, audioMode: editableAudioMode(patch.audioMode || d.audioMode, nativeAllowed.current) }));
  };
  const visiblePlans = plans.filter((candidate) => {
    const state = episodePickerStatus(candidate);
    const query = planQuery.trim().toLocaleLowerCase("vi");
    const matchesQuery =
      !query ||
      `${candidate.title} ${candidate.brief}`.toLocaleLowerCase("vi").includes(query);
    return (planFilter === "all" || state === planFilter) && matchesQuery;
  });
  useEffect(() => {
    if (!planPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlanPickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [planPickerOpen]);
  const editScene = (patch: Partial<DraftScene>) =>
    change({
      scenes: draft.scenes.map((s, i) =>
        i === selected ? { ...s, ...patch } : s,
      ),
    });
  const refresh = useCallback(async () => {
    if (!plan) return;
    const g = generation.current;
    const [j, segmentResult] = await Promise.all([
      api(`${base}/video-plans/${plan.id}`),
      api(`${base}/video-plans/${plan.id}/segments`),
    ]);
    if (g !== generation.current) return;
    setTasks(j.tasks || []);
    setSegments(segmentResult.segments || []);
  }, [base, plan]);
  const refreshVoices = useCallback(async () => {
    const g = generation.current;
    const j = await api(`${base}/voices`);
    if (g !== generation.current) return;
    setVoices(j.voices || []);
    setVoiceTasks(j.tasks || []);
  }, [base]);
  const refreshProduction = useCallback(async () => {
    const [runs, points] = await Promise.all([
      api(`${base}/production-runs`),
      api(`${base}/wallet`).catch(() => null),
    ]);
    setProductionRuns(runs.runs || []);
    if (typeof points?.points === "number") setChannelPoints(points.points);
  }, [base]);
  useEffect(() => {
    const g = ++generation.current;
    edited.current = false;
    setReady(false);
    setConflict(null);
    setTasks([]);
    setSegments([]);
    setVoiceTasks([]);
    setVoices([]);
    setVoiceQuote(null);
    setAssistId(null);
    setCast([]);
    setDraft(blank());
    setDirty(false);
    setNote("");
    setPlan(null);
    setOpeningPlanId(null);
    setQuote(null);
    setError("");
    api(`${base}/video-plans`)
      .then((j) => {
        if (g !== generation.current) return;
        setPlans(j.plans || []);
        setNextPlansOffset(j.nextOffset ?? null);
        setChannel(j.channelProfile);
        const savedId = (() => {
          try {
            return JSON.parse(
              localStorage.getItem(
                `aida:film:${j.accountId}:${ref}:${j.workspaceVersion}`,
              ) || "{}",
            ).planId;
          } catch {
            return undefined;
          }
        })();
        // Màn "Tạo phim" mở đúng tập qua ?plan=; không có thì giữ tập đang mở gần nhất.
        const wanted = new URLSearchParams(window.location.search).get("plan");
        const p = (
          (wanted && j.plans?.find((p: FilmPlan) => p.id === wanted)) ||
          (savedId === null
            ? undefined
            : j.plans?.find((p: FilmPlan) => p.id === savedId) || j.plans?.[0])
        ) as FilmPlan | undefined;
        const key = `aida:film:${j.accountId}:${ref}:${j.workspaceVersion}`;
        setStorageKey(key);
        setWorkspace(j.workspaceVersion);
        setEnabled(j.fixedVoiceEnabled);
        nativeAllowed.current = j.nativeVoice === true;
        if (j.latestAssist?.status !== "failed")
          setAssistId(j.latestAssist?.id || null);
        let initial = p
          ? fromPlan(p, nativeAllowed.current)
          : { ...blank(), targetDurationSeconds: j.channelProfile ? 35 : 30 };
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const saved = JSON.parse(raw);
            if (
              saved.planId === (p?.id || null) &&
              saved.version === (p?.version || null)
            ) {
              initial = {
                ...saved.draft,
                videoModel: seedanceReferenceModel(saved.draft.videoModel),
                audioMode: editableAudioMode(saved.draft.audioMode, nativeAllowed.current),
              };
              setDirty(saved.dirty);
              setCast(saved.cast || []);
            } else {
              if (saved.dirty && saved.draft) {
                setConflict(saved.draft);
                localStorage.setItem(`${key}:conflict`, raw);
              }
              setNote(
                "Bản sửa dở trên máy này cũ hơn bản đã lưu, nên đang mở bản đã lưu để không ghi đè.",
              );
            }
          } catch {
            /* Ignore invalid local data. */
          }
        }
        const preservedConflict = localStorage.getItem(`${key}:conflict`);
        if (preservedConflict) {
          try {
            setConflict(JSON.parse(preservedConflict).draft);
          } catch {}
        }
        if (!edited.current) {
          setDraft(initial);
          setPlan(p || null);
          if (!raw) setCast(p?.cast_snapshot.map((c) => c.characterId) || []);
        }
        setReady(true);
        void refreshProduction().catch(() => {});
      })
      .catch((e) => {
        if (g === generation.current) setError(e.message);
      });
    return () => {
      generation.current = g + 1;
    };
  }, [base, ref, refreshProduction, attempt]);
  useEffect(() => {
    if (!ready || !plan) {
      setSegments([]);
      return;
    }
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Chưa tải được các cảnh. Bạn tải lại trang nhé."),
    );
  }, [ready, plan, refresh]);
  useEffect(() => {
    if (!ready || !storageKey) return;
    const timer = setTimeout(
      () =>
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            draft,
            cast,
            dirty,
            planId: plan?.id || null,
            version: plan?.version || null,
          }),
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [ready, storageKey, draft, cast, dirty, plan]);
  const runningTasks = [...tasks, ...voiceTasks].filter((t) =>
    ["queued", "running", "reconciling"].includes(t.status),
  );
  const newestRunning = Math.max(
    0,
    ...runningTasks.map((t) => Date.parse(t.created_at)),
  );
  const pollingKey = runningTasks
    .map((t) => t.id)
    .sort()
    .join(",");
  const terminalKey = [...tasks, ...voiceTasks]
    .filter((t) => ["completed", "failed", "cancelled"].includes(t.status))
    .map((t) => `${t.id}:${t.status}`)
    .sort()
    .join(",");
  const productionPollingKey = productionRuns
    .filter((r) => ["queued", "scripting", "running"].includes(r.status))
    .map((r) => `${r.id}:${r.phase}`)
    .join(",");
  useEffect(() => {
    if (ready && terminalKey) notifyProjectBalanceChanged();
  }, [ready, terminalKey]);
  useEffect(() => {
    if (!ready) return;
    let active = true,
      inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      clearTimeout(timer);
      if (
        !active ||
        inFlight ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      inFlight = true;
      try {
        await Promise.all([refresh(), refreshVoices(), refreshProduction()]);
      } catch {
        /* Keep prior results. */
      } finally {
        inFlight = false;
      }
      if (active && (pollingKey || productionPollingKey)) {
        timer = setTimeout(
          poll,
          Date.now() - newestRunning < 60000 ? 3000 : 10000,
        );
      }
    };
    void poll();
    const visible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [
    ready,
    refresh,
    refreshVoices,
    refreshProduction,
    pollingKey,
    newestRunning,
    productionPollingKey,
  ]);

  async function act(name: string, work: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    setError("");
    try {
      await work();
    } catch (e) {
      const failure = e as Error & { code?: string; required?: number };
      // Hết điểm thì mở hộp nạp ngay tại chỗ, như mọi màn khác.
      if (failure.code === "INSUFFICIENT_POINTS")
        setPointsNeeded(failure.required ?? quote?.points ?? voiceQuote?.points ?? 1);
      else setError(e instanceof Error ? e.message : "Chưa làm xong. Bạn thử lại nhé.");
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function save(nextDraft: Draft = draft) {
    const currentPlan = plan;
    // A manually edited episode can retain the story metadata from an older
    // draft. The API validates story.wants against the cast in the scenes; if
    // that metadata names a character no longer used by this episode, clear
    // the stale story instead of blocking the save. The scene dialogue and
    // actions remain the source of truth and are still persisted unchanged.
    const sceneCharacterIds = new Set(
      nextDraft.scenes.flatMap((scene) => scene.characterIds),
    );
    const storyCharacterIds = new Set(
      (nextDraft.story?.wants || []).map((want) => want.characterId),
    );
    const storyMatchesScenes =
      !nextDraft.story ||
      [...storyCharacterIds].every((characterId) =>
        sceneCharacterIds.has(characterId),
      );
    const payload = {
      ...nextDraft,
      // Preserve valid AI story metadata; discard only stale metadata left by
      // a previous episode after its cast/scenes were manually replaced.
      story: storyMatchesScenes ? nextDraft.story : null,
      workspaceVersion: workspace,
      expectedVersion: currentPlan?.version,
    };
    const j = await api(
      `${base}/video-plans${currentPlan ? "/" + currentPlan.id : ""}`,
      payload,
      currentPlan ? "PUT" : "POST",
    );
    const savedPlan = {
      ...j.plan,
      has_video:
        j.plan.latest_content_output_id
          ? true
          : currentPlan?.has_video || false,
      video_status: currentPlan?.video_status,
      video_output_count: currentPlan?.video_output_count,
      has_production_history: currentPlan?.has_production_history,
    } as FilmPlan;
    setPlan(savedPlan);
    setSegments([]);
    setPlans((ps) => [savedPlan, ...ps.filter((p) => p.id !== savedPlan.id)]);
    setDraft(fromPlan(savedPlan, nativeAllowed.current));
    setDirty(false);
    edited.current = false;
    setQuote(null);
    if (storageKey) {
      localStorage.removeItem(`${storageKey}:new-draft`);
      localStorage.removeItem(
        `${storageKey}:draft:${currentPlan?.id || savedPlan.id}`,
      );
    }
    setNote("Đã lưu. Kết quả cũ vẫn giữ trong lịch sử.");
    return savedPlan;
  }
  async function saveCurrent() {
    if (draft.scenes.length) return save();
    if (!draft.brief.trim())
      throw new Error("Gõ một ý tưởng hoặc chọn gợi ý trước khi lưu kịch bản nhé.");
    return save(await write());
  }
  async function openEpisode(id: string) {
    if (id === (plan?.id || "")) return;
    if (dirty && plan && draft.scenes.length) await save();
    else if (dirty && storageKey)
      localStorage.setItem(
        plan
          ? `${storageKey}:draft:${plan.id}`
          : `${storageKey}:new-draft`,
        JSON.stringify({
          draft,
          cast,
          version: plan?.version || null,
          savedAt: new Date().toISOString(),
        }),
      );
    generation.current++;
    const nextPlan = id ? plans.find((candidate) => candidate.id === id) : null;
    if (id && !nextPlan)
      throw new Error("Kịch bản này không còn trong kênh. Tải lại trang nhé.");
    let nextDraft = nextPlan
      ? fromPlan(nextPlan, nativeAllowed.current)
      : { ...blank(), targetDurationSeconds: 35 };
    let nextCast =
      nextPlan?.cast_snapshot.map(
        (c: { characterId: string }) => c.characterId,
      ) || [];
    let nextDirty = false;
    if (storageKey) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(
            nextPlan
              ? `${storageKey}:draft:${nextPlan.id}`
              : `${storageKey}:new-draft`,
          ) || "null",
        );
        if (
          saved?.draft &&
          (!nextPlan || saved.version === nextPlan.version)
        ) {
          nextDraft = {
            ...saved.draft,
            videoModel: seedanceReferenceModel(saved.draft.videoModel),
            audioMode: editableAudioMode(saved.draft.audioMode, nativeAllowed.current),
          };
          nextCast = Array.isArray(saved.cast) ? saved.cast : [];
          nextDirty = true;
        }
      } catch {
        localStorage.removeItem(
          nextPlan
            ? `${storageKey}:draft:${nextPlan.id}`
            : `${storageKey}:new-draft`,
        );
      }
    }
    setPlan(nextPlan || null);
    setDraft(nextDraft);
    setTasks([]);
    setSegments([]);
    setCast(nextCast);
    setQuote(null);
    setSelected(0);
    setDirty(nextDirty);
    edited.current = nextDirty;
    setAssistId(null);
    setNote(
      nextDirty
        ? nextPlan
          ? "Đã khôi phục phần chưa lưu của kịch bản này."
          : "Đã khôi phục ý tưởng của Tập mới."
        : "",
    );
  }
  async function removeCurrentPlan() {
    if (!plan) return;
    const hasHistory = episodeHasHistory(plan);
    await act(hasHistory ? "Ẩn kịch bản" : "Xoá kịch bản", async () => {
      await api(
        `${base}/video-plans/${plan.id}`,
        {
          action: hasHistory ? "archive" : "delete",
          workspaceVersion: workspace,
          expectedVersion: plan.version,
        },
        hasHistory ? "PATCH" : "DELETE",
      );
      setPlans((current) => current.filter((candidate) => candidate.id !== plan.id));
      if (storageKey) {
        localStorage.removeItem(`${storageKey}:draft:${plan.id}`);
        const current = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (current?.planId === plan.id) localStorage.removeItem(storageKey);
      }
      setPlan(null);
      setDraft({ ...blank(), targetDurationSeconds: channel ? 35 : 30 });
      setCast([]);
      setTasks([]);
      setSegments([]);
      setQuote(null);
      setDirty(false);
      edited.current = false;
      setPlanPickerOpen(false);
      setNote(
        hasHistory
          ? "Đã ẩn kịch bản. Phim đã làm vẫn còn trong thư viện."
          : "Đã xoá kịch bản.",
      );
    });
  }
  async function loadMorePlans() {
    if (nextPlansOffset === null) return;
    await act("Xem thêm kịch bản", async () => {
      const j = await api(`${base}/video-plans?offset=${nextPlansOffset}`);
      setPlans((current) => {
        const seen = new Set(current.map((candidate) => candidate.id));
        return [
          ...current,
          ...(j.plans || []).filter((candidate: FilmPlan) => !seen.has(candidate.id)),
        ];
      });
      setNextPlansOffset(j.nextOffset ?? null);
    });
  }
  async function suggest() {
    const g = generation.current;
    const j = await api(`${base}/creative-assists`, {
      kind: "idea_suggestions",
      workspaceVersion: workspace,
      selectedCharacterIds: cast,
    });
    for (let n = 0; n < 110; n++) {
      if (g !== generation.current) return;
      const r = await api(`${base}/creative-assists/${j.jobId}`);
      if (r.job.status === "failed")
        throw new Error("Chưa lấy được gợi ý. Ý tưởng hiện tại vẫn giữ.");
      if (r.job.status === "completed") {
        setIdeas(r.job.result.ideas);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Gợi ý đang lâu hơn bình thường. Bạn thử lại sau nhé.");
  }
  async function readAssist(jobId: string): Promise<Draft> {
    const g = generation.current;
    for (let n = 0; n < 110; n++) {
      if (g !== generation.current) throw new Error("Đã chuyển kênh.");
      const j = await api(`${base}/creative-assists/${jobId}`);
      if (j.job.status === "failed")
        throw new Error(
          j.job.error?.message
            ? humanizeError(j.job.error.message)
            : "Chưa viết được bản đủ tốt. Bản trước vẫn được giữ.",
        );
      if (j.job.status === "completed") {
        if (g !== generation.current) throw new Error("Đã chuyển kênh.");
        const generated = {
          ...draft,
          title: j.job.result.title || draft.title,
          brief: j.job.intent || draft.brief,
          caption: j.job.result.caption || draft.caption,
          story: j.job.result.story || null,
          guests: Array.isArray(j.job.result.guests)
            ? j.job.result.guests.map((g: DraftGuest) => ({
                key: String(g.key || ""),
                name: String(g.name || ""),
                description: String(g.description || ""),
              }))
            : [],
          scenes: j.job.result.scenes.map((s: DraftScene) => ({
            ...sceneBlank(),
            ...s,
            id: undefined,
          })),
        } as Draft;
        edited.current = true;
        setDirty(true);
        setQuote(null);
        setDraft(generated);
        setSelected(0);
        setAssistId(null);
        return generated;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      "Vẫn đang viết. Lát nữa bấm Lấy lại bản vừa viết nhé.",
    );
  }
  async function write(): Promise<Draft> {
    if (!draft.brief.trim())
      throw new Error("Gõ một ý tưởng hoặc bấm Gợi ý cho kênh nhé.");
    const start = await api(`${base}/creative-assists`, {
      kind: "video_plan",
      intent: draft.brief,
      selectedCharacterIds: cast,
      guestCharacters: draft.guests,
      targetDurationSeconds: draft.targetDurationSeconds,
      videoModel: draft.videoModel,
      workspaceVersion: workspace,
    });
    setAssistId(start.jobId);
    return readAssist(start.jobId);
  }
  async function optimizePerformance(): Promise<Draft> {
    if (!draft.scenes.length)
      throw new Error("Viết kịch bản hoặc mở một tập trước nhé.");
    const start = await api(`${base}/creative-assists`, {
      kind: "performance_revision",
      intent:
        "Tối ưu biểu cảm cho toàn bộ cảnh: giữ nguyên thoại, người nói, cast, bối cảnh, bộ ảnh tham chiếu và thứ tự. Tạo hành vi hài dễ nhớ, có hook nhìn thấy ngay, leo thang, phản ứng có mục tiêu và điểm cắt. Không thêm thoại.",
      selectedCharacterIds: cast,
      currentScenes: draft.scenes,
      lockedSceneIndexes: [],
      targetDurationSeconds: draft.targetDurationSeconds,
      videoModel: draft.videoModel,
      workspaceVersion: workspace,
    });
    const g = generation.current;
    for (let n = 0; n < 110; n++) {
      if (g !== generation.current) throw new Error("Đã chuyển kênh.");
      const j = await api(`${base}/creative-assists/${start.jobId}`);
      if (j.job.status === "failed")
        throw new Error(
          j.job.error?.message
            ? humanizeError(j.job.error.message)
            : "Chưa làm biểu cảm rõ hơn được. Bản trước vẫn được giữ.",
        );
      if (j.job.status === "completed") {
        const scenes = j.job.result.scenes.map((s: DraftScene, i: number) => ({
          ...draft.scenes[i],
          ...s,
          id: draft.scenes[i]?.id,
        }));
        const next = { ...draft, scenes };
        edited.current = true;
        setDirty(true);
        setQuote(null);
        setDraft(next);
        return next;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Vẫn đang viết. Lát nữa bạn thử lại nhé.");
  }
  /**
   * Làm phim từ bản đang mở rồi sang Studio phim theo dõi: tiến độ, quyết định
   * giữa chừng và hết điểm đều được xử lý ở đó.
   */
  async function createFilm() {
    const filmCap = Math.round(limit ?? qualityFor(draft.videoModel).defaultLimit);
    if (!Number.isInteger(filmCap) || filmCap < 50)
      throw new Error("Nhập mức chi cho tập này, ít nhất 50 điểm nhé.");
    let selectedPlan = plan;
    let intent = "";
    // Ý tưởng mới gõ khi đang mở một tập khác là một tập mới, không phải làm
    // lại tập đang mở.
    const ideaIsNew =
      !!draft.brief.trim() &&
      !draft.scenes.length &&
      (!plan || draft.brief.trim() !== (plan.brief || "").trim());
    if (
      draft.scenes.length &&
      (dirty || !plan || plan.audio_mode !== draft.audioMode)
    ) {
      selectedPlan = await save();
    } else if (ideaIsNew) {
      selectedPlan = null;
      intent = draft.brief;
    }
    const storage = `film-production-key:${ref}:${selectedPlan?.id || "new"}:${selectedPlan?.version || draft.brief}`;
    const key = localStorage.getItem(storage) || crypto.randomUUID();
    localStorage.setItem(storage, key);
    const response = await api(`${base}/production-runs`, {
      planId: selectedPlan?.id || null,
      intent,
      guests: draft.guests,
      maxPointsPerFilm: filmCap,
      maxPointsPerDay: filmCap * 3,
      videoModel: draft.videoModel,
      idempotencyKey: key,
    });
    router.push(`/projects/${ref}/short-films?tap=${selectedPlan?.id || response.runId}`);
  }
  async function getQuote(
    stage: string,
    sceneIds?: string[],
    regenerate = false,
  ) {
    const p =
      dirty || !plan || plan.audio_mode !== draft.audioMode
        ? await save()
        : plan;
    const j = await api(`${base}/video-plans/${p.id}/quote`, {
      workspaceVersion: workspace,
      expectedVersion: p.version,
      stage,
      sceneIds,
      regenerate,
    });
    setQuote(j.quote);
  }
  async function run(q: Quote, voice = false) {
    const key =
      requestKeys.current[q.id] ||
      localStorage.getItem(`film-request:${q.id}`) ||
      crypto.randomUUID();
    requestKeys.current[q.id] = key;
    localStorage.setItem(`film-request:${q.id}`, key);
    await api(
      voice ? `${base}/voices` : `${base}/video-plans/${plan!.id}/run`,
      { quoteId: q.id, idempotencyKey: key, workspaceVersion: workspace },
    );
    notifyProjectBalanceChanged();
    if (voice) setVoiceQuote(null);
    else setQuote(null);
    setNote("Đã nhận việc. Có thể rời trang và quay lại.");
    await Promise.all([refresh(), refreshVoices()]);
    setTab("results");
  }
  async function saveSegment(
    segment: FilmSegmentRevision,
    revision: FilmSegmentPatch,
  ) {
    if (!plan) throw new Error("Chưa chọn kịch bản.");
    const result = await api(
      `${base}/video-plans/${plan.id}/segments/${segment.segmentId}`,
      {
        workspaceVersion: workspace,
        expectedRevision: segment.revision,
        revision,
      },
      "PATCH",
    );
    setSegments((current) =>
      current.map((item) =>
        item.segmentId === segment.segmentId ? result.segment : item,
      ),
    );
    setNote("Đã lưu cảnh. Hình và tiếng cũ giữ nguyên cho tới khi bạn làm lại.");
    return result.segment as FilmSegmentRevision;
  }
  async function quoteSegment(
    segment: FilmSegmentRevision,
    startFrameMode: "footage" | "generated" = "footage",
  ) {
    if (!plan) throw new Error("Chưa chọn kịch bản.");
    const result = await api(
      `${base}/video-plans/${plan.id}/segments/${segment.segmentId}/quote`,
      {
        workspaceVersion: workspace,
        expectedVersion: plan.version,
        startFrameMode,
      },
    );
    return result.quote as Quote;
  }
  async function uploadSegmentFrame(
    segment: FilmSegmentRevision,
    file: File,
  ) {
    if (!plan) throw new Error("Chưa chọn kịch bản.");
    const form = new FormData();
    form.set("workspaceVersion", String(workspace));
    form.set("expectedVersion", String(plan.version));
    form.set("expectedRevision", String(segment.revision));
    form.set("file", file);
    const response = await fetch(
      `${base}/video-plans/${plan.id}/segments/${segment.segmentId}/frame`,
      { method: "POST", body: form },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Chưa thêm được ảnh mở đầu. Bạn thử lại nhé.");
    return result.quote as Quote;
  }
  async function selectSegmentSource(
    segment: FilmSegmentRevision,
    taskId: string,
    inSeconds: number,
    outSeconds: number,
  ) {
    if (!plan) throw new Error("Chưa chọn kịch bản.");
    const result = await api(
      `${base}/video-plans/${plan.id}/segments/${segment.segmentId}`,
      {
        action: "select-source",
        workspaceVersion: workspace,
        expectedRevision: segment.revision,
        taskId,
        inSeconds,
        outSeconds,
      },
      "PATCH",
    );
    setSegments((current) =>
      current.map((item) =>
        item.segmentId === segment.segmentId ? result.segment : item,
      ),
    );
    setNote("Đã chọn bản cho cảnh này. Bản ghép cũ vẫn được giữ.");
    return result.segment as FilmSegmentRevision;
  }
  async function renderSegments() {
    if (!plan) throw new Error("Chưa chọn kịch bản.");
    const result = await api(
      `${base}/video-plans/${plan.id}/segments/render`,
      {
        workspaceVersion: workspace,
        expectedVersion: plan.version,
      },
    );
    await run(result.quote as Quote);
  }
  async function regenerate(t: FilmTask, reason: string) {
    await api(`${base}/film-tasks/${t.id}`, {
      action: "regenerate",
      reason,
      workspaceVersion: workspace,
    });
    await refresh();
    setNote("Đã ghi lại. Phần này sẽ được làm lại ở lần làm tiếp.");
  }
  async function approve(t: FilmTask) {
    await api(`${base}/film-tasks/${t.id}`, {
      action: "approve",
      workspaceVersion: workspace,
    });
    await Promise.all([refresh(), refreshVoices()]);
    if (!t.scene_id && t.kind === "tts") {
      setDirty(true);
      setNote(
        "Đã duyệt giọng. Lưu kịch bản để dùng giọng này trong phiên bản mới.",
      );
    }
  }
  const scene = draft.scenes[selected];
  const currentTasks = tasks.filter(
    (t) =>
      !t.scene_id ||
      plan?.video_plan_scenes.some(
        (s) => s.id === t.scene_id && s.version === t.scene_version,
      ),
  );
  const directorReferenceTasks = currentTasks
    .filter(
      (task) =>
        task.kind === "image" &&
        typeof task.input.referenceImageId === "string",
    )
    .sort((a, b) => {
      const sceneA = plan?.video_plan_scenes.find((s) => s.id === a.scene_id)?.scene_index ?? 999;
      const sceneB = plan?.video_plan_scenes.find((s) => s.id === b.scene_id)?.scene_index ?? 999;
      if (sceneA !== sceneB) return sceneA - sceneB;
      const rank = (task: FilmTask) =>
        task.input.referenceRole === "scene"
          ? 0
          : task.input.referenceRole === "character"
            ? 1
            : task.input.referenceRole === "prop"
              ? 2
              : 3;
      return rank(a) - rank(b);
    });
  const displayTasks = [
    ...currentTasks.filter(
      (task) =>
        task.kind !== "frame" &&
        !(
          task.kind === "image" &&
          typeof task.input.referenceImageId === "string"
        ),
    ),
    ...voiceTasks,
  ].sort((a, b) => {
    const rank = (task: FilmTask) =>
      task.kind === "render"
        ? 0
        : ["running", "queued", "reconciling"].includes(task.status)
          ? 1
          : task.scene_id
            ? 2
            : 3;
    return rank(a) - rank(b);
  });
  const hasRunning = [...currentTasks, ...voiceTasks].some((t) =>
    ["queued", "running", "reconciling"].includes(t.status),
  );
  const latest = (s: FilmScene, k: FilmKind) =>
    currentSceneTask(currentTasks, s, k, draft.audioMode);
  let stage = "prepare";
  let stageSceneIds: string[] | undefined;
  if (plan?.video_plan_scenes.length && !dirty) {
    const ss = plan.video_plan_scenes;
    const taskAccepted = (task?: FilmTask) =>
      Boolean(task?.approved_at || task?.auto_accepted_at);
    const speechReady = (s: FilmScene) =>
      !s.dialogue ||
      draft.audioMode === "native" ||
      (draft.audioMode === "dubbed"
        ? speechTasks(currentTasks, s).length > 0 &&
          speechTasks(currentTasks, s).every(taskAccepted)
        : taskAccepted(latest(s, "tts")));
    const prepare = ss.filter(
      (s) => !referencePackReady(currentTasks, s) || !speechReady(s),
    );
    const video = ss.filter(
      (s) => referencePackReady(currentTasks, s) && !latest(s, "video"),
    );
    const finish = ss.filter(
      (s) =>
        !!latest(s, "video") &&
        draft.audioMode !== "native" &&
        !!s.dialogue &&
        !latest(s, finalClipKind(s, draft.audioMode)),
    );
    const transcript = ss.filter(
      (s) =>
        !!s.dialogue &&
        !!latest(s, finalClipKind(s, draft.audioMode)) &&
        !latest(s, "transcribe"),
    );
    if (prepare.length) [stage, stageSceneIds] = ["prepare", prepare.map((s) => s.id)];
    else if (video.length) [stage, stageSceneIds] = ["video", video.map((s) => s.id)];
    else if (finish.length) [stage, stageSceneIds] = ["finish", finish.map((s) => s.id)];
    else if (transcript.length)
      [stage, stageSceneIds] = [draft.audioMode === "native" ? "finish" : "transcript", transcript.map((s) => s.id)];
    else [stage, stageSceneIds] = ["render", ss.map((s) => s.id)];
  }
  const stageNames: Record<string, string> = {
    prepare: "Chuẩn bị hình và giọng",
    video: "Quay các cảnh",
    finish:
      draft.audioMode === "dubbed"
        ? "Lồng tiếng từng lượt"
        : draft.audioMode === "fixed"
          ? "Khớp môi"
          : "Kiểm tra lời thoại",
    transcript: "Kiểm tra lời thoại",
    render: "Ghép phim",
  };
  // FilmStoryboardEditor vẫn nhận lớp ô nhập dạng chuỗi.
  const control =
    "w-full rounded-xl border th-border px-3 py-2 th-bg-input th-text-primary text-sm focus:outline-none focus-visible:ring-2 th-ring-accent";
  const studioHref = `/projects/${ref}/short-films${plan ? `?tap=${plan.id}` : ""}`;
  const back = { href: studioHref, label: "Phim ngắn" };
  const option = qualityFor(draft.videoModel);
  const filmLimit = limit ?? option.defaultLimit;
  const activeRun = productionPollingKey.length > 0;
  const available = channelPoints === null ? null : channelPoints + (wallet.isLoading ? 0 : wallet.points);
  const taskStatus = (t: FilmTask) =>
    t.status === "completed"
      ? t.approved_at
        ? "Đã duyệt"
        : t.auto_accepted_at
          ? "Đã tự kiểm, đạt"
          : "Chờ duyệt"
      : t.status === "reconciling"
        ? "Đang kiểm tra"
        : t.status === "cancelled"
          ? "Đã huỷ"
          : t.status === "failed"
            ? "Chưa xong"
            : "Đang làm";
  const sceneNumberOf = (t: FilmTask) => {
    const index = plan?.video_plan_scenes.find((s) => s.id === t.scene_id)?.scene_index;
    return index === undefined ? "cũ" : String(index + 1);
  };

  // Trang nặng nhất của app trước đây render rỗng trong lúc chờ, và kẹt ở
  // khung đang tải nếu lần tải đầu hỏng.
  if (!ready)
    return error ? (
      <PageContainer width="work">
        <PageHeader title="Chỉnh tay phim" back={back} />
        <Alert
          action={
            <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      </PageContainer>
    ) : (
      <PageSkeleton width="work" blocks={3} />
    );

  return (
    <PageContainer width="work">
      <PageHeader
        title={plan?.title || "Chỉnh tay phim"}
        description="Sửa lời thoại, từng cảnh và giọng nhân vật của một tập. Sửa xong bấm Làm phim từ bản này."
        back={back}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              loading={busy === "Lưu kịch bản"}
              disabled={!!busy || !dirty || (!draft.scenes.length && !draft.brief.trim())}
              onClick={() => act("Lưu kịch bản", saveCurrent)}
            >
              Lưu kịch bản
            </Button>
            {plan && (
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setRemovePlanOpen(true)}>
                <Trash2 size={14} aria-hidden /> {episodeHasHistory(plan) ? "Ẩn kịch bản" : "Xoá kịch bản"}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex min-w-0 flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 text-sm th-text-secondary">
          <span className="mb-1 block">Kịch bản đã lưu · {plans.length}</span>
          <button
            type="button"
            aria-label="Mở danh sách kịch bản"
            aria-haspopup="dialog"
            aria-expanded={planPickerOpen}
            disabled={!!busy}
            className={`${control} flex min-h-11 items-center justify-between gap-3 text-left disabled:opacity-60`}
            onClick={() => setPlanPickerOpen((open) => !open)}
          >
            <span className="min-w-0 truncate th-text-primary">
              {openingPlanId ? "Đang mở…" : plan ? `${plan.title} · bản ${plan.version}` : "Tập mới"}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs th-text-secondary">
              {plan ? (
                <span className={`rounded-full px-2 py-1 ${episodePickerClasses[episodePickerStatus(plan)]}`}>
                  {episodePickerLabels[episodePickerStatus(plan)]}
                </span>
              ) : (
                "Chưa lưu"
              )}
              <ChevronDown size={14} aria-hidden />
            </span>
          </button>
          {planPickerOpen && (
            <div
              role="dialog"
              aria-label="Danh sách kịch bản"
              className="absolute z-30 mt-2 w-full rounded-2xl border th-border th-bg-card p-3 th-shadow-lg"
            >
              <Input
                autoFocus
                aria-label="Tìm kịch bản"
                value={planQuery}
                onChange={(e) => setPlanQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc ý tưởng…"
                className="mb-2"
              />
              <div className="my-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Lọc kịch bản">
                {(["all", "draft", "running", "ready", "failed"] as const).map((filter) => (
                  <Chip key={filter} role="radio" selected={planFilter === filter} onClick={() => setPlanFilter(filter)}>
                    {filter === "all" ? "Tất cả" : episodePickerLabels[filter]}
                  </Chip>
                ))}
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Kịch bản">
                <button
                  type="button"
                  role="option"
                  aria-selected={!plan}
                  className="w-full rounded-xl border th-border px-3 py-2 text-left text-sm th-bg-hover"
                  onClick={() => {
                    setPlanPickerOpen(false);
                    setPlanQuery("");
                    void act("Tập mới", () => openEpisode(""));
                  }}
                >
                  <span className="block font-medium th-text-primary">Tập mới</span>
                  <span className="text-xs th-text-secondary">Bắt đầu một kịch bản chưa lưu</span>
                </button>
                {visiblePlans.map((candidate) => {
                  const state = episodePickerStatus(candidate);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="option"
                      aria-selected={candidate.id === plan?.id}
                      className="w-full rounded-xl border th-border px-3 py-2 text-left th-bg-hover"
                      onClick={() => {
                        setPlanPickerOpen(false);
                        setPlanQuery("");
                        setOpeningPlanId(candidate.id);
                        void act("Mở kịch bản", async () => {
                          try {
                            await openEpisode(candidate.id);
                          } finally {
                            setOpeningPlanId(null);
                          }
                        });
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium th-text-primary">{candidate.title}</span>
                        <span className="shrink-0 text-xs th-text-secondary">bản {candidate.version}</span>
                      </span>
                      <span className="mt-1 block text-xs th-text-secondary">
                        <span className={`rounded-full px-2 py-0.5 ${episodePickerClasses[state]}`}>
                          {episodePickerLabels[state]}
                        </span>
                        {candidate.updated_at ? ` · ${formatDate(candidate.updated_at)}` : ""}
                      </span>
                    </button>
                  );
                })}
                {!visiblePlans.length && (
                  <p className="px-2 py-4 text-center text-sm th-text-secondary">Không có kịch bản nào khớp.</p>
                )}
                {nextPlansOffset !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    loading={busy === "Xem thêm kịch bản"}
                    disabled={!!busy}
                    onClick={() => void loadMorePlans()}
                  >
                    Xem thêm kịch bản cũ
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => act("Tập mới", () => openEpisode(""))}>
          <Plus size={16} aria-hidden /> Tập mới
        </Button>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {conflict && (
        <Alert
          tone="info"
          className="mb-4"
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => {
                change(conflict);
                setConflict(null);
                localStorage.removeItem(`${storageKey}:conflict`);
              }}
            >
              Mở bản sửa dở
            </Button>
          }
        >
          Có một bản sửa dở chưa lưu được giữ riêng.
        </Alert>
      )}
      {note && (
        <p role="status" className="mb-4 text-sm th-text-secondary">
          {note}
        </p>
      )}

      {draft.story && (
        <details className="mb-4 rounded-2xl border th-border p-4 th-bg-card th-text-primary">
          <summary className="cursor-pointer font-semibold">Câu chuyện của tập</summary>
          <p className="mt-2 text-sm">{draft.story.situation}</p>
          <p className="mt-1 text-sm th-text-secondary">
            {draft.story.mechanism} · {draft.story.outcome}
          </p>
          <ol className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            {draft.story.beats.map((b, i) => (
              <li key={i}>
                <strong>{i + 1}.</strong> {b.description}
              </li>
            ))}
          </ol>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer">Đọc liền lời thoại</summary>
            <ol className="mt-2 space-y-2">
              {draft.scenes
                .filter((s) => s.dialogue)
                .map((s, i) => (
                  <li key={i}>
                    <strong>
                      {characters.find((c) => c.id === s.speakerCharacterId)?.name ||
                        draft.guests.find((g) => g.key === s.speakerCharacterId)?.name ||
                        "Nhân vật"}
                      :
                    </strong>{" "}
                    {s.dialogue}
                  </li>
                ))}
            </ol>
          </details>
          <p className="mt-3 text-xs th-text-secondary">
            {!dirty && plan?.script_review ? "Kịch bản đã duyệt." : "Kịch bản chờ duyệt."} Sửa thoại xong thì đọc
            lại một lượt cho liền mạch; độ dài cuối tính theo giọng đọc thật.
          </p>
        </details>
      )}

      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold th-text-primary">Làm phim từ bản này</h2>
            <p className="mt-1 text-sm th-text-secondary">
              AIDA làm tiếp từ kịch bản đang mở, phần đã xong được dùng lại. Ở Tập mới, để trống ý tưởng thì AIDA tự
              nghĩ. Tiến độ xem ở trang Phim ngắn.
            </p>
          </div>
          <div className="max-w-56">
            <Input
              id="film-limit"
              label="Chi tối đa cho tập này (điểm)"
              type="number"
              min={50}
              step={50}
              value={filmLimit}
              onChange={(e) => setLimit(Number(e.target.value) || 0)}
            />
          </div>
          <PriceLine
            points={{ min: Math.min(option.estimatedPoints, filmLimit), max: filmLimit }}
            available={available}
            note="sắp vượt mức chi sẽ dừng lại hỏi bạn"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!!busy || (draft.audioMode === "fixed" && !enabled) || activeRun}
              loading={busy === "Làm phim"}
              onClick={() => act("Làm phim", createFilm)}
            >
              <Clapperboard size={16} aria-hidden />
              {draft.audioMode === "fixed" && !enabled ? "Kiểu một giọng đọc chưa mở" : "Làm phim từ bản này"}
            </Button>
            {activeRun && (
              <Link href={studioHref} className={buttonClasses("ghost", "md")}>
                Đang có tập đang làm · xem ở Phim ngắn
              </Link>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex gap-2 lg:hidden" role="radiogroup" aria-label="Phần đang xem">
        {(["settings", "results"] as const).map((v) => (
          <Chip key={v} role="radio" selected={tab === v} onClick={() => setTab(v)}>
            {v === "settings" ? "Kịch bản và cảnh" : "Kết quả"}
          </Chip>
        ))}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <section
          aria-label="Kịch bản và cảnh"
          className={`${tab === "settings" ? "" : "hidden lg:block"} min-w-0 rounded-2xl border th-border p-4 th-bg-card`}
        >
          <fieldset disabled={!!busy} className="min-w-0 space-y-3">
            <Textarea
              id="film-brief"
              label="Tập này kể chuyện gì?"
              className="min-h-24"
              value={draft.brief}
              onChange={(e) => change({ brief: e.target.value })}
              placeholder="Ví dụ: hai bạn cùng làm bánh, một người lén giấu mất phần nhân…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" loading={busy === "Gợi ý"} onClick={() => act("Gợi ý", suggest)}>
                Gợi ý cho kênh
              </Button>
              {ideas.map((idea, i) => (
                <Chip
                  key={i}
                  title={idea.idea}
                  onClick={() => {
                    change({ brief: idea.idea });
                    setIdeas([]);
                  }}
                >
                  {idea.title}
                </Chip>
              ))}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium th-text-secondary">Nhân vật trong tập</p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const coreIds = new Set((channel?.roles || []).map((r) => r.characterId));
                  const core = characters.filter((c) => coreIds.has(c.id));
                  const other = characters.filter((c) => !coreIds.has(c.id));
                  const chip = (c: (typeof characters)[number]) => (
                    <Chip
                      key={c.id}
                      selected={cast.includes(c.id)}
                      onClick={() => {
                        edited.current = true;
                        setDirty(true);
                        setQuote(null);
                        setCast((v) => (v.includes(c.id) ? v.filter((id) => id !== c.id) : [...v, c.id].slice(0, 4)));
                      }}
                    >
                      {c.name}
                    </Chip>
                  );
                  return (
                    <>
                      {core.map(chip)}
                      {other.length > 0 && (
                        <details className="w-full">
                          <summary className="cursor-pointer py-1 text-xs th-text-muted">
                            Nhân vật khác của kênh ({other.length})
                          </summary>
                          <div className="mt-2 flex flex-wrap gap-2">{other.map(chip)}</div>
                        </details>
                      )}
                    </>
                  );
                })()}
              </div>
              <p className="mt-1 text-xs th-text-muted">
                {cast.length ? "Tối đa bốn nhân vật một tập." : "Chưa chọn ai: AIDA dùng các nhân vật chính của kênh."}
              </p>
            </div>

            {channel && draft.guests.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs th-text-tertiary">
                  Nhân vật mới chỉ có trong tập này, không lưu vào trang Nhân vật:
                </p>
                <div className="flex flex-wrap gap-2">
                  {draft.guests.map((g) => (
                    <span key={g.key} className="rounded-full px-2.5 py-1 text-xs th-bg-accent-light th-text-accent">
                      {g.name}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs th-text-muted">
                  Muốn đổi người thì sửa ý tưởng (ví dụ: “có thêm ông phi công”) rồi viết lại.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 items-end gap-2">
              <Input
                id="film-duration"
                label="Độ dài (giây)"
                type="number"
                min={15}
                max={120}
                step={1}
                value={draft.targetDurationSeconds}
                onChange={(e) =>
                  change({ targetDurationSeconds: Math.max(15, Math.min(120, Number(e.target.value) || 15)) })
                }
              />
              <Button className="min-h-11" loading={busy === "Viết kịch bản"} onClick={() => act("Viết kịch bản", write)}>
                <PenLine size={16} aria-hidden /> Viết kịch bản
              </Button>
            </div>
            {draft.scenes.length > 0 && (
              <Button
                variant="outline"
                className="w-full"
                loading={busy === "Biểu cảm"}
                onClick={() => act("Biểu cảm", optimizePerformance)}
              >
                <Sparkles size={16} aria-hidden /> Làm biểu cảm rõ hơn · giữ nguyên lời và nhân vật
              </Button>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-medium th-text-secondary">Chất lượng</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {SEEDANCE_VARIANTS.map((item) => {
                  const on = draft.videoModel === item.textModel;
                  return (
                    <label
                      key={item.id}
                      className={`cursor-pointer rounded-xl border p-3 text-sm ${on ? "th-border-accent th-bg-accent-light" : "th-border"}`}
                    >
                      <span className="flex items-center gap-2 font-medium th-text-primary">
                        <input
                          type="radio"
                          name="film-quality"
                          checked={on}
                          onChange={() => {
                            change({ videoModel: item.textModel });
                            setLimit(null);
                          }}
                        />
                        {item.customerLabel}
                      </span>
                      <span className="mt-1 block text-xs th-text-secondary">{item.customerNote}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {draft.scenes.some((scene) => scene.durationSeconds > seedanceMaxDuration(draft.videoModel)) && (
              <Alert tone="warning">
                Có cảnh dài hơn mức một cảnh quay được. Bấm Viết kịch bản để chia lại; nội dung và đoạn kết vẫn giữ.
              </Alert>
            )}
            {assistId && (
              <Button variant="ghost" size="sm" loading={busy === "Lấy lại"} onClick={() => act("Lấy lại", () => readAssist(assistId))}>
                Lấy lại bản vừa viết
              </Button>
            )}
            <label className="flex items-start gap-2 text-sm th-text-secondary">
              <input
                type="checkbox"
                checked={!!draft.trimSpeech}
                onChange={(e) => change({ trimSpeech: e.target.checked })}
                className="th-accent-control mt-1"
              />
              Cắt bớt khoảng lặng trước và sau lời thoại. Phim ghép không bị kéo dài theo cảnh gốc.
            </label>

            <details className="border-t th-border pt-3">
              <summary className="cursor-pointer text-sm font-semibold th-text-primary">Âm thanh, phụ đề và khung hình</summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Select
                    aria-label="Âm thanh"
                    value={draft.audioMode}
                    onChange={(e) => change({ audioMode: e.target.value as Draft["audioMode"] })}
                  >
                    {(nativeAllowed.current || draft.audioMode === "native") && (
                      <option value="native">Nhân vật tự nói (chất lượng cao)</option>
                    )}
                    <option value="dubbed">Lồng tiếng theo giọng từng nhân vật</option>
                    <option value="fixed" disabled={draft.scenes.some((s) => s.storyboard)}>
                      Một giọng đọc, khớp môi · thử nghiệm
                    </option>
                  </Select>
                </div>
                <Select aria-label="Độ nét" value={draft.resolution} onChange={(e) => change({ resolution: e.target.value })}>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </Select>
                <Select aria-label="Khung hình" value={draft.format} onChange={(e) => change({ format: e.target.value })}>
                  {["16:9", "9:16", "1:1", "4:5"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
                <label className="col-span-2 flex items-center gap-2 text-sm th-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.subtitles}
                    onChange={(e) => change({ subtitles: e.target.checked })}
                    className="th-accent-control"
                  />
                  Gắn phụ đề
                </label>
              </div>
              {draft.audioMode === "dubbed" && (
                <p className="mt-3 text-xs th-text-secondary">
                  Mỗi lượt nói dùng đúng giọng đã duyệt của nhân vật. Cảnh được quay không tiếng rồi lồng giọng và làm
                  phụ đề; môi có thể chưa khớp từng chữ.
                </p>
              )}
              {!familyVoicesLocked && draft.audioMode === "fixed" && !enabled && (
                <p className="mt-3 text-xs th-text-secondary">
                  Bạn vẫn nghe và duyệt giọng mẫu được; kiểu một giọng đọc cả phim chưa mở.
                </p>
              )}
              {familyVoicesLocked ? (
                <p className="mt-3 rounded-xl border th-border th-bg-tertiary px-3 py-2 text-sm th-text-secondary">
                  Giọng các nhân vật chính đã được chốt cho kênh này. Mọi cảnh dùng đúng giọng đã duyệt.
                </p>
              ) : (
                draft.audioMode !== "native" &&
                characters
                  .filter((c) => cast.includes(c.id))
                  .map((c) => (
                    <div key={c.id} className="mt-3 border-t th-border pt-3">
                      <p className="text-sm th-text-primary">
                        {c.name}{" "}
                        {voices.find((v) => v.character_id === c.id && v.approved_at) ? "· đã có giọng duyệt" : "· chưa duyệt giọng"}
                      </p>
                      <div className="mt-2">
                        <Select
                          aria-label={`Giọng ${c.name}`}
                          disabled={!!busy}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value)
                              void act("Xem giá giọng", async () => {
                                const [provider, geminiModel, geminiVoicePreset] = e.target.value.split("|");
                                if (provider !== "gemini") throw new Error("Giọng này chưa dùng được. Chọn giọng khác nhé.");
                                const j = await api(`${base}/voices`, {
                                  workspaceVersion: workspace,
                                  characterId: c.id,
                                  geminiModel,
                                  geminiVoicePreset,
                                });
                                setVoiceQuote(j.quote);
                              });
                          }}
                        >
                          <option value="">Chọn giọng để nghe thử</option>
                          {GEMINI_TTS_MODELS.map((model) => (
                            <optgroup key={model.id} label={model.customerLabel}>
                              {Object.entries(GEMINI_VOICE_PRESETS).map(([id, voice]) => (
                                <option key={`${model.id}:${id}`} value={`gemini|${model.id}|${id}`}>
                                  {voice.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      </div>
                      <p className="mt-1 text-xs th-text-secondary">Nghe thử rồi duyệt giọng hợp với nhân vật.</p>
                    </div>
                  ))
              )}
              {!familyVoicesLocked && voiceQuote && (
                <div className="mt-3 space-y-2">
                  <PriceLine points={voiceQuote.points} available={available} />
                  <Button variant="outline" className="w-full" loading={busy === "Giọng mẫu"} onClick={() => act("Giọng mẫu", () => run(voiceQuote, true))}>
                    Làm giọng mẫu
                  </Button>
                </div>
              )}
            </details>

            {draft.story && draft.scenes.length > 0 && !draft.scenes.some((s) => s.storyboard) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  act("Chia cảnh", async () => {
                    const story = draft.story!;
                    const spoken = draft.scenes.filter((s) => s.dialogue);
                    if (
                      spoken.length !== story.dialogue.length ||
                      spoken.some(
                        (s, i) =>
                          s.dialogue !== story.dialogue[i].text || s.speakerCharacterId !== story.dialogue[i].characterId,
                      )
                    )
                      throw new Error("Lời thoại đã khác bản viết. Bấm Viết kịch bản để chia lại cảnh nhé.");
                    const board = compileStoryboards(
                      {
                        title: draft.title,
                        summary: draft.brief,
                        shots: Object.fromEntries(
                          draft.scenes.map((s, i) => [
                            `shot${i + 1}`,
                            {
                              ...s,
                              listenerCharacterIds: s.characterIds.filter((id) => id !== s.speakerCharacterId),
                            },
                          ]),
                        ),
                      },
                      story,
                      characters,
                      seedanceMaxDuration(draft.videoModel),
                    );
                    change({
                      audioMode: "dubbed",
                      scenes: board.scenes.map((s) => ({ ...sceneBlank(), ...s })),
                    });
                    setSelected(0);
                  })
                }
              >
                Chia lại thành phân cảnh
              </Button>
            )}
            {draft.scenes.some((s) => s.storyboard) && (
              <p className="text-sm th-text-secondary">
                {draft.scenes.length} cảnh · {draft.scenes.reduce((n, s) => n + s.durationSeconds, 0)} giây. Mỗi cảnh có
                bộ ảnh mẫu riêng và nhiều lượt đối đáp.
              </p>
            )}

            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chọn cảnh">
              {draft.scenes.map((s, i) => (
                <Chip key={s.id || i} role="radio" selected={selected === i} onClick={() => setSelected(i)}>
                  Cảnh {i + 1}
                  {s.storyboard ? ` · ${s.storyboard.durationSeconds} giây` : ""}
                </Chip>
              ))}
              <Chip
                aria-label="Thêm cảnh"
                disabled={draft.scenes.length >= 12}
                onClick={() => {
                  change({ scenes: [...draft.scenes, sceneBlank()] });
                  setSelected(draft.scenes.length);
                }}
              >
                <Plus size={14} aria-hidden />
              </Chip>
            </div>

            {scene && (
              <div className="space-y-3 rounded-xl border th-border p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm th-text-primary">Cảnh {selected + 1}</strong>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Đưa cảnh lên"
                      disabled={selected === 0}
                      onClick={() => {
                        const s = [...draft.scenes];
                        [s[selected - 1], s[selected]] = [s[selected], s[selected - 1]];
                        change({ scenes: s });
                        setSelected(selected - 1);
                      }}
                    >
                      <ArrowUp size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Đưa cảnh xuống"
                      disabled={selected === draft.scenes.length - 1}
                      onClick={() => {
                        const s = [...draft.scenes];
                        [s[selected + 1], s[selected]] = [s[selected], s[selected + 1]];
                        change({ scenes: s });
                        setSelected(selected + 1);
                      }}
                    >
                      <ArrowDown size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Xoá cảnh"
                      className="th-text-danger"
                      onClick={() => {
                        change({ scenes: draft.scenes.filter((_, i) => i !== selected) });
                        setSelected(Math.max(0, selected - 1));
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {[
                    ...characters.map((c) => ({ id: c.id, name: c.name })),
                    ...draft.guests.map((g) => ({ id: g.key, name: `${g.name} (khách mời)` })),
                  ].map((c) => (
                    <label key={c.id} className="flex min-h-10 items-center gap-1.5 text-xs th-text-primary">
                      <input
                        type="checkbox"
                        className="th-accent-control"
                        checked={scene.characterIds.includes(c.id)}
                        disabled={!!scene.storyboard?.beats.some((b) => b.speakerCharacterId === c.id)}
                        onChange={(e) =>
                          editScene({
                            characterIds: e.target.checked
                              ? [...scene.characterIds, c.id]
                              : scene.characterIds.filter((id) => id !== c.id),
                          })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                {!scene.storyboard && (
                  <Select
                    aria-label="Người nói"
                    value={scene.speakerCharacterId || ""}
                    onChange={(e) => editScene({ speakerCharacterId: e.target.value || null })}
                  >
                    <option value="">Không thoại</option>
                    {characters
                      .filter((c) => scene.characterIds.includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} nói
                        </option>
                      ))}
                  </Select>
                )}
                {scene.storyboard && (
                  <FilmStoryboardEditor
                    board={scene.storyboard}
                    control={control}
                    characters={characters.filter((c) => scene.characterIds.includes(c.id))}
                    onChange={(storyboard) =>
                      editScene({
                        storyboard,
                        dialogue: storyboardDialogue(storyboard),
                        speakerCharacterId: null,
                      })
                    }
                  />
                )}
                {(["dialogue", "action", "setting", "camera"] as const)
                  .filter((field) => !scene.storyboard || field === "setting")
                  .map((field) => (
                    <Textarea
                      key={field}
                      id={`scene-${field}`}
                      label={{ dialogue: "Lời thoại", action: "Hành động", setting: "Bối cảnh", camera: "Góc máy" }[field]}
                      className="min-h-16"
                      value={scene[field]}
                      onChange={(e) => editScene({ [field]: e.target.value })}
                    />
                  ))}
                <Input
                  id="scene-duration"
                  label="Độ dài cảnh (giây)"
                  type="number"
                  min={4}
                  max={30}
                  readOnly={!!scene.storyboard}
                  value={scene.durationSeconds}
                  onChange={(e) => editScene({ durationSeconds: Number(e.target.value) })}
                />
                {plan && !dirty && scene.id && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => act("Xem giá", () => getQuote("prepare", [scene.id!], true))}>
                      Làm lại hình và giọng cảnh này
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => act("Xem giá", () => getQuote("video", [scene.id!], true))}>
                      Quay lại cảnh này
                    </Button>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-sm th-text-secondary">Mô tả hình và chuyển động</summary>
                  <div className="mt-2 space-y-2">
                    {(["imagePrompt", "motionPrompt"] as const).map((f) => (
                      <Textarea
                        key={f}
                        aria-label={f === "imagePrompt" ? "Mô tả hình" : "Mô tả chuyển động"}
                        value={scene[f]}
                        onChange={(e) => editScene({ [f]: e.target.value })}
                      />
                    ))}
                  </div>
                </details>
                {plan && !dirty && scene.id && (
                  <label className={`${buttonClasses("outline", "sm")} w-full`}>
                    Thêm ảnh mẫu cho cảnh này
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void act("Thêm ảnh", async () => {
                            const form = new FormData();
                            form.set("file", file);
                            form.set("sceneId", scene.id!);
                            form.set("referenceImageId", scene.storyboard?.referencePlan?.referenceImages[0]?.id || "");
                            form.set("workspaceVersion", String(workspace));
                            form.set("expectedVersion", String(plan.version));
                            const r = await fetch(`${base}/video-plans/${plan.id}/references`, { method: "POST", body: form });
                            const j = await r.json();
                            if (!r.ok) throw new Error(j.error || "Chưa thêm được ảnh. Bạn thử lại nhé.");
                            setQuote(j.quote);
                          });
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            <Textarea
              id="film-caption"
              label="Nội dung bài đăng"
              value={draft.caption}
              onChange={(e) => change({ caption: e.target.value })}
            />
            {channel && plan && (
              <div className="text-sm th-text-secondary">
                <p>{!dirty && plan.script_review ? `Đã duyệt kịch bản bản ${plan.version}.` : "Kịch bản này chưa được duyệt."}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={!!busy || !draft.scenes.length || (!dirty && !!plan.script_review)}
                  onClick={() =>
                    act("Duyệt kịch bản", async () => {
                      const p = dirty ? await save() : plan;
                      const r = await api(`${base}/video-plans/${p.id}/review`, {
                        workspaceVersion: workspace,
                        expectedVersion: p.version,
                      });
                      setPlan(r.plan);
                      setPlans((ps) => ps.map((x) => (x.id === p.id ? r.plan : x)));
                      setNote("Đã duyệt kịch bản. Chưa làm hình hay quay cảnh nào.");
                    })
                  }
                >
                  Tôi đã đọc và duyệt kịch bản
                </Button>
              </div>
            )}

            <div
              className="sticky bottom-3 space-y-2 rounded-2xl border th-border p-3 th-bg-card th-shadow-md"
              style={{ paddingBottom: "max(12px,env(safe-area-inset-bottom))" }}
            >
              {quote && (
                <>
                  <PriceLine points={quote.points} available={available} />
                  <p className="text-xs th-text-tertiary">
                    {quote.items.map((i) => `${labels[i.kind]}: ${formatPoints(i.points)}`).join(" · ")}
                  </p>
                </>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={!!busy || (!draft.scenes.length && !draft.brief.trim()) || hasRunning}
                loading={busy === "Làm bước tiếp"}
                onClick={() =>
                  act("Làm bước tiếp", async () => {
                    if (quote) await run(quote);
                    else if (!draft.scenes.length) {
                      const generated = await write();
                      await save(generated);
                    } else if (dirty || !plan) await saveCurrent();
                    else await getQuote(stage, stageSceneIds);
                  })
                }
              >
                <Clapperboard size={16} aria-hidden />
                {hasRunning
                  ? "Đang làm · xem kết quả"
                  : quote
                    ? "Đồng ý và làm"
                    : !draft.scenes.length
                      ? "Viết và lưu kịch bản"
                      : dirty || !plan
                        ? "Lưu kịch bản"
                        : `Xem giá · ${stageNames[stage]}`}
              </Button>
            </div>
          </fieldset>
        </section>

        <section aria-label="Kết quả" className={`${tab === "results" ? "" : "hidden lg:block"} min-w-0`}>
          <h2 className="mb-3 text-lg font-semibold th-text-primary">Kết quả và duyệt</h2>
          {plan && directorReferenceTasks.length > 0 && (
            <section className="mb-4 rounded-2xl border th-border p-4 th-bg-card">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold th-text-primary">Ảnh mẫu của các cảnh</h3>
                  <p className="mt-1 text-sm th-text-secondary">
                    Ảnh 1 là toàn bộ phân cảnh để xem mạch hình. Các ảnh sau là ảnh mẫu cho từng cảnh và chi tiết quan
                    trọng.
                  </p>
                </div>
                <span className="shrink-0 rounded-full th-bg-secondary px-2.5 py-1 text-xs th-text-secondary">
                  {directorReferenceTasks.length} ảnh
                </span>
              </div>
              <div className="rounded-xl th-bg-secondary p-3">
                <p className="mb-2 text-xs font-semibold th-text-secondary">Ảnh 1 · Toàn bộ phân cảnh</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {directorReferenceTasks.map((task, index) => (
                    <div key={`board-${task.id}`} className="relative min-w-0">
                      {task.url ? (
                        <Image
                          unoptimized
                          width={480}
                          height={270}
                          src={task.url}
                          alt={`Phân cảnh ${index + 1}`}
                          className="aspect-video w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="aspect-video animate-pulse rounded-lg th-bg-card" />
                      )}
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {directorReferenceTasks.map((task, index) => {
                  const requirements = Array.isArray(task.input.visualRequirements)
                    ? (task.input.visualRequirements as Array<{ id?: string; description?: string; importance?: string }>)
                    : [];
                  return (
                    <article key={task.id} className="min-w-0 rounded-xl border th-border p-3">
                      <p className="text-sm font-semibold th-text-primary">
                        Ảnh {index + 2} · {String(task.input.referencePurpose || "Ảnh cảnh")}
                      </p>
                      <p className="mb-2 mt-1 text-xs th-text-secondary">
                        {task.input.referenceRole === "scene"
                          ? "Ảnh bố cục của cảnh"
                          : task.input.referenceRole === "character"
                            ? "Ảnh giữ đúng nhân vật"
                            : task.input.referenceRole === "prop"
                              ? "Ảnh cận đồ vật"
                              : "Ảnh bối cảnh"}
                      </p>
                      {task.url && (
                        <Image
                          unoptimized
                          width={720}
                          height={405}
                          src={task.url}
                          alt={String(task.input.referencePurpose || "Ảnh mẫu")}
                          className="max-h-80 w-full rounded-lg object-contain"
                        />
                      )}
                      {requirements.length > 0 && (
                        <div className="mt-2 text-xs th-text-secondary">
                          <strong className="th-text-primary">Người xem cần thấy:</strong>
                          <ul className="mt-1 list-disc space-y-1 pl-4">
                            {requirements.map((requirement) => (
                              <li key={requirement.id}>
                                {requirement.description}
                                {requirement.importance === "critical" ? " · bắt buộc" : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs th-text-secondary">
                        <span>{task.status === "completed" ? taskStatus(task) : "Đang làm"}</span>
                        {task.status === "completed" && !task.approved_at && !task.auto_accepted_at && (
                          <>
                            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("Duyệt ảnh", () => approve(task))}>
                              Đã xem, duyệt
                            </Button>
                            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setRegenerateTarget(task)}>
                              Làm lại
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {plan && !dirty && scene?.id && (
            <FilmSegmentEditor
              sceneIndex={selected}
              segments={segments}
              tasks={tasks}
              busy={!!busy}
              onSave={saveSegment}
              onQuote={quoteSegment}
              onUploadFrame={uploadSegmentFrame}
              onRun={(segmentQuote) => run(segmentQuote)}
              onSelectSource={selectSegmentSource}
              onRender={renderSegments}
            />
          )}
          {!displayTasks.length && (
            <EmptyState
              icon={Clapperboard}
              title="Chưa có kết quả"
              hint="Ảnh từng cảnh, giọng nghe thử và phim sẽ hiện ở đây."
            />
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {displayTasks.map((t) =>
              t.status === "failed" ? (
                <div key={t.id} className={t.kind === "render" ? "xl:col-span-2" : ""}>
                  <JobStatus
                    state="failed"
                    title={`${t.displayName ? `${t.displayName} · ` : ""}${labels[t.kind]}${t.scene_id ? ` · cảnh ${sceneNumberOf(t)}` : ""} chưa xong`}
                    detail={readableFailure(t.error)}
                    refundedPoints={t.refunded_points}
                    onRetry={
                      busy
                        ? undefined
                        : () =>
                            act("Thử lại", async () => {
                              await api(`${base}/film-tasks/${t.id}/retry`, { workspaceVersion: workspace });
                              await refresh();
                            })
                    }
                  />
                </div>
              ) : (
                <article
                  key={t.id}
                  className={`min-w-0 rounded-2xl border th-border p-3 th-bg-card ${t.kind === "render" ? "xl:col-span-2" : ""}`}
                >
                  <p className="mb-2 text-sm font-semibold th-text-primary">
                    {t.displayName ? `${t.displayName} · ` : ""}
                    {labels[t.kind]}
                    {t.scene_id ? ` · cảnh ${sceneNumberOf(t)}` : ""} · {taskStatus(t)}
                  </p>
                  {t.url && (t.kind === "image" || t.kind === "frame") ? (
                    <Image
                      unoptimized
                      width={720}
                      height={1280}
                      src={t.url}
                      alt="Ảnh cảnh cần duyệt nhân vật và bố cục"
                      className="max-h-96 w-full rounded-xl object-contain"
                    />
                  ) : t.url && t.kind === "tts" ? (
                    <audio controls preload="none" src={t.url} className="w-full" />
                  ) : t.url ? (
                    <video controls preload="none" poster={t.posterUrl} src={t.url} className="max-h-[560px] w-full rounded-xl" />
                  ) : null}
                  {t.kind === "transcribe" && (
                    <p className="text-sm th-text-primary">
                      {String(t.result?.text || "Đang chép lại lời đã nói…")}{" "}
                      {Number(t.result?.speechError) > (t.result?.transcriptSource === "locked_tts_schedule" ? 0.3 : 0.2)
                        ? "· Lời nói khác kịch bản, bạn nghe lại nhé."
                        : ""}
                    </p>
                  )}
                  {t.status === "completed" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {t.kind !== "transcribe" && !t.approved_at && !t.auto_accepted_at && (
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("Duyệt", () => approve(t))}>
                          {t.kind === "tts" ? "Đã nghe, duyệt" : t.kind === "render" ? "Duyệt phim" : "Đã xem, duyệt"}
                        </Button>
                      )}
                      {["image", "frame", "tts", "video", "lip_sync", "dub"].includes(t.kind) &&
                        !t.approved_at &&
                        !t.auto_accepted_at && (
                          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setRegenerateTarget(t)}>
                            Làm lại
                          </Button>
                        )}
                      {t.url && (
                        <a href={t.url} target="_blank" rel="noreferrer" download className={buttonClasses("ghost", "sm")}>
                          <Download size={14} aria-hidden />
                          {t.kind === "tts" ? "Tải giọng" : t.kind === "image" || t.kind === "frame" ? "Tải ảnh" : t.kind === "render" ? "Tải phim" : "Tải video"}
                        </a>
                      )}
                      {t.srtUrl && (
                        <a href={t.srtUrl} download className={buttonClasses("ghost", "sm")}>
                          <Download size={14} aria-hidden /> Tải phụ đề
                        </a>
                      )}
                    </div>
                  )}
                </article>
              ),
            )}
          </div>
        </section>
      </div>

      <PromptModal
        isOpen={Boolean(regenerateTarget)}
        onClose={() => setRegenerateTarget(null)}
        onSubmit={(reason) => {
          const target = regenerateTarget;
          setRegenerateTarget(null);
          if (target) void act("Làm lại", () => regenerate(target, reason));
        }}
        title="Làm lại phần này"
        message="Phần này sẽ được làm lại ở lần làm tiếp."
        label="Chỗ nào chưa đúng?"
        placeholder="Ví dụ: nhân vật đi giày, lẽ ra phải chân trần"
        confirmText="Ghi lại"
        multiline
      />

      <ConfirmModal
        isOpen={removePlanOpen}
        onClose={() => setRemovePlanOpen(false)}
        onConfirm={() => {
          setRemovePlanOpen(false);
          void removeCurrentPlan();
        }}
        title={plan && episodeHasHistory(plan) ? "Ẩn kịch bản này?" : "Xoá kịch bản này?"}
        message={
          plan && episodeHasHistory(plan)
            ? `“${plan.title}” sẽ không còn trong danh sách. Phim đã làm vẫn còn trong thư viện.`
            : `“${plan?.title ?? ""}” sẽ mất hẳn, không lấy lại được.`
        }
        confirmText={plan && episodeHasHistory(plan) ? "Ẩn kịch bản" : "Xoá kịch bản"}
        variant="danger"
      />

      <OutOfPointsModal
        open={pointsNeeded !== null}
        onClose={() => setPointsNeeded(null)}
        required={pointsNeeded ?? 1}
        current={available ?? 0}
        action="Bước này"
        onFunded={() => {
          setPointsNeeded(null);
          void wallet.refreshBalance();
          void refreshProduction();
        }}
      />
    </PageContainer>
  );
}
