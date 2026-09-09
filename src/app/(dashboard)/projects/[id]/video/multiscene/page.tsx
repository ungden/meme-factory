"use client";

import Image from "next/image";
import { FilmStoryboardEditor } from "@/components/film-storyboard-editor";
import { storyboardDialogue, type FilmStoryboard } from "@/lib/film-storyboard";
import { compileStoryboards } from "@/lib/family-ai-contract";
import type { ChannelProfile, Story } from "@/lib/family-catalogue";
import { notifyProjectBalanceChanged } from "@/lib/client-fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Clapperboard,
  LoaderCircle,
  Plus,
  Trash2,
  Wand2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import { useCharacters, useProject } from "@/lib/use-store";
import {
  GEMINI_TTS_MODELS,
  GEMINI_VOICE_PRESETS,
  currentSceneTask,
  speechTasks,
  finalClipKind,
  type FilmKind,
  type FilmPlan,
  type FilmScene,
  type FilmTask,
} from "@/lib/short-film/contracts";

type DraftScene = {
  storyboard?: FilmStoryboard | null;
  id?: string;
  characterIds: string[];
  speakerCharacterId: string | null;
  dialogue: string;
  action: string;
  setting: string;
  camera: string;
  imagePrompt: string;
  motionPrompt: string;
  durationSeconds: number;
  startImageUrl: string | null;
  endImageUrl: string | null;
  followsPrevious: boolean;
};
type Draft = {
  story?: Story | null;
  trimSpeech?: boolean;
  title: string;
  brief: string;
  caption: string;
  targetDurationSeconds: number;
  format: string;
  resolution: string;
  audioMode: "native" | "fixed" | "dubbed";
  subtitles: boolean;
  scenes: DraftScene[];
};
type Quote = {
  id: string;
  points: number;
  expires_at: string;
  items: { kind: string; points: number; sceneId?: string }[];
};
type ProductionRun = {
  id: string;
  plan_id: string | null;
  source: "manual" | "scheduled";
  status: string;
  phase: string;
  points_committed: number;
  max_points_per_film: number;
  error: string | null;
  created_at: string;
};
const blank = (): Draft => ({
  trimSpeech: true,
  title: "Phim ngắn",
  brief: "",
  caption: "",
  targetDurationSeconds: 30,
  format: "16:9",
  resolution: "720p",
  audioMode: "dubbed",
  subtitles: true,
  scenes: [],
});
const sceneBlank = (): DraftScene => ({
  characterIds: [],
  speakerCharacterId: null,
  dialogue: "",
  action: "",
  setting: "",
  camera: "",
  imagePrompt: "",
  motionPrompt: "",
  durationSeconds: 15,
  startImageUrl: null,
  endImageUrl: null,
  followsPrevious: false,
});
const fromScene = (s: FilmScene): DraftScene => ({
  id: s.id,
  storyboard: s.storyboard,
  characterIds: s.cast_snapshot.map((c) => c.characterId),
  speakerCharacterId: s.speaker_character_id,
  dialogue: s.dialogue,
  action: s.action,
  setting: s.setting,
  camera: s.camera,
  imagePrompt: s.image_prompt,
  motionPrompt: s.motion_prompt,
  durationSeconds: s.duration_seconds,
  startImageUrl: s.start_image_url,
  endImageUrl: s.end_image_url,
  followsPrevious: s.follows_previous,
});
const fromPlan = (p: FilmPlan): Draft => ({
  title: p.title,
  brief: p.brief,
  caption: p.caption,
  story: p.story,
  trimSpeech: p.trim_speech !== false,
  targetDurationSeconds: p.target_duration_seconds || 30,
  format: p.format,
  resolution: p.resolution,
  audioMode: p.audio_mode === "native" ? "dubbed" : p.audio_mode,
  subtitles: p.subtitles,
  scenes: p.video_plan_scenes.map(fromScene),
});
const labels: Record<string, string> = {
  image: "Ảnh đầu",
  frame: "Khung nối tiếp",
  voice_design: "Thiết kế giọng",
  tts: "Giọng nói",
  video: "Chuyển động",
  lip_sync: "Đồng bộ môi",
  dub: "Lồng tiếng",
  transcribe: "Kiểm tra lời",
  render: "Phim hoàn chỉnh",
};
async function api(url: string, body?: unknown, method = "POST") {
  const r = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(j.error || "Không kết nối được. Nội dung vẫn được giữ.");
  return j;
}

