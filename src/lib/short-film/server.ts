import "server-only";
import { isProjectMediaPath } from "@/lib/project-media-path";
import crypto from "node:crypto";
import {
  validateStory,
  type ChannelProfile,
  type Story,
} from "../family-catalogue";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { normalizeScene, type SceneInput } from "@/lib/multiscene-video";
import {
  estimateImageGenerationPrice,
  estimateGeminiTtsPrice,
  AI_PRICE_MARKUP_MULTIPLIER,
  AI_PRICING_USD_VND,
  BILLING_POINT_FLOOR_VND,
} from "@/lib/ai-pricing";
import {
  FILM_MODELS,
  assertFixedVoiceShot,
  currentSceneTask,
  sceneReferenceImageTasks,
  referencePackReady,
  speechLines,
  speechDirection,
  speechTasks,
  dubbingSchedule,
  measuredDubbedScene,
  finalClipKind,
  filmVideoInputs,
  type FilmPlan,
  type FilmCast,
  type FilmScene,
  type FilmTask,
  type QuotedTask,
  type FilmKind,
  isGeminiTtsModel,
} from "./contracts";
import { fixedVoiceEnabled } from "./features";
import {
  seedanceReferenceModel,
  seedanceMaxDuration,
  seedanceReferenceLimit,
} from "../video-models";
import { normalizeFamilyFatherTerms } from "../family-terminology";
import { performanceCheck } from "../performance-direction";
import { automaticGuestVoice } from "./guest-voices";
import { FILM_MOTION_PROMPT_VERSION } from "../film-motion-policy";
export const hash = (v: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
function stableSegmentId(sceneId: string, sequenceIndex: number) {
  const value = hash(`${sceneId}:segment:${sequenceIndex}`).slice(0, 32).split("");
  value[12] = "5";
  value[16] = ["8", "9", "a", "b"][parseInt(value[16], 16) % 4];
  const joined = value.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}
export class FilmError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const fail = (e: unknown) =>
  NextResponse.json(
    { error: e instanceof Error ? e.message : "Không xử lý được phim." },
    { status: e instanceof FilmError ? e.status : 500 },
  );
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export async function access(request: NextRequest, ref: string) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) throw new FilmError("Phiên đăng nhập đã hết hạn.", 401);
  const q = supabase
    .from("projects")
    .select(
      "id,user_id,name,brand_voice,audience,content_guidelines,workspace_version,watermark_url,watermark_position,watermark_opacity",
    )
    .limit(1);
  const { data: project, error } = await (
    UUID.test(ref) ? q.eq("id", ref) : q.eq("slug", ref)
  ).maybeSingle();
  if (error || !project)
    throw new FilmError("Không tìm thấy dự án hoặc đã hết quyền.", 404);
  return { supabase, admin: getSupabaseAdmin(), user, project };
}
export type Access = Awaited<ReturnType<typeof access>>;
export async function readPlan(a: Access, id: string) {
  const { data, error } = await a.admin
    .from("video_plans")
    .select(
      "*,video_plan_scenes(*),short_film_script_reviews(version,reviewed_at)",
    )
    .eq("id", id)
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .is("archived_at", null)
    .single();
  if (error || !data)
    throw new FilmError("Không tìm thấy phim trong workspace hiện tại.", 404);
  return {
    ...data,
    script_review:
      data.short_film_script_reviews?.find(
        (r: { version: number }) => r.version === data.version,
      ) || null,
    video_plan_scenes: data.video_plan_scenes
      .filter((s: FilmScene) => !s.deleted_at)
      .sort((x: FilmScene, y: FilmScene) => x.scene_index - y.scene_index),
  } as FilmPlan;
}
export function checkVersion(
  a: Access,
  body: Record<string, unknown>,
  plan?: FilmPlan,
) {
  if (Number(body.workspaceVersion) !== a.project.workspace_version)
    throw new FilmError(
      "Workspace đã thay đổi. Hãy tải lại bản hiện tại.",
      409,
    );
  if (plan && Number(body.expectedVersion) !== plan.version)
    throw new FilmError(
      "Bản nháp đã đổi ở tab khác. Nội dung đang nhập vẫn được giữ.",
      409,
    );
}
export async function freezeCast(
  a: Access,
  ids: string[],
  previous: FilmCast[] = [],
) {
  if (ids.length > 4) throw new FilmError("Tối đa bốn nhân vật trong phim.");
  if (!ids.length) return [];
  const { data: chars, error } = await a.admin
    .from("characters")
    .select("id,name,description,personality,continuity_asset_id")
    .eq("project_id", a.project.id)
    .in("id", ids);
  if (error || chars?.length !== ids.length)
    throw new FilmError("Nhân vật không thuộc dự án.");
  const { data: channel } = await a.admin
    .from("channel_profiles")
    .select("profile")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const coreCharacterIds = new Set(
    Array.isArray(channel?.profile?.roles)
      ? channel.profile.roles
          .map((role: { characterId?: unknown }) => String(role.characterId || ""))
          .filter(Boolean)
      : [],
  );
  const usedVoices = new Set(
    previous
      .map((character) => character.voice?.voice_id)
      .filter((voice): voice is string => Boolean(voice)),
  );
  const cast: FilmCast[] = [];
  const orderedChars = ids.map(
    (id) => chars.find((character) => character.id === id)!,
  );
  for (const c of orderedChars) {
    const old = previous.find((x) => x.characterId === c.id);
    const { data: v } = await a.admin
      .from("asset_versions")
      .select("id,version,reference_images(image_url,is_primary,role)")
      .eq("asset_id", c.continuity_asset_id)
      .eq("status", "locked")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const orderedReferences = [...(v?.reference_images || [])].sort(
      (left: { is_primary: boolean }, right: { is_primary: boolean }) =>
        Number(right.is_primary) - Number(left.is_primary),
    );
    const primary = orderedReferences.find(
      (r: { is_primary: boolean }) => r.is_primary,
    )?.image_url;
    if (!old && (!v || !primary))
      throw new FilmError(`${c.name} cần ảnh chuẩn được duyệt.`);
    const { data: voice } = await a.admin
      .from("character_voice_versions")
      .select("id,voice_id,model,settings")
      .eq("character_id", c.id)
      .eq("workspace_version", a.project.workspace_version)
      .not("approved_at", "is", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const oldVoice = old?.voice;
    const frozenVoice = voice
      ? { ...voice, source: "approved" as const }
      : oldVoice ||
        (!coreCharacterIds.has(c.id)
          ? automaticGuestVoice({
              projectId: a.project.id,
              workspaceVersion: a.project.workspace_version,
              character: c,
              usedVoices,
            })
          : undefined);
    if (frozenVoice?.voice_id) usedVoices.add(frozenVoice.voice_id);
    // Never mix a locked reference set with mutable avatars or expression grids.
    cast.push({
      ...old,
      ...(!old
        ? {
            characterId: c.id,
            name: c.name,
            description: c.description || "",
            personality: c.personality || "",
            imageUrl: primary,
            referenceImages: orderedReferences
              .map((reference: { image_url: string }) => reference.image_url)
              .filter(Boolean),
            assetVersionId: v!.id,
            assetVersion: v!.version,
          }
        : {}),
      ...(frozenVoice ? { voice: frozenVoice } : {}),
    } as FilmCast);
  }
  return cast;
}
export async function savePlan(
  a: Access,
  body: Record<string, unknown>,
  old?: FilmPlan,
) {
  checkVersion(a, body, old);
  const inputs = body.scenes as (SceneInput & { camera?: string })[];
  const videoModel = seedanceReferenceModel(body.videoModel ?? old?.video_model);
  const maxVideoDuration = seedanceMaxDuration(videoModel);
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 12)
    throw new FilmError("Cần 1–12 cảnh.");
  if (inputs.some((s) => s.storyboard) && body.audioMode === "fixed")
    throw new FilmError(
      "Storyboard nhiều người dùng lồng tiếng theo từng lượt; đồng bộ môi một người cần cảnh riêng.",
    );
  const ids = [...new Set(inputs.flatMap((s) => s.characterIds || []))];
  const cast = await freezeCast(
    a,
    ids,
    body.refreshCast === true ? [] : old?.cast_snapshot,
  );
  const canonicalFamily =
    a.project.name === "Bánh Bao & Đậu Đỏ" ||
    cast.some((character) => character.name === "Bố");
  const normalizedInputs = canonicalFamily
    ? normalizeFamilyFatherTerms(inputs)
    : inputs;
  const rows = normalizedInputs.map((raw, i) => {
    let s: ReturnType<typeof normalizeScene>;
    try {
      s = normalizeScene(raw);
    } catch (e) {
      throw new FilmError(
        e instanceof Error ? e.message : "Storyboard không hợp lệ.",
      );
    }
    if (s.durationSeconds > maxVideoDuration)
      throw new FilmError(
        `Cảnh ${i + 1} dài ${s.durationSeconds} giây, vượt giới hạn ${maxVideoDuration} giây của model đã chọn. Hãy dùng AI soạn lại storyboard.`,
      );
    if (
      s.characterIds.some((id) => !ids.includes(id)) ||
      (s.speakerCharacterId &&
        !s.characterIds.includes(s.speakerCharacterId)) ||
      (s.dialogue && !s.speakerCharacterId && !s.storyboard)
    )
      throw new FilmError(`Cảnh ${i + 1} cần đúng người nói trong cast.`);
    const sceneId = raw.id || crypto.randomUUID();
    const storyboard = s.storyboard
      ? {
          ...s.storyboard,
          beats: s.storyboard.beats.map((beat, sequenceIndex) => ({
            ...beat,
            segmentId:
              beat.segmentId || stableSegmentId(sceneId, sequenceIndex),
          })),
        }
      : null;
    const row = {
      id: sceneId,
      scene_index: i,
      storyboard,
      performance_direction: s.performanceDirection || s.storyboard?.performanceDirection || null,
      cast_snapshot: cast.filter((c) => s.characterIds.includes(c.characterId)),
      speaker_character_id: s.speakerCharacterId,
      dialogue: s.dialogue,
      action: s.action,
      setting: s.setting,
      camera: String(raw.camera || "").slice(0, 600),
      duration_seconds: s.durationSeconds,
      start_image_url: s.startImageUrl,
      end_image_url: s.endImageUrl,
      // Reference-guided Seedance receives the complete image pack directly.
      // A prior clip's last frame is never promoted to the next scene input.
      follows_previous: false,
      image_prompt: s.imagePrompt,
      motion_prompt: s.motionPrompt,
      source_mode: s.sourceMode,
    };
    const { id, scene_index, storyboard: rowStoryboard, ...visual } = row;
    void id;
    void scene_index;
    const storyboardForHash = rowStoryboard
      ? {
          ...rowStoryboard,
          beats: rowStoryboard.beats.map(({ segmentId: _segmentId, ...beat }) => {
            void _segmentId;
            return beat;
          }),
        }
      : null;
    return {
      ...row,
      input_hash: hash({
        ...visual,
        ...(storyboardForHash ? { storyboard: storyboardForHash } : {}),
      }),
    };
  });
  let story = body.story === undefined ? old?.story : body.story;
  if (canonicalFamily) story = normalizeFamilyFatherTerms(story);
  if (story != null) {
    if (JSON.stringify(story).length > 25000)
      throw new FilmError("Câu chuyện quá dài.");
    const { data: profile, error } = await a.admin
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .eq("version", (story as Story).profileVersion)
      .maybeSingle();
    if (error || !profile)
      throw new FilmError("Không tìm thấy phiên bản hồ sơ kênh.");
    try {
      story = validateStory(story, profile.profile, ids);
    } catch (e) {
      throw new FilmError(
        e instanceof Error ? e.message : "Câu chuyện không hợp lệ.",
      );
    }
  }
  const plan = {
    title: canonicalFamily
      ? normalizeFamilyFatherTerms(
          String(body.title || "Phim ngắn").slice(0, 160),
        )
      : String(body.title || "Phim ngắn").slice(0, 160),
    brief: canonicalFamily
      ? normalizeFamilyFatherTerms(String(body.brief || "").slice(0, 4000))
      : String(body.brief || "").slice(0, 4000),
    caption: canonicalFamily
      ? normalizeFamilyFatherTerms(String(body.caption || "").slice(0, 5000))
      : String(body.caption || "").slice(0, 5000),
    format: ["9:16", "1:1", "16:9", "4:5"].includes(String(body.format))
      ? body.format
      : "16:9",
    resolution: body.resolution === "1080p" ? "1080p" : "720p",
    video_model: videoModel,
    audio_mode:
      body.audioMode === "native"
        ? "native"
        : body.audioMode === "fixed"
          ? "fixed"
          : "dubbed",
    subtitles: body.subtitles !== false,
    story,
    trim_speech:
      body.trimSpeech === undefined
        ? old?.trim_speech !== false
        : body.trimSpeech !== false,
    target_duration_seconds:
      Number.isInteger(Number(body.targetDurationSeconds)) &&
      Number(body.targetDurationSeconds) >= 15 &&
      Number(body.targetDurationSeconds) <= 120
        ? Number(body.targetDurationSeconds)
        : 30,
    cast_snapshot: cast,
  };
  const { data, error } = await a.admin.rpc("save_film_plan", {
    p_project: a.project.id,
    p_actor: a.user.id,
    p_workspace: a.project.workspace_version,
    p_id: old?.id || crypto.randomUUID(),
    p_expected: old?.version ?? null,
    p_plan: plan,
    p_scenes: rows,
  });
  if (error)
    throw new FilmError(
      error.message,
      error.message.includes("VERSION") ? 409 : 400,
    );
  if (old && old.caption !== plan.caption) {
    const { data: current } = await a.admin
      .from("video_plans")
      .select("latest_content_output_id")
      .eq("id", old.id)
      .single();
    if (current?.latest_content_output_id) {
      const { error: captionError } = await a.admin
        .from("content_outputs")
        .update({ caption: plan.caption })
        .eq("id", current.latest_content_output_id);
      if (captionError) throw captionError;
    }
  }
  return readPlan(a, data);
}

