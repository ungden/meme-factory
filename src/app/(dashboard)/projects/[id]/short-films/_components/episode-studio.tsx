"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { FilmPlan } from "@/lib/short-film/contracts";
import type { ChannelProfile } from "@/lib/family-catalogue";
import {
  markedStoryIntent,
  storyGenreFromIntent,
  stripStoryGenreMarker,
  type StoryGenre,
} from "@/lib/story-genre";
import ConfirmModal from "@/components/ui/confirm-modal";
import { filmFormatFromIntent, isFilmFormat, markedFormatIntent, type FilmFormat } from "@/lib/film-camera-language";
import { takeFilmHandoff } from "@/lib/home-handoff";
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
  VoiceSamplePanel,
  AutopilotPanel,
  type AutopilotSettings,
  type SceneTile,
  type VoiceCandidate,
} from "./studio-view";
import { FilmSetupPanel, type SetupCharacter } from "./film-setup-panel";

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
  const [channelProfile, setChannelProfile] = useState<ChannelProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // window.confirm phá nhịp của một màn hình đã có ngôn ngữ riêng, và trên
  // điện thoại nó hiện tên miền như một cảnh báo bảo mật.
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const [idea, setIdea] = useState("");
  // null = để AI tự chọn; người dùng chỉ đổi khi muốn, trong mục thu gọn.
  const [genre, setGenre] = useState<StoryGenre | null>(null);
  const [format, setFormat] = useState<FilmFormat | null>(null);
  const [suggestions, setSuggestions] = useState<{ title: string; idea: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [quality, setQuality] = useState<QualityId>("saving");
  const [limit, setLimit] = useState<number>(QUALITY_OPTIONS[0].defaultLimit);
  // Dự án tự nói tiếng Việt cần Seedance 2.5; chọn sẵn cho người dùng, trừ khi
  // họ đã tự đổi ở mục tuỳ chọn.
  const qualityTouched = useRef(false);
  const [autopilot, setAutopilot] = useState<AutopilotSettings | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup] = useState<{
    ready: boolean;
    owner: boolean;
    characters: SetupCharacter[];
    pointsPerImage: number;
  } | null>(null);
  const [profileAudience, setProfileAudience] = useState("Gia đình Việt xem video ngắn");
  const [profileTone, setProfileTone] = useState("Hài tự nhiên và cảm động có nguyên nhân");
  const [profilePositioning, setProfilePositioning] = useState("");
  const [profileSpeechRegister, setProfileSpeechRegister] = useState<"child" | "natural">("natural");
  const [profileGenres, setProfileGenres] = useState<Array<"comedy" | "emotion">>(["comedy", "emotion"]);

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [planTasks, setPlanTasks] = useState<StudioTask[]>([]);
  const [runDetail, setRunDetail] = useState<{ run: StudioRun; checks: StudioCheck[] } | null>(null);
  const generation = useRef(0);
  const [nativeVoiceIds, setNativeVoiceIds] = useState<Set<string>>(new Set());

  const refreshVoices = useCallback(async () => {
    const response = await api(`${base}/voices`);
    setNativeVoiceIds(
      new Set(
        ((response.voices || []) as Array<{ character_id: string; model: string; approved_at: string | null }>)
          .filter((voice) => voice.model === "seedance-native" && voice.approved_at)
          .map((voice) => voice.character_id),
      ),
    );
  }, [base]);

  useEffect(() => {
    refreshVoices().catch(() => undefined);
  }, [refreshVoices]);


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
    setChannelProfile(planList.channelProfile || null);
    const filmSetup = await api(`${base}/film-setup`).catch(() => null);
    setSetup(
      filmSetup
        ? {
            ready: filmSetup.ready === true,
            owner: filmSetup.owner === true,
            characters: filmSetup.characters || [],
            pointsPerImage: Number(filmSetup.pointsPerImage || 0),
          }
        : null,
    );
    const automation = await api(`${base}/film-automation`).catch(() => null);
    // Chỉ chủ kênh bật được lịch; người cùng dự án không thấy thẻ này.
    setAutopilot(
      automation?.owner
        ? {
            enabled: automation.automation?.enabled === true,
            filmsPerDay: Number(automation.automation?.films_per_day || 1),
            localTime: String(automation.automation?.local_time || "09:00").slice(0, 5),
          }
        : null,
    );
    if (planList.nativeVoice && !qualityTouched.current) {
      setQuality("quality");
      setLimit(qualityOption("quality").defaultLimit);
    }
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

  // Ý tưởng gửi từ trang chính: kênh đã sẵn sàng thì làm luôn, chưa thì điền
  // sẵn để sau bước chuẩn bị người dùng không phải gõ lại. Khoá chống trùng đi
  // theo ý tưởng nên lỡ chạy hai lần cũng chỉ ra một lượt.
  const handoff = useRef<ReturnType<typeof takeFilmHandoff> | undefined>(undefined);
  useEffect(() => {
    if (handoff.current !== undefined) return;
    handoff.current = takeFilmHandoff(ref);
    if (!handoff.current) return;
    setIdea(handoff.current.idea);
    // Kênh vừa tạo chưa có hồ sơ: lấy ý tưởng đầu tiên làm điểm tựa cho câu
    // "kênh tập trung vào điều gì" để người dùng không đứng trước ô trống.
    setProfilePositioning((current) => current || handoff.current!.idea);
    if (isFilmFormat(handoff.current.format)) setFormat(handoff.current.format);
  }, [ref]);
  useEffect(() => {
    const pending = handoff.current;
    if (!pending?.key || !loaded || selectedKey || !channelProfile || (setup && !setup.ready)) return;
    handoff.current = null;
    void act(async () => {
      await startRun(
        pending.idea.trim(),
        limit,
        qualityOption(quality).model,
        null,
        isFilmFormat(pending.format) ? pending.format : null,
        pending.key,
      );
      setIdea("");
    });
    // Chỉ chạy một lần khi dữ liệu kênh vừa tải xong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, channelProfile, setup, selectedKey]);

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

  /**
   * Thể loại và cách quay do AI tự chọn từ ý tưởng, trừ khi người dùng đã chọn
   * ở mục tuỳ chọn hoặc đang viết lại một tập đã có thể loại.
   */
  async function startRun(
    intent: string,
    maxFilm: number,
    videoModel: string,
    storyGenre: StoryGenre | null = genre,
    filmFormat: FilmFormat | null = format,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    if (!channelProfile) throw new Error("Hãy hoàn tất hồ sơ kênh trước khi viết kịch bản.");
    const current = runs.find((run) => runIsActive(run));
    const response = await api(`${base}/production-runs`, {
      planId: null,
      // Tập cảm động không quay kiểu bé nói với máy; lựa chọn cũ không được lọt qua.
      intent: markedFormatIntent(
        storyGenre ? markedStoryIntent(intent, storyGenre) : intent,
        storyGenre === "emotion" && (filmFormat === "talk_to_camera" || filmFormat === "cooking_show")
          ? null
          : filmFormat,
      ),
      guests: [],
      maxPointsPerFilm: maxFilm,
      maxPointsPerDay: Math.max(maxFilm, current?.max_points_per_day || 0, maxFilm * 3),
      videoModel,
      idempotencyKey,
    });
    await refreshList();
    select(response.runId);
  }

  async function saveChannelProfile(characterIds?: string[]) {
    const response = await api(`${base}/channel-profile`, {
      audience: channelProfile?.audience || profileAudience,
      tone: channelProfile?.tone || profileTone,
      positioning: channelProfile?.positioning || profilePositioning,
      speechRegister: channelProfile?.speechRegister || profileSpeechRegister,
      genres: channelProfile?.genres || profileGenres,
      // Kênh mới mặc định đưa mọi nhân vật lên phim; bước chuẩn bị cho bớt đi.
      characterIds:
        characterIds ||
        (channelProfile?.roles?.length
          ? channelProfile.roles.map((role) => role.characterId)
          : (setup?.characters || []).map((character) => character.id)),
    });
    setChannelProfile(response.profile);
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

  // Câu nào trong cảnh đã quay bằng giọng AI tự nói đều có thể làm giọng chuẩn.
  // Câu ngắn hơn 3 giây được nới tới 3 giây vì model cần nghe đủ âm sắc.
  const voiceCandidates: VoiceCandidate[] = (plan?.video_plan_scenes || []).flatMap((scene) => {
    const clip = planTasks
      .filter(
        (task) =>
          task.scene_id === scene.id &&
          task.kind === "video" &&
          task.status === "completed" &&
          task.input?.audioMode === "native",
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!clip) return [];
    // Clip nhiều người nói: đoạn cắt theo mốc dự kiến có thể dính giọng bé khác.
    const speakers = new Set(
      (scene.storyboard?.beats || []).filter((beat) => beat.dialogue?.trim()).map((beat) => beat.speakerCharacterId),
    );
    if (speakers.size !== 1) return [];
    return (scene.storyboard?.beats || []).flatMap((beat, index) => {
      if (!beat.dialogue?.trim() || !beat.speakerCharacterId) return [];
      const inSeconds = beat.startSeconds;
      const outSeconds = Math.min(
        Math.max(beat.endSeconds, inSeconds + 3),
        inSeconds + 10,
        scene.storyboard!.durationSeconds,
      );
      if (outSeconds - inSeconds < 3) return [];
      return [{
        key: `${clip.id}:${index}`,
        characterId: beat.speakerCharacterId,
        name: names.get(beat.speakerCharacterId) || "Nhân vật",
        dialogue: beat.dialogue,
        taskId: clip.id,
        inSeconds,
        outSeconds,
      }];
    });
  });
  const voiceCharacters = [...castByCharacter.values()]
    .filter((member) => !member.isGuest)
    .map((member) => ({
      id: member.characterId,
      name: member.name,
      hasSample: nativeVoiceIds.has(member.characterId),
    }));

  async function saveVoice(body: Record<string, unknown> | FormData) {
    setBusy(true);
    setError("");
    try {
      if (body instanceof FormData) {
        const response = await fetch(`${base}/voices/native`, { method: "POST", body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Chưa lưu được giọng chuẩn.");
      } else await api(`${base}/voices/native`, body);
      await refreshVoices();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
          {setup?.owner ? (
            <button
              type="button"
              onClick={() => {
                setShowSetup(true);
                select(null);
              }}
              className="mt-1 inline-block font-semibold underline"
            >
              Để AI bổ sung bộ ảnh chuẩn
            </button>
          ) : (
            <Link href={`/projects/${ref}/mascots`} className="mt-1 inline-block font-semibold underline">
              Mở trang Nhân vật
            </Link>
          )}
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
          ) : !episode && !channelProfile ? (
            <section className="flex max-w-2xl flex-col gap-5" aria-labelledby="channel-setup-title">
              <header>
                <h2 id="channel-setup-title" className="text-xl font-semibold th-text-primary">Thiết lập kênh trước khi viết</h2>
                <p className="mt-1 text-sm th-text-secondary">Hồ sơ này là nguồn cho kịch bản. Bạn có thể thay đổi sau; mỗi tập sẽ giữ đúng phiên bản đã dùng.</p>
              </header>
              <label className="flex flex-col gap-1 text-sm th-text-primary">
                Người xem
                <input value={profileAudience} onChange={(event) => setProfileAudience(event.target.value)} maxLength={240} className="rounded-lg border th-border th-bg-input px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm th-text-primary">
                Kênh tập trung vào điều gì?
                <textarea value={profilePositioning} onChange={(event) => setProfilePositioning(event.target.value)} maxLength={1000} rows={3} placeholder="Ví dụ: những tình huống nhỏ giữa bố và con, có hành động rõ ràng và kết tự nhiên." className="rounded-lg border th-border th-bg-input px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm th-text-primary">
                Sắc thái kể chuyện
                <textarea value={profileTone} onChange={(event) => setProfileTone(event.target.value)} maxLength={500} rows={2} className="rounded-lg border th-border th-bg-input px-3 py-2" />
              </label>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium th-text-primary">Thể loại mở bán</legend>
                <div className="flex gap-4 text-sm th-text-secondary">
                  {(["comedy", "emotion"] as const).map((genre) => (
                    <label key={genre} className="flex items-center gap-2">
                      <input type="checkbox" checked={profileGenres.includes(genre)} onChange={() => setProfileGenres((current) => current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre])} />
                      {genre === "comedy" ? "Hài tự nhiên" : "Cảm động có chiều sâu"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1 text-sm th-text-primary">
                Cách nói mặc định
                <select value={profileSpeechRegister} onChange={(event) => setProfileSpeechRegister(event.target.value as "child" | "natural")} className="w-fit rounded-lg border th-border th-bg-input px-3 py-2">
                  <option value="natural">Theo nhân vật và quan hệ</option>
                  <option value="child">Giọng trẻ nhỏ</option>
                </select>
              </label>
              <p className="text-xs th-text-secondary">Thêm nhân vật, quan hệ, ảnh và giọng ở trang Nhân vật trước khi dựng. Kịch bản sẽ không bị ép giọng trẻ nếu kênh không chọn điều đó.</p>
              <button type="button" onClick={() => act(() => saveChannelProfile())} disabled={busy || !profilePositioning.trim() || !profileGenres.length} className="w-fit rounded-lg th-bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Lưu và bắt đầu viết</button>
            </section>
          ) : !episode && setup && (!setup.ready || showSetup) ? (
            <FilmSetupPanel
              base={base}
              workspace={workspace}
              characters={setup.characters}
              castIds={(channelProfile?.roles || []).map((role) => role.characterId)}
              pointsPerImage={setup.pointsPerImage}
              owner={setup.owner}
              mascotsHref={`/projects/${ref}/mascots`}
              onSaveCast={(ids) => saveChannelProfile(ids)}
              onDone={async () => {
                setShowSetup(false);
                await refreshList();
              }}
            />
          ) : !episode ? (
            <div className="flex flex-col gap-6">
              <IdeaPanel
                idea={idea}
                onIdea={setIdea}
                genre={genre}
                onGenre={setGenre}
                allowedGenres={channelProfile?.genres || ["comedy", "emotion"]}
                format={format}
                onFormat={setFormat}
                suggestions={suggestions}
                suggesting={suggesting}
                onSuggest={suggest}
                quality={quality}
                onQuality={(value) => {
                  qualityTouched.current = true;
                  setQuality(value);
                }}
                limit={limit}
                onLimit={setLimit}
                starting={busy}
                onStart={() =>
                  act(async () => {
                    await startRun(idea.trim(), limit, qualityOption(quality).model);
                    setIdea("");
                  })
                }
                advancedHref={advancedHref}
              />
              {autopilot && (
                <AutopilotPanel
                  key={`${autopilot.enabled}-${autopilot.filmsPerDay}-${autopilot.localTime}`}
                  settings={autopilot}
                  pointsPerFilm={limit}
                  saving={busy}
                  onSave={(next) =>
                    act(async () => {
                      await api(
                        `${base}/film-automation`,
                        {
                          enabled: next.enabled,
                          filmsPerDay: next.filmsPerDay,
                          localTime: next.localTime,
                          maxPointsPerFilm: limit,
                          maxPointsPerDay: limit * next.filmsPerDay,
                          videoModel: qualityOption(quality).model,
                        },
                        "PUT",
                      );
                    })
                  }
                />
              )}
            </div>
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
                      const originalIntent = run.intent || plan?.brief || "";
                      await startRun(
                        stripStoryGenreMarker(originalIntent),
                        run.max_points_per_film,
                        // Viết lại giữ đúng model, thể loại và cách quay của lượt gốc.
                        plan?.video_model || run.video_model || qualityOption("saving").model,
                        storyGenreFromIntent(originalIntent, channelProfile?.genres),
                        filmFormatFromIntent(originalIntent),
                      );
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
                    act(async () => {
                      await api(`${base}/film-tasks/${film.id}`, { action: "approve", workspaceVersion: workspace });
                      if (run?.status === "needs_review") await resume();
                    })
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
              {plan?.audio_mode === "native" && (
                <VoiceSamplePanel
                  characters={voiceCharacters}
                  candidates={voiceCandidates}
                  busy={busy}
                  onUseClip={(candidate) =>
                    saveVoice({
                      workspaceVersion: workspace,
                      characterId: candidate.characterId,
                      sourceTaskId: candidate.taskId,
                      inSeconds: candidate.inSeconds,
                      outSeconds: candidate.outSeconds,
                    })
                  }
                  onUpload={({ characterId, file, seconds, direction }) => {
                    const form = new FormData();
                    form.set("workspaceVersion", String(workspace ?? ""));
                    form.set("characterId", characterId);
                    form.set("seconds", String(seconds));
                    form.set("direction", direction);
                    form.set("rightsConfirmed", "true");
                    form.set("file", file);
                    saveVoice(form);
                  }}
                />
              )}

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
