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
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import ConfirmModal from "@/components/ui/confirm-modal";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { PageContainer, PageHeader, Skeleton } from "@/components/ui/page";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { useWallet } from "@/contexts/WalletContext";
import { filmFormatFromIntent, isFilmFormat, markedFormatIntent, type FilmFormat } from "@/lib/film-camera-language";
import { takeFilmHandoff } from "@/lib/home-handoff";
import { castIdentityGaps } from "@/lib/short-film/cast-quality";
import {
  PROFILE_FIELD_LABEL,
  PROFILE_FIELD_LIMIT,
  PROFILE_FIELD_PLACEHOLDER,
  missingProfileFields,
  type ProfileField,
  type ProfileFields,
} from "@/lib/short-film/channel-profile-fields";
import { suggestHashtags } from "@/lib/post-text";
import { api } from "../../video/multiscene/_lib/draft";
import {
  QUALITY_OPTIONS,
  attentionFor,
  episodeSummaries,
  latestFilm,
  qualityOption,
  runIsActive,
  runRefundedPoints,
  shortTitle,
  type QualityId,
  type StudioCheck,
  type StudioRun,
  type StudioTask,
} from "../_lib/studio";
import { scheduleBody, scheduleFromApi, type FilmSchedule } from "../_lib/schedule";
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
  type SceneTile,
  type VoiceCandidate,
} from "./studio-view";
import { FilmSetupPanel, type SetupCharacter } from "./film-setup-panel";

type PlanDetail = FilmPlan & { video_plan_scenes: FilmPlan["video_plan_scenes"] };

/**
 * Màn Phim ngắn cho người dùng cuối: một ý tưởng → AIDA làm cả tập → chỉ hỏi
 * khi cần quyết định. Trang Chỉnh tay (/video/multiscene) dành cho ai cần sửa
 * từng cảnh của một tập.
 */
