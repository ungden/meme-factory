import "server-only";
import { isProjectMediaPath } from "@/lib/project-media-path";
import { errorCode, humanizeError } from "@/lib/error-messages";
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
  isAcceptedTask as accepted,
  type FilmPlan,
  type FilmCast,
  type FilmScene,
  type FilmTask,
  type QuotedTask,
  type FilmKind,
  isGeminiTtsModel,
} from "./contracts";
import { fixedVoiceEnabled } from "./features";
import { generateFilmGuestReference } from "@/lib/gemini-image";
import {
  seedanceReferenceModel,
  seedanceMaxDuration,
  seedanceReferenceLimit,
} from "../video-models";
import { normalizeFamilyFatherTerms } from "../family-terminology";
import { performanceCheck } from "../performance-direction";
import { automaticGuestVoice } from "./guest-voices";
import { assertMediaCoherent, coherenceMessage } from "./media-coherence";
import { FILM_MOTION_PROMPT_VERSION } from "../film-motion-policy";
import {
  SHORT_FORM_SPEECH_POLICY_VERSION,
  spokenSeconds,
} from "../film-storyboard";
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
/**
 * Biên duy nhất biến lỗi thành phản hồi API. Trước đây hàm này trả thẳng
 * `e.message`, nên mã máy như FAMILY_EDITORIAL_NEEDS_REVIEW hiện nguyên văn cho
 * người dùng, còn một lỗi Postgres thô (object, không phải Error) thì rơi hết
 * vào câu chung 500 và mất sạch thông tin thật.
 *
 * Giờ: log nguyên bản cho người vận hành, trả câu tiếng Việt cho người dùng,
 * kèm `code` để hỗ trợ đối chiếu. FilmError vốn đã là tiếng Việt nên
 * humanizeError giữ nguyên.
 */
export const fail = (e: unknown) => {
  const status = e instanceof FilmError ? e.status : 500;
  const code = errorCode(e);
  if (status >= 500)
    console.error("short-film request failed", {
      code,
      message: e instanceof Error ? e.message : String(e),
      detail: e instanceof Error ? undefined : e,
    });
  return NextResponse.json(
    { error: humanizeError(e, "Không xử lý được phim."), ...(code ? { code } : {}) },
    { status },
  );
};
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
/**
 * Hồ sơ kênh mới nhất trong đúng phạm vi workspace. Tách riêng khỏi
 * `channelProfileAt` một cách có chủ ý: dùng nhầm bản mới nhất cho một kịch bản
 * đã ghim phiên bản sẽ đưa chỉ đạo hình ảnh sai vào một lượt tạo có trả tiền.
 */
export async function latestChannelProfile(a: Access) {
  const { data } = await a.admin
    .from("channel_profiles")
    .select("profile")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.profile as ChannelProfile | null) || null;
}