export async function refreshPlanCastIfStale(a: Access, plan: FilmPlan) {
  const ids = [
    ...new Set(
      plan.video_plan_scenes.flatMap((scene) =>
        scene.cast_snapshot.map((character) => character.characterId),
      ),
    ),
  ];
  if (!ids.length) return plan;
  const latest = await freezeCast(a, ids, []);
  const currentVersions = new Map(
    plan.cast_snapshot.map((character) => [
      character.characterId,
      character.assetVersionId,
    ]),
  );
  if (
    latest.every(
      (character) =>
        currentVersions.get(character.characterId) === character.assetVersionId,
    )
  )
    return plan;

  let story = plan.story;
  if (story) {
    const { data: channel } = await a.admin
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const profile = channel?.profile as ChannelProfile | null;
    if (profile?.visualDirection?.prompt)
      story = { ...story, profileVersion: profile.version };
  }

  return savePlan(
    a,
    {
      workspaceVersion: a.project.workspace_version,
      expectedVersion: plan.version,
      refreshCast: true,
      title: plan.title,
      brief: plan.brief,
      caption: plan.caption,
      format: plan.format,
      resolution: plan.resolution,
      videoModel: plan.video_model,
      audioMode: plan.audio_mode,
      subtitles: plan.subtitles,
      trimSpeech: plan.trim_speech,
      targetDurationSeconds: plan.target_duration_seconds,
      story,
      scenes: plan.video_plan_scenes.map((scene) => ({
        id: scene.id,
        characterIds: scene.cast_snapshot.map(
          (character) => character.characterId,
        ),
        speakerCharacterId: scene.speaker_character_id,
        dialogue: scene.dialogue,
        action: scene.action,
        setting: scene.setting,
        camera: scene.camera,
        durationSeconds: scene.duration_seconds,
        startImageUrl: scene.start_image_url,
        endImageUrl: scene.end_image_url,
        followsPrevious: scene.follows_previous,
        imagePrompt: scene.image_prompt,
        motionPrompt: scene.motion_prompt,
        sourceMode: scene.source_mode,
        storyboard: scene.storyboard,
        performanceDirection: scene.performance_direction,
      })),
    },
    plan,
  );
}
export async function signed(a: Access, path: string) {
  if (!isProjectMediaPath(a.project.id, path))
    throw new FilmError("Media không thuộc dự án.", 403);
  const { data, error } = await a.admin.storage
    .from("content-media")
    .createSignedUrl(path, 3600);
  if (error || !data) throw new FilmError("Không đọc được media.");
  return data.signedUrl;
}
export async function tasksForPlan(a: Access, id: string) {
  const { data, error } = await a.admin
    .from("short_film_tasks")
    .select("*")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .eq("plan_id", id)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw error;
  return data as FilmTask[];
}
export async function publicTasks(a: Access, tasks: FilmTask[]) {
  return Promise.all(
    tasks.map(async (t) => ({
      id: t.id,
      kind: t.kind,
      displayName:
        typeof t.input.displayName === "string"
          ? t.input.displayName
          : undefined,
      scene_id: t.scene_id,
      scene_version: t.scene_version,
      segment_id: t.segment_id,
      segment_revision: t.segment_revision,
      status: t.status,
      error: t.error,
      approved_at: t.approved_at,
      auto_accepted_at: t.auto_accepted_at,
      production_run_id: t.production_run_id,
      points: t.points,
      created_at: t.created_at,
      input: {
        imageTaskId: t.input.imageTaskId,
        audioTaskId: t.input.audioTaskId,
        audioTaskIds: t.input.audioTaskIds,
        videoTaskId: t.input.videoTaskId,
        beatIndex: t.input.beatIndex,
        speakerCharacterId: t.input.speakerCharacterId,
        voiceProfileVersion: t.input.voiceProfileVersion,
        dialogue: t.input.dialogue,
        segmentId: t.input.segmentId,
        segmentRevision: t.input.segmentRevision,
        usedDuration: t.input.usedDuration,
        referenceImageId: t.input.referenceImageId,
        referenceRole: t.input.referenceRole,
        referencePurpose: t.input.referencePurpose,
        visualRequirements: t.input.visualRequirements,
        referenceBindings: t.input.referenceBindings,
        referenceTaskIds: t.input.referenceTaskIds,
      },
      result: t.result,
      url: t.result?.path ? await signed(a, String(t.result.path)) : undefined,
      posterUrl: t.result?.poster
        ? await signed(a, String(t.result.poster))
        : undefined,
      srtUrl: t.result?.srt ? await signed(a, String(t.result.srt)) : undefined,
    })),
  );
}
export async function modelPrice(
  model: string,
  inputs: Record<string, unknown>,
) {
  const r = await fetch("https://api.wavespeed.ai/api/v3/model/price", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model_id: model, inputs }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  const n = Number((j.data || j).discounted_price ?? (j.data || j).price);
  if (!r.ok || !Number.isFinite(n) || n <= 0)
    throw new FilmError(
      "Provider chưa trả giá hợp lệ. Chưa gửi lượt tạo.",
      503,
    );
  return Math.max(
    1,
    Math.ceil(
      (n * AI_PRICE_MARKUP_MULTIPLIER * AI_PRICING_USD_VND) /
        BILLING_POINT_FLOOR_VND,
    ),
  );
}
const accepted = (task?: FilmTask) =>
  !!(task?.approved_at || task?.auto_accepted_at);
