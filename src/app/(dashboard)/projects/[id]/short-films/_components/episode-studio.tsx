"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { FilmPlan } from "@/lib/short-film/contracts";
import ConfirmModal from "@/components/ui/confirm-modal";
import { castIdentityGaps } from "@/lib/short-film/cast-quality";
import { suggestHashtags } from "@/lib/post-text";
import { api } from "../../video/multiscene/_lib/draft";
import {
  QUALITY_OPTIONS,
  attentionFor,
  episodeSummaries,
  latestFilm,
  qualityOption,
  runIsActive,
  shortTitle,
  type QualityId,
  type StudioCheck,
  type StudioRun,
  type StudioTask,
} from "../_lib/studio";
import {
  AttentionPanel,
  EpisodeList,
  FilmPanel,
  IdeaPanel,
  ProgressPanel,
  SceneStrip,
  ScriptPanel,
  StatusPill,
  type SceneTile,
} from "./studio-view";

type PlanDetail = FilmPlan & { video_plan_scenes: FilmPlan["video_plan_scenes"] };

/**
 * Màn "Tạo phim" cho người dùng cuối: một ý tưởng → AI làm cả tập → chỉ hỏi
 * khi cần quyết định. Trình chỉnh từng cảnh cũ vẫn ở /video/multiscene cho ai
 * cần kiểm soát chi tiết.
 */