/** Hồ sơ kênh ở đúng phiên bản một kịch bản đã ghim. */
export async function channelProfileAt(a: Access, version: number) {
  const { data, error } = await a.admin
    .from("channel_profiles")
    .select("profile")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .eq("version", version)
    .maybeSingle();
  return {
    profile: (data?.profile as ChannelProfile | null) || null,
    error: error || null,
  };
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
  if (error) throw error;
  const characterIds = new Set((chars || []).map((c) => c.id));
  // Guest characters are generated per plan, not per project. A guest id must
  // exist in the plan-scoped table and carry its generated reference image.
  const guestIds = ids.filter((id) => !characterIds.has(id));
  let guestRows: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    personality: string | null;
    image_url: string | null;
  }> = [];
  if (guestIds.length) {
    const { data, error: guestError } = await a.admin
      .from("film_guest_characters")
      .select("id,key,name,description,personality,image_url")
      .eq("project_id", a.project.id)
      .in("id", guestIds);
    if (guestError) throw guestError;
    guestRows = data || [];
    const found = new Set(guestRows.map((g) => g.id));
    // A refresh can run before the guest row write landed; the plan's frozen
    // cast snapshot is still the same identity.
    if (
      guestIds.some(
        (id) =>
          !found.has(id) &&
          !previous.some((character) => character.isGuest && character.characterId === id),
      )
    )
      throw new FilmError("Nhân vật khách mời không thuộc tập phim này.");
  }
  const channelProfile = await latestChannelProfile(a);
  const coreCharacterIds = new Set(
    Array.isArray(channelProfile?.roles)
      ? channelProfile.roles
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
  for (const id of ids) {
    const c = chars?.find((character) => character.id === id);
    if (!c) {
      // Plan-scoped guest: reuse its generated reference; identity must not
      // change between saves, so the frozen snapshot/row is the source of truth.
      const row = guestRows.find((g) => g.id === id);
      const frozen = row
        ? {
            key: row.key,
            name: row.name,
            description: row.description || "",
            personality: row.personality || "",
            imageUrl: row.image_url || "",
          }
        : (() => {
            const snap = previous.find((x) => x.characterId === id);
            return snap?.isGuest
              ? {
                  key: snap.guestKey || snap.characterId,
                  name: snap.name,
                  description: snap.description,
                  personality: snap.personality,
                  imageUrl: snap.imageUrl,
                }
              : null;
          })();
      if (!frozen)
        throw new FilmError("Nhân vật khách mời không thuộc tập phim này.");
      if (!frozen.imageUrl)
        throw new FilmError(`${frozen.name} chưa có ảnh chuẩn khách mời.`);
      const old = previous.find((x) => x.characterId === id);
      const frozenVoice = old?.voice || automaticGuestVoice({
        projectId: a.project.id,
        workspaceVersion: a.project.workspace_version,
        character: { id, name: frozen.name, description: frozen.description },
        usedVoices,
      });
      if (frozenVoice?.voice_id) usedVoices.add(frozenVoice.voice_id);
      cast.push({
        ...old,
        ...(!old
          ? {
              characterId: id,
              name: frozen.name,
              description: frozen.description,
              personality: frozen.personality,
              imageUrl: frozen.imageUrl,
              referenceImages: [frozen.imageUrl],
              isGuest: true,
              guestKey: frozen.key,
            }
          : {}),
        ...(frozenVoice ? { voice: frozenVoice } : {}),
      } as FilmCast);
      continue;
    }
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
  const planId = old?.id || crypto.randomUUID();
  const inputs = body.scenes as (SceneInput & { camera?: string })[];
  const videoModel = seedanceReferenceModel(body.videoModel ?? old?.video_model);
  const maxVideoDuration = seedanceMaxDuration(videoModel);
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 12)
    throw new FilmError("Cần 1–12 cảnh.");
  if (inputs.some((s) => s.storyboard) && body.audioMode === "fixed")
    throw new FilmError(
      "Storyboard nhiều người dùng lồng tiếng theo từng lượt; đồng bộ môi một người cần cảnh riêng.",
    );
  // Guests are one-off per video. The body carries their keys; an existing plan
  // re-derives them from its frozen cast so refreshes never re-invent guests.
  const guestInputs = (() => {
    if (Array.isArray(body.guests))
      return body.guests
        .map((item) => {
          const guest = item as Record<string, unknown>;
          const name = String(guest.name || "").trim().slice(0, 80);
          if (!name) return null;
          return {
            key: String(guest.key || `guest-${crypto.randomUUID()}`)
              .trim()
              .slice(0, 64),
            name,
            description: String(guest.description || "").trim().slice(0, 1200),
            personality: String(guest.personality || "").trim().slice(0, 800),
          };
        })
        .filter((guest): guest is NonNullable<typeof guest> => guest !== null)
        .slice(0, 2);
    return (old?.cast_snapshot || [])
      .filter((character) => character.isGuest)
      .map((character) => ({
        key: character.guestKey || character.characterId,
        name: character.name,
        description: character.description,
        personality: character.personality,
      }))
      .slice(0, 2);
  })();
  const guestByKey = new Map<
    string,
    {
      id: string;
      key: string;
      name: string;
      description: string;
      personality: string;
      imageUrl: string;
    }
  >();
  const guestRowsToPersist: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    personality: string;
    image_url: string;
  }> = [];
  if (guestInputs.length) {
    const visualPrompt = (await latestChannelProfile(a))?.visualDirection
      ?.prompt;
    for (const guest of guestInputs) {
      const { data: existing } = old
        ? await a.admin
            .from("film_guest_characters")
            .select("id,key,name,description,personality,image_url")
            .eq("plan_id", planId)
            .eq("key", guest.key)
            .maybeSingle()
        : { data: null };
      const id = existing?.id || crypto.randomUUID();
      let imageUrl = existing?.image_url || "";
      if (!imageUrl) {
        // A guest gets a fresh generated identity for this one video; the
        // plan stores the image so no other video reuses this exact guest.
        const generated = await generateFilmGuestReference({
          name: guest.name,
          description: guest.description,
          personality: guest.personality,
          artDirectionPrompt: visualPrompt,
          aspectRatio: "4:5",
        });
        const path = `${a.project.id}/film-guests/${planId}/${id}.png`;
        const { error: uploadError } = await a.admin.storage
          .from("content-media")
          .upload(path, Buffer.from(generated.image, "base64"), {
            contentType: "image/png",
            upsert: true,
          });
        if (uploadError)
          throw new FilmError("Không lưu được ảnh nhân vật khách mời.");
        imageUrl = path;
      }
      guestByKey.set(guest.key, {
        id,
        key: guest.key,
        name: guest.name,
        description: guest.description,
        personality: guest.personality,
        imageUrl,
      });
      guestRowsToPersist.push({
        id,
        key: guest.key,
        name: guest.name,
        description: guest.description,
        personality: guest.personality,
        image_url: imageUrl,
      });
    }
  }
  // Scenes from the AI writer reference guest keys; the database stores the
  // plan-scoped guest rows' ids in cast_snapshot and speaker columns.
  const remappedInputs = inputs.map((scene) => {
    const characterIds = (scene.characterIds || []).map(
      (id) => guestByKey.get(id)?.id || id,
    );
    const speakerCharacterId = scene.speakerCharacterId
      ? guestByKey.get(scene.speakerCharacterId)?.id || scene.speakerCharacterId
      : scene.speakerCharacterId;
    return { ...scene, characterIds, speakerCharacterId };
  });
  const ids = [...new Set(remappedInputs.flatMap((s) => s.characterIds || []))];
  const guestUuids = new Set(
    [...guestByKey.values()].map((guest) => guest.id),
  );
  const previousCast = body.refreshCast === true ? [] : old?.cast_snapshot;
  const coreCast = await freezeCast(
    a,
    ids.filter((id) => !guestUuids.has(id)),
    previousCast,
  );
  const usedVoices = new Set(
    coreCast
      .map((character) => character.voice?.voice_id)
      .filter((voice): voice is string => Boolean(voice)),
  );
  const guestCast: FilmCast[] = [...guestByKey.values()].map((guest) => {
    const oldEntry = (previousCast || []).find(
      (character) => character.characterId === guest.id,
    );
    const frozenVoice =
      oldEntry?.voice ||
      automaticGuestVoice({
        projectId: a.project.id,
        workspaceVersion: a.project.workspace_version,
        character: guest,
        usedVoices,
      });
    if (frozenVoice?.voice_id) usedVoices.add(frozenVoice.voice_id);
    return {
      ...oldEntry,
      ...(!oldEntry
        ? {
            characterId: guest.id,
            name: guest.name,
            description: guest.description,
            personality: guest.personality,
            imageUrl: guest.imageUrl,
            referenceImages: [guest.imageUrl],
            isGuest: true,
            guestKey: guest.key,
          }
        : {}),
      ...(frozenVoice ? { voice: frozenVoice } : {}),
    } as FilmCast;
  });
  const cast = [...coreCast, ...guestCast];
  const canonicalFamily =
    a.project.name === "Bánh Bao & Đậu Đỏ" ||
    cast.some((character) => character.name === "Bố");
  const normalizedInputs = canonicalFamily
    ? normalizeFamilyFatherTerms(remappedInputs)
    : remappedInputs;
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
      // Không còn là một tính năng: Seedance nhận trọn bộ ảnh tham chiếu, khung
      // cuối của clip trước không bao giờ được dùng làm đầu vào cảnh sau. Vẫn
      // phải ghi vì save_film_plan ép (s->>'follows_previous')::boolean vào một
      // cột NOT NULL; thiếu khoá này là hỏng toàn bộ đường lưu kịch bản.
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
    const { profile, error } = await channelProfileAt(
      a,
      (story as Story).profileVersion,
    );
    if (error || !profile)
      throw new FilmError("Không tìm thấy phiên bản hồ sơ kênh.");
    try {
      // The story keeps guest keys (its writer only knew keys); cast rows use
      // the plan-scoped guest ids.
      const storyAllowed = [
        ...ids.filter((id) => !guestUuids.has(id)),
        ...guestByKey.keys(),
      ];
      story = validateStory(story, profile, storyAllowed);
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
    p_id: planId,
    p_expected: old?.version ?? null,
    p_plan: plan,
    p_scenes: rows,
  });
  if (error)
    throw new FilmError(
      error.message,
      error.message.includes("VERSION") ? 409 : 400,
    );
  // Persist guest rows only after the plan exists (FK). The cast snapshot in
  // the plan already carries the generated reference, so a later save can
  // re-derive guests even if this best-effort write fails.
  for (const guest of guestRowsToPersist) {
    await a.admin
      .from("film_guest_characters")
      .upsert(
        {
          id: guest.id,
          project_id: a.project.id,
          plan_id: planId,
          key: guest.key,
          name: guest.name,
          description: guest.description,
          personality: guest.personality,
          image_url: guest.image_url,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "plan_id,key" },
      )
      .select("id");
  }
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
    const profile = await latestChannelProfile(a);
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
const TASK_PAGE_LIMIT = 500;