export default function ShortFilmPage() {
  const { id: ref } = useParams<{ id: string }>();
  const { project } = useProject(ref);
  const { characters } = useCharacters(ref);
  const base = `/api/projects/${ref}`;
  const [draft, setDraft] = useState<Draft>(blank);
  const [plan, setPlan] = useState<FilmPlan | null>(null);
  const [conflict, setConflict] = useState<Draft | null>(null);
  const [channel, setChannel] = useState<ChannelProfile | null>(null);
  const [plans, setPlans] = useState<FilmPlan[]>([]);
  const [ideas, setIdeas] = useState<{ title: string; idea: string }[]>([]);
  const [tasks, setTasks] = useState<FilmTask[]>([]);
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
  const [maxFilm, setMaxFilm] = useState("");
  const [maxDay, setMaxDay] = useState("");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTime, setAutoTime] = useState("09:00");
  const [queuedPlanIds, setQueuedPlanIds] = useState<string[]>([]);
  const [automationOwner, setAutomationOwner] = useState(false);
  const lock = useRef(false),
    edited = useRef(false),
    generation = useRef(0);
  const requestKeys = useRef<Record<string, string>>({});
  const change = (patch: Partial<Draft>) => {
    edited.current = true;
    setDirty(true);
    setQuote(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const editScene = (patch: Partial<DraftScene>) =>
    change({
      scenes: draft.scenes.map((s, i) =>
        i === selected ? { ...s, ...patch } : s,
      ),
    });
  const refresh = useCallback(async () => {
    if (!plan) return;
    const g = generation.current;
    const j = await api(`${base}/video-plans/${plan.id}`);
    if (g !== generation.current) return;
    setTasks(j.tasks || []);
  }, [base, plan]);
  const refreshVoices = useCallback(async () => {
    const g = generation.current;
    const j = await api(`${base}/voices`);
    if (g !== generation.current) return;
    setVoices(j.voices || []);
    setVoiceTasks(j.tasks || []);
  }, [base]);
  const refreshProduction = useCallback(async () => {
    const [runs, automation] = await Promise.all([
      api(`${base}/production-runs`),
      api(`${base}/film-automation`),
    ]);
    setProductionRuns(runs.runs || []);
    setAutomationOwner(automation.owner === true);
    if (automation.automation) {
      setAutoEnabled(automation.automation.enabled === true);
      setAutoTime(
        String(automation.automation.local_time || "09:00").slice(0, 5),
      );
      setMaxFilm(String(automation.automation.max_points_per_film));
      setMaxDay(String(automation.automation.max_points_per_day));
      setQueuedPlanIds(
        Array.isArray(automation.automation.queued_plan_ids)
          ? automation.automation.queued_plan_ids
          : [],
      );
    }
  }, [base]);
  useEffect(() => {
    const g = ++generation.current;
    edited.current = false;
    setReady(false);
    setConflict(null);
    setTasks([]);
    setVoiceTasks([]);
    setVoices([]);
    setVoiceQuote(null);
    setAssistId(null);
    setCast([]);
    setDraft(blank());
    setDirty(false);
    setNote("");
    setPlan(null);
    setQuote(null);
    setError("");
    api(`${base}/video-plans`)
      .then((j) => {
        if (g !== generation.current) return;
        setPlans(j.plans || []);
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
        const p = (
          savedId === null
            ? undefined
            : j.plans?.find((p: FilmPlan) => p.id === savedId) || j.plans?.[0]
        ) as FilmPlan | undefined;
        const key = `aida:film:${j.accountId}:${ref}:${j.workspaceVersion}`;
        setStorageKey(key);
        setWorkspace(j.workspaceVersion);
        setEnabled(j.fixedVoiceEnabled);
        if (j.latestAssist?.status !== "failed")
          setAssistId(j.latestAssist?.id || null);
        let initial = p
          ? fromPlan(p)
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
                audioMode:
                  saved.draft.audioMode === "native"
                    ? "dubbed"
                    : saved.draft.audioMode,
              };
              setDirty(saved.dirty);
              setCast(saved.cast || []);
            } else {
              if (saved.dirty && saved.draft) {
                setConflict(saved.draft);
                localStorage.setItem(`${key}:conflict`, raw);
              }
              setNote(
                "Có bản cục bộ cũ; bản trên server được mở để tránh ghi đè.",
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
  }, [base, ref, refreshProduction]);
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
      setError(e instanceof Error ? e.message : "Thao tác chưa hoàn tất.");
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function save(nextDraft: Draft = draft) {
    const currentPlan = plan;
    const j = await api(
      `${base}/video-plans${currentPlan ? "/" + currentPlan.id : ""}`,
      {
        ...nextDraft,
        workspaceVersion: workspace,
        expectedVersion: currentPlan?.version,
      },
      currentPlan ? "PUT" : "POST",
    );
    setPlan(j.plan);
    setPlans((ps) => [j.plan, ...ps.filter((p) => p.id !== j.plan.id)]);
    setDraft(fromPlan(j.plan));
    setDirty(false);
    edited.current = false;
    setQuote(null);
    if (!currentPlan && storageKey)
      localStorage.removeItem(`${storageKey}:new-draft`);
    setNote("Đã lưu. Kết quả cũ vẫn giữ trong lịch sử.");
    return j.plan as FilmPlan;
  }
  async function openEpisode(id: string) {
    if (id === (plan?.id || "")) return;
    if (dirty && plan && draft.scenes.length) await save();
    else if (dirty && plan)
      throw new Error(
        "Kịch bản đang sửa cần ít nhất một cảnh trước khi đổi tập.",
      );
    else if (dirty && storageKey)
      localStorage.setItem(
        `${storageKey}:new-draft`,
        JSON.stringify({ draft, cast, savedAt: new Date().toISOString() }),
      );
    generation.current++;
    const next = id ? await api(`${base}/video-plans/${id}`) : null;
    let nextDraft = next
      ? fromPlan(next.plan)
      : { ...blank(), targetDurationSeconds: 35 };
    let nextCast =
      next?.plan.cast_snapshot.map(
        (c: { characterId: string }) => c.characterId,
      ) || [];
    let nextDirty = false;
    if (!next && storageKey) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(`${storageKey}:new-draft`) || "null",
        );
        if (saved?.draft) {
          nextDraft = saved.draft;
          nextCast = Array.isArray(saved.cast) ? saved.cast : [];
          nextDirty = true;
        }
      } catch {
        localStorage.removeItem(`${storageKey}:new-draft`);
      }
    }
    setPlan(next?.plan || null);
    setDraft(nextDraft);
    setTasks(next?.tasks || []);
    setCast(nextCast);
    setQuote(null);
    setSelected(0);
    setDirty(nextDirty);
    edited.current = nextDirty;
    setAssistId(null);
    setNote(next ? "" : nextDirty ? "Đã khôi phục ý tưởng của Tập mới." : "");
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
    throw new Error("Gợi ý vẫn đang xử lý. Hãy thử lại sau.");
  }
  async function readAssist(jobId: string): Promise<Draft> {
    const g = generation.current;
    for (let n = 0; n < 110; n++) {
      if (g !== generation.current) throw new Error("Đã chuyển dự án.");
      const j = await api(`${base}/creative-assists/${jobId}`);
      if (j.job.status === "failed")
        throw new Error(
          j.job.error?.message ||
            "AI chưa tìm được bản đủ tốt hoặc chưa hoàn tất lượt soạn. Bản trước vẫn được giữ.",
        );
      if (j.job.status === "completed") {
        if (g !== generation.current) throw new Error("Đã chuyển dự án.");
        const generated = {
          ...draft,
          title: j.job.result.title || draft.title,
          brief: j.job.intent || draft.brief,
          caption: j.job.result.caption || draft.caption,
          story: j.job.result.story || null,
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
      "AI vẫn đang xử lý. Có thể lấy lại kết quả bằng nút khôi phục.",
    );
  }
  async function write(): Promise<Draft> {
    if (!draft.brief.trim())
      throw new Error("Chọn Gợi ý cho dự án hoặc nhập một ý tưởng.");
    const start = await api(`${base}/creative-assists`, {
      kind: "video_plan",
      intent: draft.brief,
      selectedCharacterIds: cast,
      targetDurationSeconds: draft.targetDurationSeconds,
      workspaceVersion: workspace,
    });
    setAssistId(start.jobId);
    return readAssist(start.jobId);
  }
  async function createFilm() {
    const filmCap = Number(maxFilm),
      dayCap = Number(maxDay);
    if (
      !Number.isInteger(filmCap) ||
      !Number.isInteger(dayCap) ||
      filmCap <= 0 ||
      dayCap < filmCap
    )
      throw new Error("Nhập trần điểm mỗi phim và mỗi ngày trước khi chạy.");
    let selectedPlan = plan;
    if (
      draft.scenes.length &&
      (dirty || !plan || plan.audio_mode !== draft.audioMode)
    )
      selectedPlan = await save();
    const storage = `film-production-key:${ref}:${selectedPlan?.id || "new"}:${selectedPlan?.version || draft.brief}`;
    const key = localStorage.getItem(storage) || crypto.randomUUID();
    localStorage.setItem(storage, key);
    const response = await api(`${base}/production-runs`, {
      planId: selectedPlan?.id || null,
      intent: selectedPlan ? "" : draft.brief,
      maxPointsPerFilm: filmCap,
      maxPointsPerDay: dayCap,
      idempotencyKey: key,
    });
    setNote(`Đã nhận lượt sản xuất ${response.runId}. Có thể rời trang.`);
    await refreshProduction();
    setTab("results");
  }
  async function saveAutomation(nextEnabled = autoEnabled) {
    const filmCap = Number(maxFilm),
      dayCap = Number(maxDay);
    if (
      !Number.isInteger(filmCap) ||
      !Number.isInteger(dayCap) ||
      filmCap <= 0 ||
      dayCap < filmCap
    )
      throw new Error(
        "Nhập trần điểm mỗi phim và mỗi ngày trước khi lưu tự động.",
      );
    const j = await api(
      `${base}/film-automation`,
      {
        enabled: nextEnabled,
        localTime: autoTime,
        maxPointsPerFilm: filmCap,
        maxPointsPerDay: dayCap,
        queuedPlanIds,
      },
      "PUT",
    );
    setAutoEnabled(j.automation.enabled);
    setNote(
      j.automation.enabled
        ? "Đã bật: mỗi ngày một phim, ưu tiên hàng đợi kịch bản."
        : "Đã tắt lịch mới; lượt đã nhận vẫn tiếp tục.",
    );
  }
  async function controlProduction(
    run: ProductionRun,
    action: "pause" | "resume" | "cancel",
  ) {
    await api(
      `${base}/production-runs/${run.id}`,
      {
        action,
        maxPointsPerFilm: Number(maxFilm),
        maxPointsPerDay: Number(maxDay),
      },
      "PATCH",
    );
    await refreshProduction();
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
  const hasRunning = [...currentTasks, ...voiceTasks].some((t) =>
    ["queued", "running", "reconciling"].includes(t.status),
  );
  const latest = (s: FilmScene, k: FilmKind) =>
    currentSceneTask(currentTasks, s, k, draft.audioMode);
  let stage = "prepare";
  if (plan?.video_plan_scenes.length && !dirty) {
    const ss = plan.video_plan_scenes;
    const prepared = ss.every(
      (s) =>
        latest(s, "image")?.approved_at &&
        (!s.dialogue ||
          draft.audioMode === "native" ||
          (draft.audioMode === "dubbed"
            ? speechTasks(currentTasks, s).every((t) => t?.approved_at)
            : latest(s, "tts")?.approved_at)),
    );
    if (prepared) stage = "video";
    if (prepared && ss.every((s) => latest(s, "video"))) stage = "finish";
    if (
      stage === "finish" &&
      draft.audioMode !== "native" &&
      ss.every(
        (s) => !s.dialogue || latest(s, finalClipKind(s, draft.audioMode)),
      )
    )
      stage = "transcript";
    if (
      ss.every(
        (s) =>
          latest(s, finalClipKind(s, draft.audioMode))?.approved_at &&
          (!s.dialogue || latest(s, "transcribe")),
      )
    )
      stage = "render";
  }
  const stageNames: Record<string, string> = {
    prepare: "Chuẩn bị ảnh và thoại",
    video: "Tạo chuyển động",
    finish:
      draft.audioMode === "dubbed"
        ? "Lồng tiếng từng lượt"
        : draft.audioMode === "fixed"
          ? "Đồng bộ môi"
          : "Kiểm tra lời thoại",
    transcript: "Kiểm tra lời thoại",
    render: "Ghép phim",
  };
  const control =
    "w-full rounded-lg border th-border px-3 py-2 th-bg-input th-text-primary text-sm";
  return (
    <div className="flex">
      <Sidebar projectId={ref} projectName={project?.name} />
      <main className="min-h-dvh min-w-0 flex-1 px-4 pb-24 pt-20 lg:ml-56 lg:p-6">
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-5">
            <h1 className="text-2xl font-semibold th-text-primary">
              Tạo phim ngắn
            </h1>
            <p className="mt-1 text-sm th-text-secondary">
              Seedance tạo chuyển động; Gemini lồng tiếng theo từng nhân vật.
              AIDA chép audio thật để làm phụ đề và ghép phim.
            </p>
          </header>
          <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1 text-sm th-text-secondary">
              Kịch bản đã lưu · {plans.length}
              <select
                aria-label="Chọn kịch bản"
                className={control}
                value={plan?.id || ""}
                disabled={!!busy || !ready}
                onChange={(e) =>
                  act("Mở kịch bản", () => openEpisode(e.target.value))
                }
              >
                <option value="">Tập mới</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · bản {p.version}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="min-h-11 rounded-lg border th-border px-3 text-sm th-text-primary"
              disabled={!!busy || !ready}
              onClick={() => act("Tập mới", () => openEpisode(""))}
            >
              + Tập mới
            </button>
          </div>
          {channel && (
            <details className="mb-3 text-sm th-text-secondary">
              <summary className="cursor-pointer">
                Hồ sơ kênh · bản {channel.version}
              </summary>
              <p className="mt-2">{channel.positioning}</p>
              <p>{channel.tone}</p>
              <ul className="mt-2 space-y-1">
                {channel.roles.map((r) => (
                  <li key={r.characterId}>
                    <strong>{r.name}:</strong> {r.personality}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {draft.story && (
            <details className="mb-4 rounded-xl border th-border p-4 th-bg-card th-text-primary">
              <summary className="cursor-pointer font-semibold">
                {draft.story.series} · Câu chuyện của tập
              </summary>
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
                <summary className="cursor-pointer">
                  Đọc liền mạch lời thoại
                </summary>
                <ol className="mt-2 space-y-2">
                  {draft.scenes
                    .filter((s) => s.dialogue)
                    .map((s, i) => (
                      <li key={i}>
                        <strong>
                          {
                            characters.find(
                              (c) => c.id === s.speakerCharacterId,
                            )?.name
                          }
                          :
                        </strong>{" "}
                        {s.dialogue}
                      </li>
                    ))}
                </ol>
              </details>
              <p className="mt-3 text-xs th-text-secondary">
                {!dirty && plan?.script_review
                  ? "Bản chữ đã duyệt."
                  : "Bản chữ chờ duyệt."}{" "}
                Khi sửa thoại, kiểm tra lại nhịp truyện; thời lượng cuối tính từ
                audio thật.
              </p>
            </details>
          )}
          <div className="mb-4 flex gap-2 lg:hidden">
            {(["settings", "results"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className="min-h-11 rounded-lg border th-border px-4 th-text-primary"
              >
                {v === "settings" ? "Thiết lập" : "Kết quả"}
              </button>
            ))}
          </div>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg p-3 th-bg-danger-light th-text-danger"
            >
              {error}
            </p>
          )}
          {conflict && (
            <div className="mb-3 rounded-lg border th-border p-3 text-sm th-text-primary">
              Có bản chưa đồng bộ được giữ riêng.
              <button
                disabled={!!busy}
                className="ml-2 min-h-11 th-text-accent"
                onClick={() => {
                  change(conflict);
                  setConflict(null);
                  localStorage.removeItem(`${storageKey}:conflict`);
                }}
              >
                Khôi phục để đối chiếu
              </button>
            </div>
          )}
          {note && (
            <p role="status" className="mb-4 text-sm th-text-secondary">
              {note}
            </p>
          )}
          <section className="mb-5 rounded-xl border th-border p-4 th-bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold th-text-primary">
                  Tạo phim một lần
                </h2>
                <p className="mt-1 text-sm th-text-secondary">
                  Dùng kịch bản đang chọn. Ở “Tập mới”, ý tưởng có thể để trống
                  để AI tự đề xuất.
                </p>
              </div>
              <button
                disabled={
                  !!busy ||
                  !ready ||
                  (draft.audioMode === "fixed" && !enabled) ||
                  productionPollingKey.length > 0
                }
                onClick={() => act("Tạo phim", createFilm)}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-5 font-semibold text-[var(--text-on-accent)] disabled:opacity-60"
              >
                {productionPollingKey
                  ? "Đang sản xuất"
                  : draft.audioMode === "fixed" && !enabled
                    ? "Lồng tiếng đang thử nghiệm"
                    : `Tạo phim · tối đa ${maxFilm || "…"} điểm`}
              </button>
            </div>
            {automationOwner && plans.length > 0 && (
              <details className="mt-3 rounded-lg border th-border p-3">
                <summary className="cursor-pointer text-sm font-medium th-text-primary">
                  Hàng đợi kịch bản · {queuedPlanIds.length} tập
                </summary>
                <p className="mt-2 text-xs th-text-secondary">
                  Lịch dùng kịch bản theo thứ tự này; hết hàng đợi AI mới tự
                  viết tập mới.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {plans
                    .filter(
                      (candidate) =>
                        !["completed", "approved", "cancelled"].includes(
                          candidate.status,
                        ),
                    )
                    .map((candidate) => (
                      <label
                        key={candidate.id}
                        className="flex min-h-11 items-center gap-2 rounded-lg th-bg-secondary px-3 text-sm th-text-primary"
                      >
                        <input
                          type="checkbox"
                          checked={queuedPlanIds.includes(candidate.id)}
                          onChange={(event) =>
                            setQueuedPlanIds((current) =>
                              event.target.checked
                                ? [...current, candidate.id]
                                : current.filter((id) => id !== candidate.id),
                            )
                          }
                        />
                        <span className="truncate">{candidate.title}</span>
                      </label>
                    ))}
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act("Lưu hàng đợi", () => saveAutomation())}
                  className="mt-3 min-h-10 rounded-lg border th-border px-3 text-sm th-text-accent"
                >
                  Lưu giờ, ngân sách và hàng đợi
                </button>
              </details>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs th-text-secondary">
                Trần điểm / phim
                <input
                  aria-label="Trần điểm mỗi phim"
                  inputMode="numeric"
                  value={maxFilm}
                  onChange={(e) =>
                    setMaxFilm(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Bắt buộc"
                  className={`${control} mt-1`}
                />
              </label>
              <label className="text-xs th-text-secondary">
                Trần điểm / ngày
                <input
                  aria-label="Trần điểm mỗi ngày"
                  inputMode="numeric"
                  value={maxDay}
                  onChange={(e) => setMaxDay(e.target.value.replace(/\D/g, ""))}
                  placeholder="Bắt buộc"
                  className={`${control} mt-1`}
                />
              </label>
              {automationOwner && (
                <label className="text-xs th-text-secondary">
                  Giờ tự chạy
                  <input
                    aria-label="Giờ tự chạy"
                    type="time"
                    value={autoTime}
                    onChange={(e) => setAutoTime(e.target.value)}
                    className={`${control} mt-1`}
                  />
                </label>
              )}
              {automationOwner && (
                <label className="flex min-h-11 items-center gap-2 self-end text-sm th-text-primary">
                  <input
                    type="checkbox"
                    checked={autoEnabled}
                    onChange={(e) =>
                      act("Lưu tự động", () => saveAutomation(e.target.checked))
                    }
                  />
                  Tự sản xuất hằng ngày
                </label>
              )}
            </div>
            {productionRuns[0] && (
              <div className="mt-3 rounded-lg th-bg-secondary p-3 text-sm th-text-primary">
                <strong>
                  {productionRuns[0].source === "scheduled"
                    ? "Tự động"
                    : "Tạo ngay"}
                </strong>
                {" · "}
                {(
                  {
                    script: "Viết kịch bản",
                    script_check: "Kiểm tra kịch bản",
                    prepare: "Chuẩn bị hình và tiếng",
                    video: "Tạo cảnh",
                    finish: "Chép lời và làm phụ đề",
                    transcript: "Kiểm tra lời",
                    render: "Ghép phim",
                    ready_review: "Sẵn sàng duyệt",
                  } as Record<string, string>
                )[productionRuns[0].phase] || productionRuns[0].phase}
                {" · "}
                {productionRuns[0].points_committed}/
                {productionRuns[0].max_points_per_film} điểm tối đa
                {productionRuns[0].error && (
                  <p className="mt-1 th-text-danger">
                    {productionRuns[0].error}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {["queued", "scripting", "running"].includes(
                    productionRuns[0].status,
                  ) && (
                    <button
                      className="min-h-10 rounded-lg border th-border px-3"
                      onClick={() =>
                        act("Tạm dừng", () =>
                          controlProduction(productionRuns[0], "pause"),
                        )
                      }
                    >
                      Tạm dừng
                    </button>
                  )}
                  {["paused", "needs_review", "budget_blocked"].includes(
                    productionRuns[0].status,
                  ) && (
                    <button
                      className="min-h-10 rounded-lg border th-border px-3 th-text-accent"
                      onClick={() =>
                        act("Tiếp tục", () =>
                          controlProduction(productionRuns[0], "resume"),
                        )
                      }
                    >
                      Tiếp tục
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(
                    productionRuns[0].status,
                  ) && (
                    <button
                      className="min-h-10 rounded-lg border th-border px-3 th-text-danger"
                      onClick={() =>
                        act("Hủy lượt", () =>
                          controlProduction(productionRuns[0], "cancel"),
                        )
                      }
                    >
                      Hủy phần chưa gửi
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
            <section
              className={`${tab === "settings" ? "" : "hidden lg:block"} min-w-0 rounded-xl border th-border p-4 th-bg-card`}
            >
              <fieldset disabled={!!busy || !ready}>
                <label className="text-sm font-semibold th-text-primary">
                  Bạn muốn kể câu chuyện gì?
                  <textarea
                    disabled={!ready || !!busy}
                    className={`${control} mt-2 min-h-24`}
                    value={draft.brief}
                    onChange={(e) => change({ brief: e.target.value })}
                    placeholder="Cả nhà cùng làm bánh, nhưng Đậu Đỏ giấu mất phần nhân…"
                  />
                </label>
                <button
                  className="mt-2 min-h-11 text-sm th-text-accent"
                  disabled={!!busy}
                  onClick={() => act("Gợi ý", suggest)}
                >
                  Gợi ý cho dự án
                </button>
                {ideas.map((idea, i) => (
                  <button
                    key={i}
                    className="my-1 block w-full rounded-lg border th-border p-2 text-left text-sm th-text-primary"
                    onClick={() => {
                      change({ brief: idea.idea });
                      setIdeas([]);
                    }}
                  >
                    {idea.title}
                  </button>
                ))}
                <div className="my-3 flex flex-wrap gap-2">
                  {characters.map((c) => (
                    <button
                      key={c.id}
                      disabled={!!busy}
                      onClick={() => {
                        edited.current = true;
                        setDirty(true);
                        setQuote(null);
                        setCast((v) =>
                          v.includes(c.id)
                            ? v.filter((id) => id !== c.id)
                            : [...v, c.id].slice(0, 4),
                        );
                      }}
                      className={`min-h-11 rounded-lg border th-border px-3 text-sm ${cast.includes(c.id) ? "th-bg-accent-light th-text-accent" : "th-text-secondary"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Thời lượng phim"
                    value={draft.targetDurationSeconds}
                    className={control}
                    onChange={(e) =>
                      change({ targetDurationSeconds: Number(e.target.value) })
                    }
                  >
                    {(channel ? [30, 35, 40, 60] : [15, 30, 35, 40, 60]).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n} giây dự kiến
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    disabled={!ready || !!busy}
                    onClick={() => act("AI viết", write)}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-[var(--text-on-accent)]"
                  >
                    <Wand2 size={17} /> AI viết phim
                  </button>
                </div>
                {assistId && (
                  <button
                    disabled={!!busy}
                    className="mt-3 min-h-11 rounded-lg border th-border px-3 text-sm th-text-accent"
                    onClick={() =>
                      act("Lấy bản AI", () => readAssist(assistId))
                    }
                  >
                    Lấy lại bản AI gần nhất
                  </button>
                )}
                <label className="mt-3 flex items-start gap-2 text-sm th-text-secondary">
                  <input
                    type="checkbox"
                    checked={!!draft.trimSpeech}
                    onChange={(e) => change({ trimSpeech: e.target.checked })}
                    className="mt-1"
                  />
                  Rút phần đệm trước/sau thoại theo transcript, giữ 0,2 giây
                  trước và 0,5 giây sau. Cảnh phản ứng và storyboard 15 giây giữ
                  nguyên.
                </label>
                <details className="mt-4 border-t pt-3">
                  <summary className="cursor-pointer text-sm font-semibold th-text-primary">
                    Âm thanh, phụ đề và định dạng
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      aria-label="Âm thanh"
                      className={control}
                      value={draft.audioMode}
                      onChange={(e) =>
                        change({
                          audioMode: e.target.value as Draft["audioMode"],
                        })
                      }
                    >
                      <option value="dubbed">
                        Lồng tiếng Gemini theo từng nhân vật
                      </option>
                      <option
                        value="fixed"
                        disabled={draft.scenes.some((s) => s.storyboard)}
                      >
                        Đồng bộ môi một người · thử nghiệm
                      </option>
                    </select>
                    <select
                      aria-label="Độ phân giải"
                      className={control}
                      value={draft.resolution}
                      onChange={(e) => change({ resolution: e.target.value })}
                    >
                      <option>720p</option>
                      <option>1080p</option>
                    </select>
                    <select
                      aria-label="Tỷ lệ"
                      className={control}
                      value={draft.format}
                      onChange={(e) => change({ format: e.target.value })}
                    >
                      {["16:9", "9:16", "1:1", "4:5"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm th-text-primary">
                      <input
                        type="checkbox"
                        checked={draft.subtitles}
                        onChange={(e) =>
                          change({ subtitles: e.target.checked })
                        }
                      />
                      Gắn phụ đề
                    </label>
                  </div>
                  {draft.audioMode === "dubbed" && (
                    <p className="mt-3 text-xs th-text-secondary">
                      Mỗi lượt nói dùng đúng giọng đã duyệt của nhân vật.
                      Seedance tạo hình im tiếng; AIDA lồng tiếng và chép audio
                      thực để làm phụ đề. Khớp môi cần xem lại trên thành phẩm.
                    </p>
                  )}
                  {draft.audioMode === "fixed" && !enabled && (
                    <p className="mt-3 text-xs th-text-secondary">
                      Có thể nghe và duyệt mẫu Gemini; nhánh lồng tiếng và
                      lip-sync chỉ mở sau bài kiểm chứng.
                    </p>
                  )}
                  {draft.audioMode !== "native" &&
                    characters
                      .filter((c) => cast.includes(c.id))
                      .map((c) => (
                        <div key={c.id} className="mt-3 border-t pt-3">
                          <p className="text-sm th-text-primary">
                            {c.name}{" "}
                            {voices.find(
                              (v) => v.character_id === c.id && v.approved_at,
                            )
                              ? "· đã có giọng duyệt"
                              : "· chưa duyệt giọng"}
                          </p>
                          <select
                            aria-label={`Giọng ${c.name}`}
                            className={`${control} mt-2`}
                            disabled={!!busy}
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value)
                                void act("Báo giá giọng", async () => {
                                  const [
                                    provider,
                                    geminiModel,
                                    geminiVoicePreset,
                                  ] = e.target.value.split("|");
                                  if (provider !== "gemini")
                                    throw new Error(
                                      "Lựa chọn giọng không hợp lệ.",
                                    );
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
                              <optgroup key={model.id} label={model.label}>
                                {Object.entries(GEMINI_VOICE_PRESETS).map(
                                  ([id, voice]) => (
                                    <option
                                      key={`${model.id}:${id}`}
                                      value={`gemini|${model.id}|${id}`}
                                    >
                                      {voice.label} · {voice.voice}
                                    </option>
                                  ),
                                )}
                              </optgroup>
                            ))}
                          </select>
                          <p className="mt-1 text-xs th-text-secondary">
                            Gemini không có preset “trẻ em” chính thức. AIDA
                            điều khiển tuổi và giới tính bằng chỉ dẫn; cần nghe
                            rồi duyệt.
                          </p>
                        </div>
                      ))}
                  {voiceQuote && (
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        act("Tạo giọng mẫu", () => run(voiceQuote, true))
                      }
                      className="mt-3 min-h-11 w-full rounded-lg border th-border px-3 th-text-accent"
                    >
                      Tạo giọng mẫu · {voiceQuote.points} điểm
                    </button>
                  )}
                </details>
                {draft.story &&
                  draft.scenes.length > 0 &&
                  !draft.scenes.some((s) => s.storyboard) && (
                    <button
                      className="mt-4 min-h-11 rounded-lg border th-border px-3 text-sm th-text-accent"
                      onClick={() =>
                        act("Gom storyboard", async () => {
                          const story = draft.story!;
                          const spoken = draft.scenes.filter((s) => s.dialogue);
                          if (
                            spoken.length !== story.dialogue.length ||
                            spoken.some(
                              (s, i) =>
                                s.dialogue !== story.dialogue[i].text ||
                                s.speakerCharacterId !==
                                  story.dialogue[i].characterId,
                            )
                          )
                            throw new Error(
                              "Thoại đã thay đổi so với bản chữ. Hãy dùng AI viết phim để soạn storyboard mới từ ý tưởng hiện tại.",
                            );
                          const board = compileStoryboards(
                            {
                              title: draft.title,
                              summary: draft.brief,
                              shots: Object.fromEntries(
                                draft.scenes.map((s, i) => [
                                  `shot${i + 1}`,
                                  {
                                    ...s,
                                    listenerCharacterIds: s.characterIds.filter(
                                      (id) => id !== s.speakerCharacterId,
                                    ),
                                  },
                                ]),
                              ),
                            },
                            story,
                            characters,
                          );
                          change({
                            audioMode: "dubbed",
                            scenes: board.scenes.map((s) => ({
                              ...sceneBlank(),
                              ...s,
                            })),
                          });
                          setSelected(0);
                        })
                      }
                    >
                      Gom thành storyboard 15 giây
                    </button>
                  )}
                {draft.scenes.some((s) => s.storyboard) && (
                  <p className="mt-4 text-sm th-text-secondary">
                    Storyboard · {draft.scenes.length} đoạn ·{" "}
                    {draft.scenes.reduce((n, s) => n + s.durationSeconds, 0)}{" "}
                    giây clip gốc. Mỗi đoạn có ảnh đầu riêng và nhiều nhịp đối
                    đáp.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {draft.scenes.map((s, i) => (
                    <button
                      key={s.id || i}
                      onClick={() => setSelected(i)}
                      className={`min-h-11 rounded-lg border th-border px-3 text-sm ${selected === i ? "th-bg-accent-light th-text-accent" : "th-text-primary"}`}
                    >
                      {s.storyboard ? "Đoạn" : "Cảnh"} {i + 1}
                      {s.storyboard ? " · 15s" : ""}
                    </button>
                  ))}
                  <button
                    aria-label="Thêm cảnh"
                    disabled={draft.scenes.length >= 12}
                    onClick={() => {
                      change({ scenes: [...draft.scenes, sceneBlank()] });
                      setSelected(draft.scenes.length);
                    }}
                    className="min-h-11 rounded-lg border th-border px-3 th-text-primary"
                  >
                    <Plus size={17} />
                  </button>
                </div>
                {scene && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm th-text-primary">
                        {scene.storyboard ? "Storyboard · Đoạn" : "Cảnh"}{" "}
                        {selected + 1}
                      </strong>
                      <div className="flex">
                        <button
                          aria-label="Đưa cảnh lên"
                          disabled={selected === 0}
                          onClick={() => {
                            const s = [...draft.scenes];
                            [s[selected - 1], s[selected]] = [
                              s[selected],
                              s[selected - 1],
                            ];
                            change({ scenes: s });
                            setSelected(selected - 1);
                          }}
                          className="p-3 th-text-primary"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          aria-label="Đưa cảnh xuống"
                          disabled={selected === draft.scenes.length - 1}
                          onClick={() => {
                            const s = [...draft.scenes];
                            [s[selected + 1], s[selected]] = [
                              s[selected],
                              s[selected + 1],
                            ];
                            change({ scenes: s });
                            setSelected(selected + 1);
                          }}
                          className="p-3 th-text-primary"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          aria-label="Xóa cảnh"
                          onClick={() => {
                            change({
                              scenes: draft.scenes.filter(
                                (_, i) => i !== selected,
                              ),
                            });
                            setSelected(Math.max(0, selected - 1));
                          }}
                          className="p-3 th-text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {characters.map((c) => (
                        <label
                          key={c.id}
                          className="flex min-h-10 items-center gap-1 text-xs th-text-primary"
                        >
                          <input
                            type="checkbox"
                            checked={scene.characterIds.includes(c.id)}
                            disabled={
                              !!scene.storyboard?.beats.some(
                                (b) => b.speakerCharacterId === c.id,
                              )
                            }
                            onChange={(e) =>
                              editScene({
                                characterIds: e.target.checked
                                  ? [...scene.characterIds, c.id]
                                  : scene.characterIds.filter(
                                      (id) => id !== c.id,
                                    ),
                              })
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                    {!scene.storyboard && (
                      <select
                        aria-label="Người nói"
                        className={control}
                        value={scene.speakerCharacterId || ""}
                        onChange={(e) =>
                          editScene({
                            speakerCharacterId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Không thoại</option>
                        {characters
                          .filter((c) => scene.characterIds.includes(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} nói
                            </option>
                          ))}
                      </select>
                    )}
                    {scene.storyboard && (
                      <FilmStoryboardEditor
                        board={scene.storyboard}
                        control={control}
                        characters={characters.filter((c) =>
                          scene.characterIds.includes(c.id),
                        )}
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
                      .filter(
                        (field) => !scene.storyboard || field === "setting",
                      )
                      .map((field) => (
                        <label
                          key={field}
                          className="block text-xs font-semibold th-text-secondary"
                        >
                          {
                            {
                              dialogue: "Lời thoại",
                              action: "Hành động",
                              setting: "Bối cảnh",
                              camera: "Góc máy",
                            }[field]
                          }
                          <textarea
                            className={`${control} mt-1 min-h-16`}
                            value={scene[field]}
                            onChange={(e) =>
                              editScene({ [field]: e.target.value })
                            }
                          />
                        </label>
                      ))}
                    <label className="block text-xs th-text-secondary">
                      Thời lượng clip gốc (giây)
                      <input
                        className={`${control} mt-1`}
                        type="number"
                        min={4}
                        max={30}
                        readOnly={!!scene.storyboard}
                        value={scene.durationSeconds}
                        onChange={(e) =>
                          editScene({ durationSeconds: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm th-text-secondary">
                      <input
                        type="checkbox"
                        checked={scene.followsPrevious}
                        disabled={selected === 0}
                        onChange={(e) =>
                          editScene({ followsPrevious: e.target.checked })
                        }
                      />
                      Nối hành động từ cảnh trước
                    </label>
                    {plan && !dirty && scene.id && (
                      <div className="flex flex-wrap gap-2">
                        {scene.followsPrevious && (
                          <button
                            disabled={!!busy}
                            onClick={() =>
                              act("Lấy khung cuối", () =>
                                getQuote("frame", [scene.id!]),
                              )
                            }
                            className="min-h-11 rounded-lg border th-border px-3 text-sm th-text-accent"
                          >
                            Lấy khung cuối cảnh trước
                          </button>
                        )}
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            act("Báo giá", () =>
                              getQuote("prepare", [scene.id!], true),
                            )
                          }
                          className="min-h-11 rounded-lg border th-border px-3 text-sm th-text-secondary"
                        >
                          Tạo lại ảnh / thoại cảnh này
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            act("Báo giá", () =>
                              getQuote("video", [scene.id!], true),
                            )
                          }
                          className="min-h-11 rounded-lg border th-border px-3 text-sm th-text-secondary"
                        >
                          Tạo lại clip cảnh này
                        </button>
                      </div>
                    )}
                    <details>
                      <summary className="cursor-pointer text-sm th-text-secondary">
                        Prompt ảnh và chuyển động
                      </summary>
                      {(["imagePrompt", "motionPrompt"] as const).map((f) => (
                        <textarea
                          aria-label={
                            f === "imagePrompt"
                              ? "Prompt ảnh"
                              : "Prompt chuyển động"
                          }
                          key={f}
                          className={`${control} mt-2`}
                          value={scene[f]}
                          onChange={(e) => editScene({ [f]: e.target.value })}
                        />
                      ))}
                    </details>
                    {plan && !dirty && scene.id && (
                      <label className="block cursor-pointer rounded-lg border th-border p-3 text-center text-sm th-text-accent">
                        Dùng ảnh đầu có sẵn
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void act("Tải ảnh", async () => {
                                const form = new FormData();
                                form.set("file", file);
                                form.set("sceneId", scene.id!);
                                form.set("workspaceVersion", String(workspace));
                                form.set(
                                  "expectedVersion",
                                  String(plan.version),
                                );
                                const r = await fetch(
                                  `${base}/video-plans/${plan.id}/frames`,
                                  { method: "POST", body: form },
                                );
                                const j = await r.json();
                                if (!r.ok) throw new Error(j.error);
                                setQuote(j.quote);
                              });
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
                <label className="mt-4 block text-xs th-text-secondary">
                  Caption bài đăng
                  <textarea
                    className={`${control} mt-1`}
                    value={draft.caption}
                    onChange={(e) => change({ caption: e.target.value })}
                  />
                </label>
                {channel && plan && (
                  <div className="mt-4 text-sm th-text-secondary">
                    <p>
                      {!dirty && plan.script_review
                        ? `Đã duyệt kịch bản bản ${plan.version}`
                        : "Kịch bản hiện tại chưa được duyệt."}
                    </p>
                    <button
                      disabled={
                        !!busy ||
                        !draft.scenes.length ||
                        (!dirty && !!plan.script_review)
                      }
                      className="mt-2 min-h-11 rounded-lg border th-border px-3 th-text-accent"
                      onClick={() =>
                        act("Duyệt kịch bản", async () => {
                          const p = dirty ? await save() : plan;
                          const r = await api(
                            `${base}/video-plans/${p.id}/review`,
                            {
                              workspaceVersion: workspace,
                              expectedVersion: p.version,
                            },
                          );
                          setPlan(r.plan);
                          setPlans((ps) =>
                            ps.map((x) => (x.id === p.id ? r.plan : x)),
                          );
                          setNote(
                            "Đã lưu người duyệt và bản kịch bản. Chưa sinh media.",
                          );
                        })
                      }
                    >
                      Tôi đã đọc và duyệt kịch bản
                    </button>
                  </div>
                )}
                <div
                  className="sticky bottom-3 mt-5 rounded-xl border th-border p-3 th-bg-card"
                  style={{
                    paddingBottom: "max(12px,env(safe-area-inset-bottom))",
                  }}
                >
                  {quote && (
                    <p className="mb-2 text-sm th-text-primary">
                      {quote.items
                        .map((i) => `${labels[i.kind]}: ${i.points} điểm`)
                        .join(" · ")}
                    </p>
                  )}
                  <button
                    disabled={
                      !!busy ||
                      !ready ||
                      (!draft.scenes.length && !draft.brief.trim()) ||
                      hasRunning
                    }
                    onClick={() =>
                      act("Xử lý", async () => {
                        if (quote) await run(quote);
                        else if (!draft.scenes.length) {
                          const generated = await write();
                          await save(generated);
                        } else if (dirty || !plan) await save();
                        else await getQuote(stage);
                      })
                    }
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-3 font-semibold text-[var(--text-on-accent)] disabled:opacity-60"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                      <Clapperboard size={17} />
                    )}
                    <span>
                      {busy ||
                        (hasRunning
                          ? "Đang xử lý · xem kết quả"
                          : quote
                            ? `Duyệt và tạo · ${quote.points} điểm`
                            : !draft.scenes.length
                              ? "AI viết và lưu kịch bản"
                              : dirty || !plan
                                ? "Lưu kịch bản"
                                : `Xem giá · ${stageNames[stage]}`)}
                    </span>
                  </button>
                </div>
              </fieldset>
            </section>
            <section
              className={`${tab === "results" ? "" : "hidden lg:block"} min-w-0`}
            >
              <h2 className="mb-3 text-lg font-semibold th-text-primary">
                Kết quả và duyệt
              </h2>
              {![...tasks, ...voiceTasks].length && (
                <div className="rounded-xl border th-border p-8 text-center th-text-secondary">
                  Ảnh cảnh, bản nghe thử và phim sẽ xuất hiện ở đây.
                </div>
              )}
              <div className="grid gap-4 xl:grid-cols-2">
                {[...voiceTasks, ...tasks].map((t) => (
                  <article
                    key={t.id}
                    className={`min-w-0 rounded-xl border th-border p-3 th-bg-card ${t.kind === "render" ? "xl:col-span-2" : ""}`}
                  >
                    <p className="mb-2 text-sm font-semibold th-text-primary">
                      {t.displayName ? `${t.displayName} · ` : ""}
                      {labels[t.kind]}{" "}
                      {t.scene_id
                        ? `· cảnh ${plan?.video_plan_scenes.find((s) => s.id === t.scene_id)?.scene_index !== undefined ? plan.video_plan_scenes.find((s) => s.id === t.scene_id)!.scene_index + 1 : "cũ"}`
                        : ""}{" "}
                      ·{" "}
                      {t.status === "completed"
                        ? t.approved_at
                          ? "Đã duyệt"
                          : "Chờ duyệt"
                        : t.status === "reconciling"
                          ? "Đang đối soát"
                          : t.status === "cancelled"
                            ? "Đã hủy"
                            : t.status === "failed"
                              ? "Lỗi"
                              : "Đang xử lý"}
                    </p>
                    {t.url && (t.kind === "image" || t.kind === "frame") ? (
                      <Image
                        unoptimized
                        width={720}
                        height={1280}
                        src={t.url}
                        alt="Ảnh đầu cần duyệt nhân vật và bố cục"
                        className="max-h-96 w-full rounded-lg object-contain"
                      />
                    ) : t.url && t.kind === "tts" ? (
                      <audio
                        controls
                        preload="none"
                        src={t.url}
                        className="w-full"
                      />
                    ) : t.url ? (
                      <video
                        controls
                        preload="none"
                        poster={t.posterUrl}
                        src={t.url}
                        className="max-h-[560px] w-full rounded-lg"
                      />
                    ) : null}
                    {t.kind === "transcribe" && (
                      <p className="text-sm th-text-primary">
                        {String(t.result?.text || "Đang chép lời thực tế…")}{" "}
                        {Number(t.result?.speechError) > 0.2
                          ? "· Lời khác kịch bản, cần kiểm tra."
                          : ""}
                      </p>
                    )}
                    {t.error && (
                      <p className="mt-2 text-xs th-text-danger">{t.error}</p>
                    )}
                    {t.status === "failed" && (
                      <button
                        disabled={!!busy}
                        className="mt-2 min-h-11 rounded-lg border th-border px-3 text-sm th-text-accent"
                        onClick={() =>
                          act("Thử lại lưu", async () => {
                            await api(`${base}/film-tasks/${t.id}/retry`, {
                              workspaceVersion: workspace,
                            });
                            await refresh();
                          })
                        }
                      >
                        Thử lại lưu / xử lý
                      </button>
                    )}
                    {t.status === "completed" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {t.kind !== "transcribe" && !t.approved_at && (
                          <button
                            disabled={!!busy}
                            onClick={() => act("Duyệt", () => approve(t))}
                            className="min-h-11 rounded-lg border th-border px-3 text-sm th-text-accent"
                          >
                            {t.kind === "tts"
                              ? "Đã nghe · duyệt"
                              : t.kind === "render"
                                ? "Duyệt phim"
                                : "Đã xem · duyệt"}
                          </button>
                        )}
                        {t.url && (
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border th-border px-3 py-3 text-sm th-text-secondary"
                          >
                            Tải{" "}
                            {t.kind === "tts"
                              ? "WAV"
                              : t.kind === "image" || t.kind === "frame"
                                ? "ảnh"
                                : "MP4"}
                          </a>
                        )}
                        {t.srtUrl && (
                          <a
                            href={t.srtUrl}
                            className="rounded-lg border th-border px-3 py-3 text-sm th-text-secondary"
                          >
                            Tải SRT
                          </a>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
