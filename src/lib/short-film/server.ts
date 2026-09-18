import "server-only";
import { isProjectMediaPath } from "@/lib/project-media-path";
import { errorCode, humanizeError } from "@/lib/error-messages";
import crypto from "node:crypto";
import { manifestHash } from "@/lib/continuity/hashing";
import {
  validateStory,
  type ChannelProfile,
  type Story
} from "../family-catalogue";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { normalizeScene, type SceneInput } from "@/lib/multiscene-video";
import {
  AI_PRICE_MARKUP_MULTIPLIER,
  AI_PRICING_USD_VND,
  BILLING_POINT_FLOOR_VND
} from "@/lib/ai-pricing";
import {
  remapStoryboardCharacters,
  type FilmPlan,
  type FilmCast,
  type FilmScene,
  type FilmTask,
  type QuotedTask,
  type FilmKind
} from "./contracts";
import { generateFilmGuestReference } from "@/lib/gemini-image";
import {
  seedanceReferenceModel,
  seedanceMaxDuration
} from "../video-models";
import { normalizeFamilyFatherTerms } from "../family-terminology";
import { usesFatherTerminology } from "../channel-behaviour";
import { automaticGuestVoice } from "./guest-voices";
/** Các trường của một cảnh đã lưu tham gia input_hash, cùng dạng với lúc lưu. */
export function sceneHashInput(scene: Record<string, unknown>) {
  const storyboard = scene.storyboard as
    | { beats?: Record<string, unknown>[]; performanceDirection?: unknown }
    | null
    | undefined;
  return {
    // Lúc lưu, cảnh có storyboard lấy hướng diễn từ storyboard, nhưng cột được
    // ghi null; dựng lại cùng luật để cảnh không đổi so khớp được.
    performance_direction: scene.performance_direction || storyboard?.performanceDirection || null,
    cast_snapshot: scene.cast_snapshot,
    speaker_character_id: scene.speaker_character_id ?? null,
    dialogue: scene.dialogue,
    action: scene.action,
    setting: scene.setting,
    camera: scene.camera,
    duration_seconds: scene.duration_seconds,
    start_image_url: scene.start_image_url ?? null,
    end_image_url: scene.end_image_url ?? null,
    follows_previous: scene.follows_previous ?? false,
    image_prompt: scene.image_prompt,
    motion_prompt: scene.motion_prompt,
    source_mode: scene.source_mode,
    ...(storyboard
      ? {
          storyboard: {
            ...storyboard,
            beats: (storyboard.beats || []).map(({ segmentId: _segmentId, ...beat }) => {
              void _segmentId;
              return beat;
            }),
          },
        }
      : {}),
  };
}

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
            referenceRoles: orderedReferences
              .map((reference: { role?: string | null }) => String(reference.role || ""))
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
    const storyboard = scene.storyboard
      ? remapStoryboardCharacters(scene.storyboard, (id) => guestByKey.get(id)?.id || id)
      : scene.storyboard;
    return { ...scene, characterIds, speakerCharacterId, storyboard };
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
  // Quy tắc xưng hô đến từ hồ sơ kênh; phần "có nhân vật tên Bố" giữ lại vì nó
  // mô tả đúng nội dung kịch bản chứ không phải danh tính khách hàng.
  const canonicalFamily =
    usesFatherTerminology(await latestChannelProfile(a)) ||
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
    const hashInput = {
      ...visual,
      ...(storyboardForHash ? { storyboard: storyboardForHash } : {}),
    };
    // input_hash dùng JSON.stringify nên phụ thuộc thứ tự khoá, mà jsonb sắp lại
    // khoá khi lưu. Chỉ đọc lên rồi lưu lại một tập do AI làm cũng đổi hash, tăng
    // version mọi cảnh và bỏ hết ảnh/giọng/video đã làm. So nội dung bằng chuỗi
    // ổn định với cảnh đã lưu; không đổi thì giữ nguyên hash (và version).
    const previous = old?.video_plan_scenes.find((scene) => scene.id === sceneId);
    const sameAsPrevious =
      previous &&
      manifestHash(hashInput) ===
        manifestHash(sceneHashInput(previous as unknown as Record<string, unknown>));
    return {
      ...row,
      input_hash:
        sameAsPrevious && previous.input_hash
          ? previous.input_hash
          : hash(hashInput),
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