/**
 * Lịch sử task của một tập phim, có chặn trần.
 *
 * Chặn trần đơn thuần theo `created_at desc` là một lỗi tốn tiền: một tập được
 * tạo lại nhiều lần sẽ đẩy các task CŨ NHẤT ra khỏi trang, kể cả task ĐÃ DUYỆT.
 * `currentSceneTask` khi đó báo "chưa có ảnh được duyệt" và `nextProductionStage`
 * mua lại đúng thứ người dùng đã trả tiền. Nên ngoài trang mới nhất, luôn lấy
 * riêng toàn bộ task đã được chấp nhận rồi gộp theo id — chúng là thứ quyết
 * định có phải trả tiền lần nữa hay không.
 */
export async function tasksForPlan(a: Access, id: string) {
  const scope = () =>
    a.admin
      .from("short_film_tasks")
      .select("*")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .eq("plan_id", id);
  const [recent, acceptedRows] = await Promise.all([
    scope().order("created_at", { ascending: false }).limit(TASK_PAGE_LIMIT),
    scope()
      .or("approved_at.not.is.null,auto_accepted_at.not.is.null")
      .order("created_at", { ascending: false })
      .limit(TASK_PAGE_LIMIT),
  ]);
  if (recent.error) throw recent.error;
  if (acceptedRows.error) throw acceptedRows.error;
  const byId = new Map<string, FilmTask>();
  for (const task of [
    ...((recent.data || []) as FilmTask[]),
    ...((acceptedRows.data || []) as FilmTask[]),
  ])
    byId.set(task.id, task);
  if ((recent.data?.length || 0) >= TASK_PAGE_LIMIT)
    console.warn("short-film task history truncated", {
      planId: id,
      projectId: a.project.id,
      limit: TASK_PAGE_LIMIT,
    });
  return [...byId.values()].sort(
    (x, y) => Date.parse(y.created_at || "") - Date.parse(x.created_at || ""),
  );
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
/**
 * Mỗi cảnh cần một lần tra giá và chúng chạy tuần tự trong vòng lặp báo giá.
 * Với một tập nhiều cảnh và provider đang chậm, tổng thời gian có thể ăn hết
 * suất chạy 180 giây của route rồi chết giữa chừng mà không nói gì. `deadline`
 * cho phép hỏng sớm với thông điệp rõ ràng. (Chưa chuyển các vòng lặp sang
 * Promise.all: chúng nằm trong nhánh báo giá chưa có test, nên để sau khi
 * server.test.ts phủ xong.)
 */
export async function modelPrice(
  model: string,
  inputs: Record<string, unknown>,
  deadline?: number,
) {
  if (deadline && Date.now() > deadline)
    throw new FilmError(
      "Provider tra giá quá chậm nên chưa gửi lượt tạo. Hãy thử lại sau ít phút; bạn chưa bị trừ điểm.",
      503,
    );
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
/**
 * Chạy phần việc của từng cảnh song song, nhưng báo lỗi ĐẦU TIÊN THEO THỨ TỰ
 * CẢNH. Dùng Promise.all trần thì thông điệp người dùng nhận được phụ thuộc vào
 * cảnh nào reject trước về mặt thời gian — cùng một kịch bản hỏng có thể lúc
 * báo "Cảnh 2", lúc báo "Cảnh 5".
 *
 * Đánh đổi: mọi cảnh đều chạy kể cả khi một cảnh hỏng, nên có thể tốn vài lời
 * gọi tra giá thừa trên một lượt báo giá thất bại. Không tốn điểm của người
 * dùng: giá chỉ được tính, chưa hề trừ.
 */
export async function perScene<T>(
  scenes: FilmScene[],
  work: (scene: FilmScene) => Promise<T[]>,
): Promise<T[]> {
  const settled = await Promise.allSettled(scenes.map(work));
  for (const result of settled)
    if (result.status === "rejected") throw result.reason;
  return settled.flatMap(
    (result) => (result as PromiseFulfilledResult<T[]>).value,
  );
}

export async function quotePlan(
  a: Access,
  plan: FilmPlan,
  body: Record<string, unknown>,
) {
  checkVersion(a, body, plan);
  // Coherence gate: never pay to render scenes that mix two revisions (fresh
  // dialogue over the previous episode's prompts/cast). Fails before quotes.
  try {
    assertMediaCoherent(plan, await latestChannelProfile(a));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("PLAN_MEDIA_INCOHERENT")) throw e;
    throw new FilmError(coherenceMessage(message), 409);
  }
  // Route báo giá có maxDuration 180 giây; chừa lại phần cho phần còn lại của
  // request thay vì để chuỗi tra giá ăn hết rồi chết không thông báo.
  const priceDeadline = Date.now() + 120_000;
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
    const { profile } = await channelProfileAt(a, profileVersion);
    visualDirection = String(profile?.visualDirection?.prompt || "").trim();
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
    tasks.push(...(await perScene(scenes, async (s) => {
      // Mỗi cảnh gom việc của mình rồi mới trả về; không cảnh nào ghi chung vào
      // mảng tasks, nên chạy song song vẫn giữ nguyên thứ tự kết quả.
      const sceneTasks: QuotedTask[] = [];
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
          sceneTasks.push(task("image", input, p.customerPoints, s));
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
            : await modelPrice(voiceModel, inputs, priceDeadline);
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
              pacePolicyVersion: SHORT_FORM_SPEECH_POLICY_VERSION,
              paceTargetSeconds: spokenSeconds(line.dialogue),
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
          sceneTasks.push(quoted);
        }
      }
      return sceneTasks;
    })));
  else if (stage === "video") {
    if (plan.audio_mode === "fixed" && !fixedVoiceEnabled(a.project.id))
      throw new FilmError(
        "Giọng cố định đang kiểm chứng. Bạn vẫn có thể chuẩn bị ảnh và nghe thử giọng.",
        409,
      );
    tasks.push(...(await perScene(scenes, async (s) => {
      const image = latest(s, "image"),
        audio = latest(s, "tts");
      if (latest(s, "video") && body.regenerate !== true) return [];
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
      // `referencePackReady` ở trên đã bảo đảm mọi ảnh đều có task được duyệt,
      // nhưng nó kiểm trên một biến khác. Lọc thật thay vì khẳng định non-null:
      // nếu điều kiện kia có đổi, ở đây hỏng rõ ràng thay vì nổ undefined lúc
      // đang dựng payload trả tiền.
      const referenceTasks = sceneReferenceImageTasks(eligible, s).flatMap(
        ({ referenceId, task: referenceTask }) =>
          referenceTask ? [{ referenceId, task: referenceTask }] : [],
      );
      if (referenceTasks.length !== sceneReferenceImageTasks(eligible, s).length)
        throw new FilmError(
          `Bộ ảnh đạo diễn của cảnh ${s.scene_index + 1} chưa đủ. Hãy tạo lại phần còn thiếu.`,
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
        await modelPrice(plan.video_model, inputs, priceDeadline),
        s,
      );
      return [v];
    })));
  } else if (stage === "finish" || stage === "transcript") {
    tasks.push(...(await perScene(scenes, async (s) => {
      const kind =
        stage === "finish" && plan.audio_mode !== "native" && s.dialogue
          ? finalClipKind(s, plan.audio_mode)
          : "transcribe";
      if (!s.dialogue || latest(s, kind)) return [];
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
        return [
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
        ];
      } else if (kind === "lip_sync") {
        if (!audio?.result?.path) throw new FilmError("Thiếu audio đã duyệt.");
        const inputs = {
          video: inputVideo,
          audio: await signed(a, String(audio.result.path)),
          sync_mode: "silence",
        };
        return [
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
            await modelPrice(FILM_MODELS.lip_sync, inputs, priceDeadline),
            s,
          ),
        ];
      } else {
        const inputs = {
          video: inputVideo,
          language: "vi",
          task: "transcribe",
          enable_timestamps: true,
          prompt: s.dialogue,
        };
        return [
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
            await modelPrice(FILM_MODELS.transcribe, inputs, priceDeadline),
            s,
          ),
        ];
      }
    })));
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