export async function storeQuote(
  a: Access,
  tasks: QuotedTask[],
  plan?: FilmPlan,
  productionRunId?: string,
) {
  if (!tasks.length) throw new FilmError("Không có bước mới cần tạo.");
  const points = tasks.reduce((s, t) => s + t.points, 0);
  const { data, error } = await a.admin
    .from("short_film_quotes")
    .insert({
      project_id: a.project.id,
      plan_id: plan?.id,
      plan_version: plan?.version,
      workspace_version: a.project.workspace_version,
      created_by: a.user.id,
      production_run_id: productionRunId || null,
      tasks,
      points,
    })
    .select("id,points,expires_at")
    .single();
  if (error) throw error;
  return {
    ...data,
    items: tasks.map((t) => ({
      kind: t.kind,
      sceneId: t.sceneId,
      points: t.points,
    })),
  };
}
export function task(
  kind: FilmKind,
  input: Record<string, unknown>,
  points: number,
  scene?: FilmScene,
  dependencies: string[] = [],
): QuotedTask {
  return {
    id: crypto.randomUUID(),
    kind,
    input: {
      ...input,
      subjectKey: input.subjectKey || `${scene?.id}:${scene?.version}:${kind}`,
    },
    points,
    sceneId: scene?.id,
    sceneVersion: scene?.version,
    dependencies,
    hash: hash(input),
  };
}
export async function quotePlan(
  a: Access,
  plan: FilmPlan,
  body: Record<string, unknown>,
) {
  checkVersion(a, body, plan);
  const stage = String(body.stage || "prepare");
  if (stage === "frame")
    throw new FilmError(
      "Phim ngắn hiện dùng bộ ảnh tham chiếu; không còn lấy khung đầu/cuối để tạo video.",
      410,
    );
  if (plan.audio_mode === "native" && ["prepare", "video"].includes(stage))
    throw new FilmError(
      "Lưu phiên bản kịch bản sang lồng tiếng trước khi tạo mới.",
      409,
    );
  if (["prepare", "video"].includes(stage)) {
    const { count, error } = await a.admin
      .from("channel_profiles")
      .select("version", { head: true, count: "exact" })
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version);
    if (error) throw error;
    let automaticScriptPassed = false;
    if (body.productionRunId) {
      const { data: run } = await a.admin
        .from("short_film_production_runs")
        .select("id,snapshot")
        .eq("id", String(body.productionRunId))
        .eq("project_id", a.project.id)
        .eq("plan_id", plan.id)
        .eq("plan_version", plan.version)
        .maybeSingle();
      automaticScriptPassed = run?.snapshot?.scriptCheck === "passed";
    }
    if (count && !plan.script_review && !automaticScriptPassed)
      throw new FilmError(
        "Duyệt bản kịch bản hiện tại trước khi chuẩn bị media. Bản sửa cần duyệt lại.",
        409,
      );
  }
  const selected = Array.isArray(body.sceneIds)
    ? body.sceneIds
    : plan.video_plan_scenes.map((s) => s.id);
  const scenes = plan.video_plan_scenes.filter((s) => selected.includes(s.id));
  if (!scenes.length) throw new FilmError("Chọn cảnh cần tạo.");
  if (plan.audio_mode === "fixed" && ["prepare", "video"].includes(stage))
    scenes.forEach(assertFixedVoiceShot);
  const existing = await tasksForPlan(a, plan.id);
  let visualDirection = "";
  const profileVersion = (plan.story as Story | null)?.profileVersion;
  if (profileVersion) {
    const { data: channel } = await a.admin
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .eq("version", profileVersion)
      .maybeSingle();
    visualDirection = String(
      (channel?.profile as { visualDirection?: { prompt?: unknown } } | null)
        ?.visualDirection?.prompt || "",
    ).trim();
  }
  // An automatic run may only continue from work created by that run. Human
  // approved media can be reused deliberately; an unreviewed result from an
  // older attempt must never be pulled into a new production implicitly.
  const productionRunId =
    typeof body.productionRunId === "string" ? body.productionRunId : null;
  const eligible = productionRunId
    ? existing.filter(
        (candidate) =>
          candidate.production_run_id === productionRunId ||
          Boolean(candidate.approved_at || candidate.auto_accepted_at),
      )
    : existing;
  const tasks: QuotedTask[] = [];
  const latest = (s: FilmScene, kind: FilmKind) =>
    currentSceneTask(eligible, s, kind, plan.audio_mode);
  if (stage === "prepare")
    for (const s of scenes) {
      const performance = s.performance_direction || s.storyboard?.performanceDirection;
      if (performance) {
        const check = performanceCheck(performance);
        if (check.status !== "passed")
          throw new FilmError(
            `Hướng biểu cảm cảnh ${s.scene_index + 1} cần chỉnh trước khi tạo: ${check.issues.map((issue) => issue.reason).join(" ")}`,
            422,
          );
      }
      {
        const referencePlan = s.storyboard?.referencePlan;
        const references = referencePlan?.referenceImages || [
          {
            id: "legacy_start",
            role: "scene" as const,
            purpose: "Bố cục chính của cảnh",
            framing: s.camera || "Khung vừa",
            moment: "Trước hành động",
            prompt: s.image_prompt,
            requirementIds: [] as string[],
          },
        ];
        const currentReferences = new Map(
          sceneReferenceImageTasks(eligible, s).map((item) => [
            item.referenceId,
            item.task,
          ]),
        );
        for (const [referenceIndex, reference] of references.entries()) {
          if (
            accepted(currentReferences.get(reference.id)) &&
            body.regenerate !== true
          )
            continue;
          const requirements = (referencePlan?.requirements || []).filter(
            (requirement) => reference.requirementIds.includes(requirement.id),
          );
          const imported =
            referenceIndex === 0 &&
            s.source_mode === "manual" &&
            s.start_image_url;
          const prompt = [
            reference.prompt || s.image_prompt,
            `MỤC ĐÍCH KHUNG: ${reference.purpose}. CỠ CẢNH: ${reference.framing}. THỜI ĐIỂM: ${reference.moment}.`,
            requirements.length
              ? `BẰNG CHỨNG BẮT BUỘC TRÊN ẢNH: ${JSON.stringify(requirements)}. Chỉ đạt khi chính ảnh thể hiện được các bằng chứng này ở kích thước xem thực tế.`
              : "",
            referencePlan
              ? `LOGIC CÂU CHUYỆN: ${referencePlan.storyMechanism}. KHÁN GIẢ PHẢI THẤY: ${referencePlan.audienceMustSee.join("; ")}.`
              : "",
            `Bối cảnh ${s.setting}. Hành động ${s.action}. Máy quay ${s.camera}.`,
            visualDirection ||
              "Dựng đúng một khung ảnh điện ảnh theo phong cách của ảnh chuẩn, không lưới ảnh.",
            "Chỉ nhân vật cần thiết trong khung được xuất hiện; giữ nhận diện, tuổi, tỷ lệ cơ thể và trang phục. Không thêm người khác.",
            "Không phụ đề, nhãn giao diện, mũi tên hoặc watermark giả. Nếu bằng chứng yêu cầu chữ/số thật trên đạo cụ thì phải giữ đúng, rõ và đọc được.",
            reference.role === "scene"
              ? "Đây là ảnh bố cục/trạng thái của cảnh để model hiểu không gian và quan hệ nhân vật."
              : reference.role === "prop"
                ? "Đây là ảnh cận đạo cụ quyết định câu chuyện; ưu tiên số lượng, hình dáng và chữ/số phải đọc."
                : reference.role === "character"
                  ? "Đây là ảnh khóa nhận diện nhân vật; giữ đúng mặt, tóc, vóc dáng và trang phục."
                  : "Đây là ảnh khóa bối cảnh, ánh sáng và phong cách không gian.",
          ]
            .filter(Boolean)
            .join("\n");
          const input = {
            model: FILM_MODELS.image,
            ...(imported ? { importPath: imported } : {}),
            prompt,
            cast: s.cast_snapshot,
            dialogue: s.dialogue,
            speakerCharacterId: s.speaker_character_id,
            storyboard: s.storyboard || null,
            performanceDirection:
              s.performance_direction || s.storyboard?.performanceDirection || null,
            format: plan.format,
            referenceImageId: reference.id,
            referenceRole: reference.role,
            referencePurpose: reference.purpose,
            visualRequirements: requirements,
            visualStoryMechanism: referencePlan?.storyMechanism || "",
            displayName: `Ảnh ${referenceIndex + 2} · ${reference.purpose}`,
            subjectKey: `${s.id}:${s.version}:reference:${reference.id}:1`,
          };
          const p = input.importPath
            ? { customerPoints: 0 }
            : estimateImageGenerationPrice({
                model: FILM_MODELS.image,
                resolution: "1K",
                inputImageCount: s.cast_snapshot.length,
                prompt: input.prompt,
              });
          tasks.push(task("image", input, p.customerPoints, s));
        }
      }
      if (s.dialogue && plan.audio_mode !== "native") {
        for (const line of speechLines(s)) {
          const c = s.cast_snapshot.find(
            (character) => character.characterId === line.speakerCharacterId,
          );
          if (!c?.voice)
            throw new FilmError(
              `Duyệt giọng của ${c?.name || "người nói"} trước.`,
            );
          const voiceContinuityKey = `${plan.id}:${c.voice.id}:${line.speakerCharacterId}`;
          const prior =
            plan.audio_mode === "fixed"
              ? latest(s, "tts")
              : speechTasks(eligible, s).find(
                  (t) => t?.input.beatIndex === line.beatIndex,
                );
          if (accepted(prior) && body.regenerate !== true) {
            continue;
          }
          const voiceSettings = { ...(c.voice.settings || {}) };
          const direction = speechDirection(
            s,
            line.beatIndex,
            voiceSettings.direction,
          );
          delete voiceSettings.designedProfile;
          delete voiceSettings.provider;
          delete voiceSettings.voicePreset;
          delete voiceSettings.voiceName;
          delete voiceSettings.direction;
          const voiceModel = c.voice.model || FILM_MODELS.tts;
          const inputs = isGeminiTtsModel(voiceModel)
            ? {
                text: line.dialogue,
                voice: c.voice.voice_id,
                direction,
                language: "vi",
              }
            : {
                text: line.dialogue,
                voice_id: c.voice.voice_id,
                ...voiceSettings,
                format: "wav",
                sample_rate: 44100,
                channel: "1",
                language_boost: "Vietnamese",
              };
          const points = isGeminiTtsModel(voiceModel)
            ? estimateGeminiTtsPrice({
                model: voiceModel,
                text: line.dialogue,
                requestedSeconds: line.endSeconds - line.startSeconds,
              }).customerPoints
            : await modelPrice(voiceModel, inputs);
          const quoted = task(
            "tts",
            {
              model: voiceModel,
              provider: isGeminiTtsModel(voiceModel)
                ? "google"
                : "wavespeed",
              providerInputs: inputs,
              voiceProfileVersion: c.voice.id,
              speakerCharacterId: line.speakerCharacterId,
              beatIndex: line.beatIndex,
              dialogue: line.dialogue,
              voiceContinuityKey,
              subjectKey:
                plan.audio_mode === "fixed"
                  ? `${s.id}:${s.version}:tts`
                  : `${s.id}:${s.version}:tts:${line.beatIndex}`,
            },
            points,
            s,
            [],
          );
          tasks.push(quoted);
        }
      }
    }
  else if (stage === "video") {
    if (plan.audio_mode === "fixed" && !fixedVoiceEnabled(a.project.id))
      throw new FilmError(
        "Giọng cố định đang kiểm chứng. Bạn vẫn có thể chuẩn bị ảnh và nghe thử giọng.",
        409,
      );
    for (const s of scenes) {
      const image = latest(s, "image"),
        audio = latest(s, "tts");
      if (latest(s, "video") && body.regenerate !== true) continue;
      if (!image || !accepted(image) || !referencePackReady(eligible, s))
        throw new FilmError(
          `Duyệt đủ bộ ảnh đạo diễn của cảnh ${s.scene_index + 1} trước.`,
        );
      if (plan.audio_mode === "fixed" && s.dialogue && !accepted(audio))
        throw new FilmError(
          `Nghe và duyệt thoại cảnh ${s.scene_index + 1} trước.`,
        );
      const directed = plan.audio_mode === "dubbed"
        ? measuredDubbedScene(eligible, s, seedanceMaxDuration(plan.video_model))
        : { scene: s, measuredSpeechSeconds: undefined };
      const schedule =
        plan.audio_mode === "dubbed" ? dubbingSchedule(eligible, directed.scene) : [];
      if (
        plan.audio_mode === "dubbed" &&
        speechTasks(eligible, s).some((t) => !accepted(t))
      )
        throw new FilmError("Duyệt các lượt thoại trước khi tạo video.");
      const referenceTasks = sceneReferenceImageTasks(eligible, s).map(
        ({ referenceId, task: referenceTask }) => ({ referenceId, task: referenceTask! }),
      );
      const references: Array<{
        url: string;
        binding: string;
        source: { taskId: string } | { path: string } | { url: string };
      }> = [];
      for (const { referenceId, task: referenceTask } of referenceTasks) {
        if (!referenceTask?.result?.path)
          throw new FilmError("Bộ ảnh đạo diễn chưa lưu đủ file.");
        const authored = s.storyboard?.referencePlan?.referenceImages.find(
          (reference) => reference.id === referenceId,
        );
        references.push({
          url: await signed(a, String(referenceTask.result.path)),
          binding: `${authored?.role || "scene"}: ${authored?.purpose || "bố cục cảnh"}`,
          source: { taskId: referenceTask.id },
        });
      }
      for (const character of s.cast_snapshot) {
        for (const source of character.referenceImages.length
          ? character.referenceImages
          : [character.imageUrl]) {
          if (!source || references.some((reference) => reference.url === source)) continue;
          references.push({
            url: isProjectMediaPath(a.project.id, source)
              ? await signed(a, source)
              : source,
            binding: `character: ảnh nhận diện đã duyệt của ${character.name}; chỉ khóa mặt, tóc, vóc dáng và trang phục`,
            source: isProjectMediaPath(a.project.id, source)
              ? { path: source }
              : { url: source },
          });
        }
      }
      const referenceLimit = seedanceReferenceLimit(plan.video_model);
      if (references.length > referenceLimit)
        throw new FilmError(
          `Cảnh ${s.scene_index + 1} có ${references.length} ảnh tham chiếu, vượt giới hạn ${referenceLimit} của model. Chia cảnh hoặc bỏ ảnh hỗ trợ không thiết yếu trước khi mua video.`,
          422,
        );
      const packet = {
        urls: references.map((reference) => reference.url),
        bindings: references.map(
          (reference, index) => `@image${index + 1} = ${reference.binding}.`,
        ),
      };
      const inputs = filmVideoInputs(
        directed.scene,
        plan.audio_mode,
        plan.format,
        plan.resolution,
        packet,
        plan.audio_mode === "fixed" ? Number(audio?.result?.duration || 0) : 0,
        plan.video_model,
        directed.measuredSpeechSeconds,
      );
      const { reference_images: _signedReferenceUrls, ...storedInputs } = inputs;
      void _signedReferenceUrls;
      const v = task(
        "video",
        {
          model: plan.video_model,
          promptVersion: FILM_MOTION_PROMPT_VERSION,
          providerInputs: storedInputs,
          referenceTaskIds: referenceTasks.map(({ task: referenceTask }) => referenceTask.id),
          referenceSources: references.map((reference) => reference.source),
          referenceBindings: packet.bindings,
          visualRequirements: s.storyboard?.referencePlan?.requirements || [],
          visualStoryMechanism:
            s.storyboard?.referencePlan?.storyMechanism || "",
          audioTaskId: audio?.id,
          audioTaskIds: schedule.map((cue) => cue.audioTaskId),
          dubbingSchedule: schedule,
          audioMode: plan.audio_mode,
          cast: s.cast_snapshot,
          dialogue: s.dialogue,
          speakerCharacterId: s.speaker_character_id,
          storyboard: directed.scene.storyboard || null,
          performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
          format: plan.format,
          resolution: plan.resolution,
        },
        await modelPrice(plan.video_model, inputs),
        s,
      );
      tasks.push(v);
    }
  } else if (stage === "finish" || stage === "transcript") {
    for (const s of scenes) {
      const kind =
        stage === "finish" && plan.audio_mode !== "native" && s.dialogue
          ? finalClipKind(s, plan.audio_mode)
          : "transcribe";
      if (!s.dialogue || latest(s, kind)) continue;
      const video = latest(
        s,
        kind === "transcribe" && plan.audio_mode !== "native"
          ? finalClipKind(s, plan.audio_mode)
          : "video",
      );
      const audio = latest(s, "tts");
      if (!video?.result?.path)
        throw new FilmError(`Cảnh ${s.scene_index + 1} chưa có clip nguồn.`);
      const inputVideo = await signed(a, String(video.result.path));
      if (kind === "dub") {
        const schedule = video.input.dubbingSchedule;
        if (!Array.isArray(schedule) || !schedule.length)
          throw new FilmError(
            "Clip chưa có lịch lồng tiếng. Tạo bản chuyển động theo bản thoại đã duyệt.",
          );
        tasks.push(
          task(
            "dub",
            {
              model: "ffmpeg-dub-v1",
              videoTaskId: video.id,
              schedule,
              duration: video.result.duration,
              cast: s.cast_snapshot,
              dialogue: s.dialogue,
              storyboard: video.input.storyboard || s.storyboard || null,
              performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
              speakerCharacterId: s.speaker_character_id,
            },
            0,
            s,
            [video.id, ...schedule.map((cue) => String(cue.audioTaskId))],
          ),
        );
      } else if (kind === "lip_sync") {
        if (!audio?.result?.path) throw new FilmError("Thiếu audio đã duyệt.");
        const inputs = {
          video: inputVideo,
          audio: await signed(a, String(audio.result.path)),
          sync_mode: "silence",
        };
        tasks.push(
          task(
            kind,
            {
              model: FILM_MODELS.lip_sync,
              providerInputs: inputs,
              videoTaskId: video.id,
              audioTaskId: audio.id,
              duration: video.result.duration,
              dialogue: s.dialogue,
              speakerCharacterId: s.speaker_character_id,
              storyboard: s.storyboard || null,
              performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
              cast: s.cast_snapshot,
            },
            await modelPrice(FILM_MODELS.lip_sync, inputs),
            s,
          ),
        );
      } else {
        const inputs = {
          video: inputVideo,
          language: "vi",
          task: "transcribe",
          enable_timestamps: true,
          prompt: s.dialogue,
        };
        tasks.push(
          task(
            kind,
            {
              model: FILM_MODELS.transcribe,
              providerInputs: inputs,
              videoTaskId: video.id,
              dialogue: s.dialogue,
              audioMode: plan.audio_mode,
              dubbingSchedule:
                plan.audio_mode === "dubbed" ? video.input.schedule : null,
              speakerCharacterId: s.speaker_character_id,
              storyboard: s.storyboard || null,
              duration: video.result.duration,
            },
            await modelPrice(FILM_MODELS.transcribe, inputs),
            s,
          ),
        );
      }
    }
  } else if (stage === "render") {
    const clips = plan.video_plan_scenes.map((s) => {
      const clip = latest(s, finalClipKind(s, plan.audio_mode));
      const transcript = latest(s, "transcribe");
      if (!clip || !accepted(clip))
        throw new FilmError(
          `Duyệt clip cảnh ${s.scene_index + 1} trước khi ghép.`,
        );
      if (s.dialogue && !transcript)
        throw new FilmError(`Cảnh ${s.scene_index + 1} chưa chép lời xong.`);
      return {
        taskId: clip.id,
        transcriptTaskId: transcript?.id,
        sceneId: s.id,
        version: s.version,
        trimSpeech: !!plan.trim_speech && !!s.dialogue,
        minimumOutSeconds: (clip.input.storyboard as FilmScene["storyboard"])?.contentEndSeconds || s.storyboard?.contentEndSeconds || 0,
      };
    });
    tasks.push(
      task(
        "render",
        {
          clips,
          format: plan.format,
          resolution: plan.resolution,
          subtitles: plan.subtitles,
          caption: plan.caption,
          brief: plan.brief,
          brand: { ...a.project },
          subjectKey: `${plan.id}:${plan.version}:render`,
        },
        0,
      ),
    );
  } else throw new FilmError("Bước sản xuất không hợp lệ.");
  return storeQuote(a, tasks, plan, productionRunId || undefined);
}