export default function EpisodeStudio() {
  const { id: ref } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const wallet = useWallet();
  const base = `/api/projects/${ref}`;
  const selectedKey = search.get("tap");

  const [plans, setPlans] = useState<FilmPlan[]>([]);
  const [runs, setRuns] = useState<StudioRun[]>([]);
  const [workspace, setWorkspace] = useState<number | null>(null);
  const [channelProfile, setChannelProfile] = useState<ChannelProfile | null>(null);
  const [channelPoints, setChannelPoints] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // window.confirm phá nhịp của một màn hình đã có ngôn ngữ riêng, và trên
  // điện thoại nó hiện tên miền như một cảnh báo bảo mật.
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const [idea, setIdea] = useState("");
  // null = để AIDA tự chọn; người dùng chỉ đổi khi muốn, trong mục thu gọn.
  const [genre, setGenre] = useState<StoryGenre | null>(null);
  const [format, setFormat] = useState<FilmFormat | null>(null);
  const [suggestions, setSuggestions] = useState<{ title: string; idea: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [quality, setQuality] = useState<QualityId>("saving");
  const [limit, setLimit] = useState<number>(QUALITY_OPTIONS[0].defaultLimit);
  // Kênh tự nói tiếng Việt cần bản Chất lượng cao; chọn sẵn cho người dùng, trừ
  // khi họ đã tự đổi ở mục tuỳ chọn.
  const qualityTouched = useRef(false);
  const [autopilot, setAutopilot] = useState<FilmSchedule | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup] = useState<{
    ready: boolean;
    owner: boolean;
    characters: SetupCharacter[];
    pointsPerImage: number;
    /** Hồ sơ kênh từ bước tạo kênh và Cài đặt kênh. */
    channel: ProfileFields | null;
  } | null>(null);
  // Chỉ chứa những ý hồ sơ kênh còn trống; ý đã có không bị hỏi lại.
  const [profileDraft, setProfileDraft] = useState<Partial<ProfileFields>>({});
  const autoProfileTried = useRef(false);

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
  // Tập đang viết kịch bản được chọn bằng id lượt chạy; khi kịch bản ra đời, tập
  // đó mang khoá của kịch bản. Tìm cả hai để màn không rơi về "Tập mới".
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
    const [filmSetup, automation, points] = await Promise.all([
      api(`${base}/film-setup`).catch(() => null),
      api(`${base}/film-automation`).catch(() => null),
      api(`${base}/wallet`).catch(() => null),
    ]);
    setSetup(
      filmSetup
        ? {
            ready: filmSetup.ready === true,
            owner: filmSetup.owner === true,
            characters: filmSetup.characters || [],
            pointsPerImage: Number(filmSetup.pointsPerImage || 0),
            channel: filmSetup.channel || null,
          }
        : null,
    );
    setChannelPoints(typeof points?.points === "number" ? points.points : null);
    const preferred = qualityOption(planList.nativeVoice ? "quality" : "saving");
    // Chỉ chủ kênh bật được lịch; người cùng kênh không thấy thẻ này.
    setAutopilot(
      automation?.owner
        ? scheduleFromApi(
            automation.automation,
            { maxPointsPerFilm: preferred.defaultLimit, videoModel: preferred.model },
            automation.queue || [],
          )
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
    // Tập vừa viết xong kịch bản: chuyển sang theo dõi theo kịch bản.
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

  const loadAll = useCallback(() => {
    setError("");
    refreshList().catch((cause) => setError(cause.message));
  }, [refreshList]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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
  // theo ý tưởng nên lỡ chạy hai lần cũng chỉ ra một tập.
  const handoff = useRef<ReturnType<typeof takeFilmHandoff> | undefined>(undefined);
  useEffect(() => {
    if (handoff.current !== undefined) return;
    handoff.current = takeFilmHandoff(ref);
    if (!handoff.current) return;
    setIdea(handoff.current.idea);
    // Kênh vừa tạo mà thiếu ý "kênh hay kể chuyện gì": lấy ý tưởng đầu tiên làm
    // điểm tựa để người dùng không đứng trước ô trống. Chỉ gửi đi nếu ý đó thiếu.
    const first = handoff.current.idea;
    setProfileDraft((current) => ({ ...current, positioning: current.positioning || first }));
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

  // Hồ sơ kênh đã đủ từ lúc tạo kênh hoặc ở Cài đặt kênh thì lập hồ sơ phim
  // luôn, không hỏi lại. Chỉ chủ kênh ghi được hồ sơ.
  const missingFields = missingProfileFields(setup?.channel);
  useEffect(() => {
    if (!loaded || channelProfile || !setup?.owner || missingFields.length || autoProfileTried.current) return;
    autoProfileTried.current = true;
    void act(() => saveChannelProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, channelProfile, setup, missingFields.length]);

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
        if (r.job.status === "failed") throw new Error("Chưa lấy được gợi ý. Bạn thử lại nhé.");
        if (r.job.status === "completed") {
          setSuggestions(r.job.result.ideas || []);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Gợi ý đang lâu hơn bình thường. Bạn thử lại sau nhé.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  /**
   * Thể loại và cách quay do AIDA tự chọn từ ý tưởng, trừ khi người dùng đã chọn
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
    if (!channelProfile) throw new Error("Điền hồ sơ kênh trước khi làm phim nhé.");
    const current = runs.find((run) => runIsActive(run));
    const response = await api(`${base}/production-runs`, {
      planId: null,
      // Tập cảm động không quay kiểu nói với người xem; lựa chọn cũ không được lọt qua.
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

  /** Tập đã dừng hẳn: làm lại trên đúng kịch bản cũ, phần đã xong được dùng lại. */
  async function retryRun(failed: StudioRun) {
    const response = await api(`${base}/production-runs`, {
      planId: failed.plan_id,
      intent: failed.plan_id ? "" : failed.intent || "",
      guests: [],
      maxPointsPerFilm: failed.max_points_per_film,
      maxPointsPerDay: Math.max(failed.max_points_per_film, failed.max_points_per_day),
      videoModel: failed.video_model || qualityOption("saving").model,
      idempotencyKey: crypto.randomUUID(),
    });
    await refreshList();
    select(failed.plan_id || response.runId);
  }

  /**
   * Chỉ gửi ý người dùng vừa điền; máy chủ lấy phần còn lại từ hồ sơ của kênh.
   */
  async function saveChannelProfile(characterIds?: string[]) {
    const response = await api(`${base}/channel-profile`, {
      ...Object.fromEntries(missingFields.map((field) => [field, profileDraft[field] || ""])),
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
  const charactersHref = `/projects/${ref}/characters`;
  const available = channelPoints === null ? null : channelPoints + (wallet.isLoading ? 0 : wallet.points);

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

  // Câu nào trong cảnh nhân vật tự nói đều có thể làm giọng chuẩn. Câu ngắn hơn
  // 3 giây được nới tới 3 giây vì cần nghe đủ âm sắc.
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
    // Clip nhiều người nói: đoạn cắt theo mốc dự kiến có thể dính giọng người khác.
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

  const setField = (field: ProfileField) => (value: string) =>
    setProfileDraft((current) => ({ ...current, [field]: value }));
  const draftComplete = missingFields.every((field) => String(profileDraft[field] || "").trim());

  return (
    <PageContainer width="work">
      <PageHeader title="Phim ngắn" description="Gõ ý tưởng, nhận phim làm xong. Chỉ hỏi bạn khi cần." />

      <div className="flex flex-col gap-6">
        {castGaps.length > 0 && (
          <Alert
            tone="warning"
            title="Có nhân vật còn thiếu ảnh"
            action={
              setup?.owner ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowSetup(true);
                    select(null);
                  }}
                >
                  Vẽ thêm ảnh còn thiếu
                </Button>
              ) : (
                <Link href={charactersHref} className={buttonClasses("outline", "sm")}>
                  Mở trang Nhân vật
                </Link>
              )
            }
          >
            {castGaps.map((gap) => (
              <p key={gap.characterId}>{gap.message}</p>
            ))}
          </Alert>
        )}

        {error && (
          <Alert
            action={
              !loaded ? (
                <Button size="sm" variant="outline" onClick={loadAll}>
                  Thử lại
                </Button>
              ) : undefined
            }
          >
            {error}
          </Alert>
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

          <div className="flex min-w-0 flex-col gap-5">
            {!loaded ? (
              <div role="status" aria-label="Đang tải" className="flex flex-col gap-4">
                <Skeleton className="h-7 w-40 rounded-lg" />
                <Skeleton className="h-32" />
                <Skeleton className="h-11 w-36 rounded-xl" />
              </div>
            ) : !episode && !channelProfile && (!setup?.owner || missingFields.length > 0) ? (
              setup?.owner ? (
                <section className="flex max-w-2xl flex-col gap-5" aria-labelledby="channel-setup-title">
                  <header>
                    <h2 id="channel-setup-title" className="text-xl font-semibold th-text-primary">Còn thiếu một chút hồ sơ kênh</h2>
                    <p className="mt-1 text-sm th-text-secondary">
                      Kịch bản sẽ bám theo hồ sơ này. Sửa lúc nào cũng được ở Cài đặt kênh, tập đã làm không bị ảnh hưởng.
                    </p>
                  </header>
                  {missingFields.map((field) =>
                    field === "positioning" ? (
                      <Textarea
                        key={field}
                        id={`profile-${field}`}
                        label={PROFILE_FIELD_LABEL[field]}
                        value={profileDraft[field] || ""}
                        onChange={(event) => setField(field)(event.target.value)}
                        maxLength={PROFILE_FIELD_LIMIT[field]}
                        rows={3}
                        placeholder={PROFILE_FIELD_PLACEHOLDER[field]}
                      />
                    ) : (
                      <Input
                        key={field}
                        id={`profile-${field}`}
                        label={PROFILE_FIELD_LABEL[field]}
                        value={profileDraft[field] || ""}
                        onChange={(event) => setField(field)(event.target.value)}
                        maxLength={PROFILE_FIELD_LIMIT[field]}
                        placeholder={PROFILE_FIELD_PLACEHOLDER[field]}
                      />
                    ),
                  )}
                  <p className="text-xs th-text-secondary">Nhân vật, ảnh và giọng nói chỉnh ở trang Nhân vật.</p>
                  <Button className="w-fit" onClick={() => act(() => saveChannelProfile())} loading={busy} disabled={!draftComplete}>
                    Lưu hồ sơ
                  </Button>
                </section>
              ) : (
                <Alert tone="info" title="Kênh chưa sẵn sàng làm phim">
                  Chủ kênh cần điền hồ sơ kênh trước. Nhờ chủ kênh mở trang Phim ngắn một lần nhé.
                </Alert>
              )
            ) : !episode && !channelProfile ? (
              error ? (
                <Button className="w-fit" variant="outline" loading={busy} onClick={() => act(() => saveChannelProfile())}>
                  Thử lại
                </Button>
              ) : (
                <div role="status" aria-label="Đang chuẩn bị hồ sơ kênh" className="flex flex-col gap-4">
                  <Skeleton className="h-7 w-40 rounded-lg" />
                  <Skeleton className="h-32" />
                </div>
              )
            ) : !episode && setup && (!setup.ready || showSetup) ? (
              <FilmSetupPanel
                base={base}
                workspace={workspace}
                characters={setup.characters}
                castIds={(channelProfile?.roles || []).map((role) => role.characterId)}
                pointsPerImage={setup.pointsPerImage}
                available={available}
                owner={setup.owner}
                charactersHref={charactersHref}
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
                  available={available}
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
                    key={JSON.stringify(autopilot)}
                    settings={autopilot}
                    episodes={episodes}
                    saving={busy}
                    onSave={(next) =>
                      act(async () => {
                        await api(`${base}/film-automation`, scheduleBody(next), "PUT");
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
                    refundedPoints={runRefundedPoints(run, planTasks)}
                    onPause={() => act(async () => void (await api(`${base}/production-runs/${run.id}`, { action: "pause" }, "PATCH")))}
                    onResume={() => act(async () => void (await resume()))}
                    onCancel={() => setCancelTarget(run.id)}
                    onRetry={() => act(() => retryRun(run))}
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
                    onTopUp={() => setTopUpOpen(true)}
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
                          // Viết lại giữ đúng chất lượng, thể loại và cách quay của tập gốc.
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

                <ScriptPanel title={plan?.title || ""} lines={lines} editHref={plan ? advancedHref : null} />
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
                    Tập này đang chỉnh tay.{" "}
                    <Link href={advancedHref} className="th-text-accent underline-offset-2 hover:underline">Mở tiếp</Link>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
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
        message="Phần đã làm vẫn được giữ lại."
        confirmText="Huỷ tập"
        variant="danger"
      />

      {run && (
        <OutOfPointsModal
          open={topUpOpen}
          onClose={() => setTopUpOpen(false)}
          required={Math.max(1, run.max_points_per_film - run.points_committed)}
          current={available ?? 0}
          action="Làm tiếp tập phim"
          onFunded={() => {
            void wallet.refreshBalance();
            void act(async () => void (await resume()));
          }}
        />
      )}
    </PageContainer>
  );
}