export default function EpisodeStudio() {
  const { id: ref } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const base = `/api/projects/${ref}`;
  const selectedKey = search.get("tap");

  const [plans, setPlans] = useState<FilmPlan[]>([]);
  const [runs, setRuns] = useState<StudioRun[]>([]);
  const [workspace, setWorkspace] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // window.confirm phá nhịp của một màn hình đã có ngôn ngữ riêng, và trên
  // điện thoại nó hiện tên miền như một cảnh báo bảo mật.
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const [idea, setIdea] = useState("");
  const [quality, setQuality] = useState<QualityId>("saving");
  const [limit, setLimit] = useState<number>(QUALITY_OPTIONS[0].defaultLimit);
  const [suggestions, setSuggestions] = useState<{ title: string; idea: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [planTasks, setPlanTasks] = useState<StudioTask[]>([]);
  const [runDetail, setRunDetail] = useState<{ run: StudioRun; checks: StudioCheck[] } | null>(null);
  const generation = useRef(0);

  const episodes = useMemo(() => episodeSummaries(plans, runs), [plans, runs]);
  // Lượt đang viết kịch bản được chọn bằng id lượt; khi kịch bản ra đời, tập đó
  // mang khoá của kịch bản. Tìm cả theo id lượt để màn không rơi về "Tập mới".
  const episode =
    episodes.find((item) => item.key === selectedKey) ||
    episodes.find((item) => item.runId === selectedKey) ||
    null;

  const select = useCallback(
    (key: string | null) => {
      const params = new URLSearchParams(search.toString());
      if (key) params.set("tap", key);
      else params.delete("tap");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, search],
  );

  const refreshList = useCallback(async () => {
    const [planList, runList] = await Promise.all([
      api(`${base}/video-plans`),
      api(`${base}/production-runs`),
    ]);
    setPlans(planList.plans || []);
    setWorkspace(planList.workspaceVersion ?? null);
    setRuns(runList.runs || []);
    setLoaded(true);
  }, [base]);

  const episodeKey = episode?.key || null;
  const episodePlanId = episode?.planId || null;
  const episodeRunId = episode?.runId || null;

  const refreshEpisode = useCallback(async () => {
    const g = generation.current;
    if (!episodeKey) return;
    const [runJson, planJson] = await Promise.all([
      episodeRunId ? api(`${base}/production-runs/${episodeRunId}`) : Promise.resolve(null),
      episodePlanId ? api(`${base}/video-plans/${episodePlanId}`) : Promise.resolve(null),
    ]);
    if (g !== generation.current) return;
    setRunDetail(runJson ? { run: runJson.run, checks: runJson.checks || [] } : null);
    setPlan(planJson?.plan || null);
    setPlanTasks(planJson?.tasks || []);
    // Lượt vừa viết xong kịch bản: chuyển sang theo dõi theo kịch bản.
    if (runJson?.run?.plan_id && !episodePlanId) {
      await refreshList();
      select(runJson.run.plan_id);
    }
  }, [base, episodeKey, episodePlanId, episodeRunId, refreshList, select]);

  // Hàm refresh đổi danh tính mỗi lần URL đổi; polling chỉ nên khởi động lại khi
  // đổi tập hoặc đổi nhịp, không phải mỗi lần danh sách tải xong.
  const refreshers = useRef({ refreshEpisode, refreshList });
  useEffect(() => {
    refreshers.current = { refreshEpisode, refreshList };
  }, [refreshEpisode, refreshList]);

  useEffect(() => {
    refreshList().catch((cause) => setError(cause.message));
  }, [refreshList]);

  useEffect(() => {
    if (episode && selectedKey && episode.key !== selectedKey) select(episode.key);
  }, [episode, selectedKey, select]);

  useEffect(() => {
    generation.current += 1;
    setPlan(null);
    setPlanTasks([]);
    setRunDetail(null);
  }, [selectedKey]);

  const active = runIsActive(runDetail?.run) || episode?.status === "working";
  useEffect(() => {
    if (!episodeKey) return;
    let stopped = false;
    const tick = async () => {
      try {
        await refreshers.current.refreshEpisode();
        if (active) await refreshers.current.refreshList();
      } catch (cause) {
        if (!stopped) setError((cause as Error).message);
      }
    };
    void tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, active ? 5000 : 30000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [episodeKey, episodePlanId, episodeRunId, active]);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refreshList();
      await refreshEpisode();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError("");
    try {
      const job = await api(`${base}/creative-assists`, { kind: "idea_suggestions", workspaceVersion: workspace });
      for (let n = 0; n < 90; n++) {
        const r = await api(`${base}/creative-assists/${job.jobId}`);
        if (r.job.status === "failed") throw new Error("Chưa lấy được gợi ý. Hãy thử lại.");
        if (r.job.status === "completed") {
          setSuggestions(r.job.result.ideas || []);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Gợi ý đang lâu hơn bình thường. Hãy thử lại sau.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  async function startRun(intent: string, maxFilm: number, videoModel: string) {
    const current = runs.find((run) => runIsActive(run));
    const response = await api(`${base}/production-runs`, {
      planId: null,
      intent,
      guests: [],
      maxPointsPerFilm: maxFilm,
      maxPointsPerDay: Math.max(maxFilm, current?.max_points_per_day || 0, maxFilm * 3),
      videoModel,
      idempotencyKey: crypto.randomUUID(),
    });
    await refreshList();
    select(response.runId);
  }

  const run = runDetail?.run || null;
  const attention = run
    ? attentionFor(run, planTasks, runDetail?.checks || [], plan?.video_plan_scenes || [])
    : { kind: "none" as const };
  const film = latestFilm(planTasks);
  const advancedHref = `/projects/${ref}/video/multiscene${plan ? `?plan=${plan.id}` : ""}`;

  const names = new Map<string, string>();
  const castByCharacter = new Map<
    string,
    NonNullable<typeof plan>["video_plan_scenes"][number]["cast_snapshot"][number]
  >();
  for (const scene of plan?.video_plan_scenes || [])
    for (const member of scene.cast_snapshot) {
      names.set(member.characterId, member.name);
      if (member.guestKey) names.set(member.guestKey, member.name);
      if (!castByCharacter.has(member.characterId)) castByCharacter.set(member.characterId, member);
    }
  // Thiếu ảnh cận mặt thì khuôn mặt đổi giữa các cảnh — người dùng phải biết
  // trước khi tiêu điểm, chứ không phải sau khi xem phim xong.
  const castGaps = castIdentityGaps([...castByCharacter.values()]);
  const lines =
    plan?.story?.dialogue?.map((line) => ({
      speaker: names.get(line.characterId) || "Nhân vật",
      text: line.text,
      action: line.action,
    })) || [];
  const scenes: SceneTile[] = [...(plan?.video_plan_scenes || [])]
    .sort((a, b) => a.scene_index - b.scene_index)
    .map((scene) => {
      const own = planTasks.filter((task) => task.scene_id === scene.id && task.status === "completed" && task.url);
      const pick = (kinds: string[]) =>
        own.filter((task) => kinds.includes(task.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
      const clip = pick(["dub", "lip_sync", "video"]);
      const image = pick(["image", "frame"]);
      return {
        number: scene.scene_index + 1,
        label: clip ? "Đã quay" : image ? "Đã có hình" : "Đang chuẩn bị",
        task: clip || image,
      };
    });

  const resume = (body: Record<string, unknown> = {}) =>
    api(`${base}/production-runs/${run!.id}`, { action: "resume", ...body }, "PATCH");

  return (
    // pt-16 chừa chỗ cho nút mở menu trên điện thoại; tránh sidebar
    // cố định của app shell.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-6 pt-16 sm:px-6 lg:ml-0 lg:pt-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold th-text-primary">Tạo phim</h1>
        <p className="text-sm th-text-secondary">Từ ý tưởng tới phim hoàn chỉnh. AI làm từng bước và chỉ hỏi bạn khi cần.</p>
      </header>

      {castGaps.length > 0 && (
        <div className="rounded-lg border th-border-warning th-bg-warning-light px-3 py-2 text-sm th-text-warning">
          {castGaps.map((gap) => (
            <p key={gap.characterId}>{gap.message}</p>
          ))}
          <Link href={`/projects/${ref}/mascots`} className="mt-1 inline-block font-semibold underline">
            Mở trang Nhân vật
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border th-border-danger th-bg-danger-light px-3 py-2 text-sm th-text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <EpisodeList
            episodes={episodes}
            selectedKey={selectedKey}
            onSelect={(item) => select(item.key)}
            onNew={() => select(null)}
          />
        </aside>

        <main className="flex min-w-0 flex-col gap-5">
          {!loaded ? (
            <p className="text-sm th-text-secondary">Đang tải…</p>
          ) : !episode ? (
            <IdeaPanel
              idea={idea}
              onIdea={setIdea}
              quality={quality}
              onQuality={setQuality}
              limit={limit}
              onLimit={setLimit}
              suggestions={suggestions}
              suggesting={suggesting}
              onSuggest={suggest}
              starting={busy}
              onStart={() =>
                act(async () => {
                  await startRun(idea.trim(), limit, qualityOption(quality).model);
                  setIdea("");
                })
              }
              advancedHref={advancedHref}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold th-text-primary">
                  {plan?.title || shortTitle(run?.intent) || episode.title}
                </h2>
                <StatusPill status={episode.status} />
              </div>

              {run && (
                <ProgressPanel
                  run={run}
                  busy={busy}
                  onPause={() => act(async () => void (await api(`${base}/production-runs/${run.id}`, { action: "pause" }, "PATCH")))}
                  onResume={() => act(async () => void (await resume()))}
                  onCancel={() => setCancelTarget(run.id)}
                />
              )}

              {run && (
                <AttentionPanel
                  key={`${run.id}:${run.updated_at}`}
                  attention={attention}
                  busy={busy}
                  onUseAnyway={(task) =>
                    act(async () => {
                      await api(`${base}/film-tasks/${task.id}`, { action: "approve", workspaceVersion: workspace });
                      await resume();
                    })
                  }
                  onRegenerate={(task, reason) =>
                    act(async () => {
                      await api(`${base}/film-tasks/${task.id}`, { action: "regenerate", reason, workspaceVersion: workspace });
                      await resume();
                    })
                  }
                  onRaiseBudget={(next) =>
                    act(async () =>
                      void (await resume({ maxPointsPerFilm: next, maxPointsPerDay: Math.max(next, run.max_points_per_day) })),
                    )
                  }
                  onAcceptScript={() =>
                    act(async () => {
                      if (plan)
                        await api(`${base}/video-plans/${plan.id}/review`, { workspaceVersion: workspace, expectedVersion: plan.version });
                      await resume();
                    })
                  }
                  onRewriteScript={() =>
                    act(async () => {
                      await api(`${base}/production-runs/${run.id}`, { action: "cancel" }, "PATCH");
                      await startRun(run.intent || plan?.brief || "", run.max_points_per_film, plan?.video_model || qualityOption("saving").model);
                    })
                  }
                  onRetry={() => act(async () => void (await resume()))}
                />
              )}

              {film && (
                <FilmPanel
                  film={film}
                  approving={busy}
                  onApprove={() =>
                    act(async () => void (await api(`${base}/film-tasks/${film.id}`, { action: "approve", workspaceVersion: workspace })))
                  }
                  caption={[plan?.title, plan?.brief || run?.intent].filter(Boolean).join("\n\n")}
                  hashtags={suggestHashtags(plan?.title)}
                />
              )}

              <ScriptPanel
                title={plan?.title || ""}
                lines={lines}
                editHref={plan ? advancedHref : null}
              />
              <SceneStrip scenes={scenes} />

              {!run && !film && plan && (
                <p className="text-sm th-text-secondary">
                  Tập này được làm trong trình chỉnh chi tiết.{" "}
                  <a href={advancedHref} className="th-text-accent underline-offset-2 hover:underline">Mở để làm tiếp</a>
                </p>
              )}
            </>
          )}
        </main>
      </div>
      <ConfirmModal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          const runId = cancelTarget;
          setCancelTarget(null);
          if (runId)
            void act(async () => void (await api(`${base}/production-runs/${runId}`, { action: "cancel" }, "PATCH")));
        }}
        title="Huỷ tập này?"
        message="Phần đã làm vẫn được giữ trong trình chỉnh chi tiết."
        confirmText="Huỷ tập"
        variant="danger"
      />

    </div>
  );
}
