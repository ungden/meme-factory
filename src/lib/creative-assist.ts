import { FILM_INTERACTION_POLICY } from "./film-motion-policy";
import {
  validateStoryboard,
  storyboardDialogue,
  type FilmStoryboard,
} from "./film-storyboard";
import type {
  ChannelProfile,
  Story,
  StoryGuest,
  RecentStory,
} from "./family-catalogue";
import type { FamilyDevelopmentTrace } from "./family-development";
import { normalizeFamilyFatherTerms } from "./family-terminology";
import {
  PERFORMANCE_LANES,
  assertPerformanceDirection,
  type PerformanceDirection,
} from "./performance-direction";
import type { SceneReferencePlan } from "./visual-direction";
import {
  FamilyScriptDirector,
  contextText,
  generateJson,
} from "./family-script-director";
export { buildFamilyEditorialPrompt } from "./family-script-director";

/**
 * The shot schema and validation approach were adapted from Rocklore commit
 * b63588e9af8a9df47906a15e88c80d4403f54d91:
 * - services/render/vocab-kids/core.ts (sha256 cf7a04f13fc5cca1d21885b66f683b1f571548f68e590001226e05c7451ced3d)
 * - services/render/fashion-channel.ts (sha256 3b73aaf3172d319e0cb27b813de592b36b7630810a589354556e93c19184eefc)
 * - services/render/image-post-plan.ts (sha256 0835262a54b5fd73b72cb6d5c05b0f02882ada8e0b72d1becea9e7b9f91a34d1)
 * Only the planning/validation pattern is reused. AIDA keeps its own 3D cast,
 * Gemini text model and WaveSpeed media providers.
 */

export type CreativeAssistKind =
  | "idea_suggestions"
  | "image_plan"
  | "video_clip_plan"
  | "video_plan"
  | "scene_revision"
  | "performance_revision";

export type CreativeCharacter = {
  id: string;
  name: string;
  description?: string | null;
  personality?: string | null;
  imageUrl?: string | null;
};

export type CreativeContext = {
  projectName: string;
  channelProfile?: ChannelProfile;
  recentStories?: RecentStory[];
  brandVoice?: string | null;
  audience?: string | null;
  guidelines?: string | null;
  characters: CreativeCharacter[];
  recentContent: string[];
};

export type PlannedScene = {
  storyboard?: FilmStoryboard | null;
  characterIds: string[];
  speakerCharacterId: string | null;
  dialogue: string;
  action: string;
  setting: string;
  camera: string;
  durationSeconds: number;
  intendedDurationSeconds?: number;
  imagePrompt: string;
  motionPrompt: string;
  followsPrevious: boolean;
  performanceDirection?: PerformanceDirection | null;
  referencePlan?: SceneReferencePlan | null;
};

export type CreativeAssistResult =
  | {
      kind: "idea_suggestions";
      ideas: Array<{ title: string; idea: string; why: string }>;
    }
  | {
      kind: "image_plan";
      headline: string;
      subtext?: string;
      caption: string;
      imagePrompt: string;
      visualDirection: string;
      characterIds: string[];
      textPosition: "top" | "bottom" | "center" | "split";
    }
  | {
      kind: "video_clip_plan";
      prompt: string;
      caption: string;
      dialogue: string;
      speakerCharacterId: string | null;
      action: string;
      setting: string;
    }
  | {
      kind: "video_plan";
      title: string;
      summary: string;
      caption?: string;
      story?: Story;
      guests?: StoryGuest[];
      scenes: PlannedScene[];
    }
  | { kind: "scene_revision"; scenes: PlannedScene[]; summary: string }
  | { kind: "performance_revision"; scenes: PlannedScene[]; summary: string };

export type CreativeAssistInput = {
  kind: CreativeAssistKind;
  intent?: string;
  context: CreativeContext;
  selectedCharacterIds?: string[];
  /**
   * One-off guest characters for this single video. They never enter the
   * project character library; the plan generates a fresh reference per video.
   */
  guestCharacters?: Array<{
    key: string;
    name: string;
    description?: string;
    personality?: string;
  }>;
  targetDurationSeconds?: number;
  maxVideoDurationSeconds?: number;
  imageMode?: "text" | "image";
  sourceImageDescription?: string;
  currentScenes?: PlannedScene[];
  lockedSceneIndexes?: number[];
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function knownIds(context: CreativeContext) {
  return new Set(context.characters.map((character) => character.id));
}

function plannedScene(
  value: unknown,
  context: CreativeContext,
): PlannedScene | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const ids = Array.isArray(item.characterIds)
    ? [
        ...new Set(
          item.characterIds.filter(
            (id): id is string =>
              typeof id === "string" && knownIds(context).has(id),
          ),
        ),
      ].slice(0, 4)
    : [];
  const speaker =
    typeof item.speakerCharacterId === "string" &&
    ids.includes(item.speakerCharacterId)
      ? item.speakerCharacterId
      : null;
  const storyboard =
    item.storyboard == null ? null : validateStoryboard(item.storyboard, ids);
  if (
    storyboard &&
    (Number(item.durationSeconds) !== storyboard.durationSeconds ||
      item.dialogue !== storyboardDialogue(storyboard))
  )
    return null;
  const intendedDuration = Number(item.durationSeconds);
  let performanceDirection: PerformanceDirection | null = null;
  if (item.performanceDirection != null) {
    performanceDirection = assertPerformanceDirection(
      item.performanceDirection as PerformanceDirection,
    );
  }
  const dialogue = text(item.dialogue, 700);
  // Editorial shot length is not a provider contract. Round UP before quoting,
  // without inventing an edit boundary or clipping a spoken sentence.
  const duration =
    context.channelProfile &&
    Number.isFinite(intendedDuration) &&
    intendedDuration > 0
      ? Math.max(
          4,
          Math.ceil(intendedDuration),
          Math.ceil(dialogue.split(/\s+/).filter(Boolean).length / 2.6),
        )
      : intendedDuration;
  if (
    (!ids.length && (!context.channelProfile || !!dialogue)) ||
    !text(item.action, 900) ||
    !text(item.setting, 700) ||
    !text(item.imagePrompt, 1600) ||
    !text(item.motionPrompt, 1600) ||
    !Number.isInteger(duration) ||
    duration < 4 ||
    duration > 30
  )
    return null;
  // A single speaker can usually deliver 13 Vietnamese words per 5 seconds.
  if (
    dialogue &&
    !storyboard &&
    (!speaker || dialogue.split(/\s+/).length > Math.ceil(duration * 2.6))
  )
    return null;
  return {
    characterIds: ids,
    ...(storyboard ? { storyboard } : {}),
    speakerCharacterId: storyboard ? null : speaker,
    dialogue,
    action: text(item.action, 900),
    setting: text(item.setting, 700),
    camera: text(item.camera, 400),
    durationSeconds: duration as PlannedScene["durationSeconds"],
    ...(context.channelProfile
      ? { intendedDurationSeconds: intendedDuration }
      : {}),
    imagePrompt: text(item.imagePrompt, 1600),
    motionPrompt: text(item.motionPrompt, 1600),
    followsPrevious: item.followsPrevious === true,
    ...(performanceDirection ? { performanceDirection } : {}),
    ...(storyboard?.referencePlan
      ? { referencePlan: storyboard.referencePlan }
      : {}),
  };
}

export function validateCreativeAssist(
  kind: CreativeAssistKind,
  value: unknown,
  context: CreativeContext,
  targetDurationSeconds?: number,
): CreativeAssistResult {
  if (context.channelProfile?.roles.some((role) => role.name === "Bố"))
    value = normalizeFamilyFatherTerms(value);
  if (!value || typeof value !== "object")
    throw new Error("CREATIVE_ASSIST_INVALID_JSON");
  const result = value as Record<string, unknown>;
  if (kind === "idea_suggestions") {
    const ideas = Array.isArray(result.ideas)
      ? result.ideas
          .map((item) => ({
            title: text((item as Record<string, unknown>).title, 100),
            idea: text((item as Record<string, unknown>).idea, 500),
            why: text((item as Record<string, unknown>).why, 240),
          }))
          .filter((item) => item.title && item.idea)
      : [];
    if (ideas.length !== 3) throw new Error("CREATIVE_ASSIST_IDEAS_INVALID");
    return { kind, ideas };
  }
  if (kind === "image_plan") {
    const ids = Array.isArray(result.characterIds)
      ? result.characterIds
          .filter(
            (id): id is string =>
              typeof id === "string" && knownIds(context).has(id),
          )
          .slice(0, 4)
      : [];
    const imagePrompt = text(result.imagePrompt, 1800);
    const caption = text(result.caption, 1200);
    if (!imagePrompt || !caption)
      throw new Error("CREATIVE_ASSIST_IMAGE_INVALID");
    const textPosition = ["top", "bottom", "center", "split"].includes(
      String(result.textPosition),
    )
      ? (result.textPosition as "top" | "bottom" | "center" | "split")
      : "bottom";
    return {
      kind,
      headline: text(result.headline, 160),
      subtext: text(result.subtext, 220) || undefined,
      caption,
      imagePrompt,
      visualDirection: text(result.visualDirection, 800),
      characterIds: ids,
      textPosition,
    };
  }
  if (kind === "video_clip_plan") {
    const prompt = text(result.prompt, 1800);
    if (!prompt) throw new Error("CREATIVE_ASSIST_CLIP_INVALID");
    const speakerId =
      typeof result.speakerCharacterId === "string" &&
      knownIds(context).has(result.speakerCharacterId)
        ? result.speakerCharacterId
        : null;
    return {
      kind,
      prompt,
      caption: text(result.caption, 1200),
      dialogue: text(result.dialogue, 700),
      speakerCharacterId: speakerId,
      action: text(result.action, 900),
      setting: text(result.setting, 700),
    };
  }
  const source = Array.isArray(result.scenes) ? result.scenes : [];
  const parsedScenes = source.map((item) => plannedScene(item, context));
  const invalid = parsedScenes.findIndex((s) => !s);
  if (invalid >= 0)
    throw new Error(
      `CREATIVE_ASSIST_SCENE_${invalid + 1}_INVALID: ${JSON.stringify({ duration: (source[invalid] as Record<string, unknown>)?.durationSeconds, cast: (source[invalid] as Record<string, unknown>)?.characterIds, missing: ["action", "setting", "imagePrompt", "motionPrompt"].filter((k) => !(source[invalid] as Record<string, unknown>)?.[k]) })}; use valid project cast, speaker in cast, concrete action/setting/prompts and <=30 seconds`,
    );
  const scenes = parsedScenes as PlannedScene[];
  if (kind === "video_plan") {
    const sum = scenes.reduce(
      (total, scene) => total + scene.durationSeconds,
      0,
    );
    if (
      scenes.length < (scenes.every((s) => s.storyboard) ? 1 : 3) ||
      scenes.length > 12 ||
      !targetDurationSeconds ||
      (!context.channelProfile && Math.abs(sum - targetDurationSeconds) > 5)
    )
      throw new Error(
        `CREATIVE_ASSIST_PLAN_INVALID: shots=${scenes.length}, rawSeconds=${sum}, target=${targetDurationSeconds}`,
      );
    return {
      kind,
      title: text(result.title, 160) || "Video nhiều cảnh",
      summary: text(result.summary, 1000),
      caption: text(result.caption, 1200),
      scenes,
    };
  }
  if (!scenes.length) throw new Error("CREATIVE_ASSIST_REVISION_INVALID");
  return { kind, scenes, summary: text(result.summary, 700) } as CreativeAssistResult;
}

function schemaFor(kind: CreativeAssistKind) {
  if (kind === "idea_suggestions")
    return '{"ideas":[{"title":"","idea":"","why":""},{"title":"","idea":"","why":""},{"title":"","idea":"","why":""}]}';
  if (kind === "image_plan")
    return '{"headline":"","subtext":"","caption":"","imagePrompt":"","visualDirection":"","characterIds":["uuid"],"textPosition":"bottom"}';
  if (kind === "video_clip_plan")
    return '{"prompt":"","caption":"","dialogue":"","speakerCharacterId":"uuid or null","action":"","setting":""}';
  if (kind === "video_plan")
    return '{"title":"","summary":"","scenes":[{"characterIds":["uuid"],"speakerCharacterId":"uuid or null","dialogue":"","action":"","setting":"","camera":"","durationSeconds":5,"imagePrompt":"","motionPrompt":"","followsPrevious":false,"performanceDirection":{"version":1,"lane":"deadpan_reversal","comicObjective":"","statusBefore":"","statusAfter":"","hook":"","beats":[{"physicalAction":"","expressionChange":"","gesture":"","propInteraction":"","reactionTarget":"","cameraMove":""},{"physicalAction":"","expressionChange":"","gesture":"","propInteraction":"","reactionTarget":"","cameraMove":""}],"revealOrCut":""}}]}';
  if (kind === "performance_revision")
    return '{"summary":"","scenes":[{"characterIds":["uuid"],"speakerCharacterId":"uuid or null","dialogue":"","action":"","setting":"","camera":"","durationSeconds":5,"imagePrompt":"","motionPrompt":"","followsPrevious":false,"performanceDirection":{"version":1,"lane":"deadpan_reversal","comicObjective":"","statusBefore":"","statusAfter":"","hook":"","beats":[{"physicalAction":"","expressionChange":"","gesture":"","propInteraction":"","reactionTarget":"","cameraMove":""},{"physicalAction":"","expressionChange":"","gesture":"","propInteraction":"","reactionTarget":"","cameraMove":""}],"revealOrCut":""}}]}';
  return '{"summary":"","scenes":[{"characterIds":["uuid"],"speakerCharacterId":"uuid or null","dialogue":"","action":"","setting":"","camera":"","durationSeconds":5,"imagePrompt":"","motionPrompt":"","followsPrevious":false}]}';
}

function instruction(input: CreativeAssistInput) {
  const target = input.targetDurationSeconds || 30;
  const base = `Bạn là biên kịch và đạo diễn nội dung AIDA cho fanpage Việt Nam. Viết tiếng Việt tự nhiên, cụ thể, không văn mẫu. Bạn lập kế hoạch để người dùng duyệt trước khi sinh media, không nói về provider hay giá. Không tạo nhân vật hoặc ID mới. Giữ nhân vật 3D, trang phục và nhận diện từ ảnh chuẩn; không hứa giữ giọng tuyệt đối. Không tự chèn headline, phụ đề hay chữ trang trí lên ảnh; chữ/số thật trên đạo cụ được phép khi là dữ kiện của câu chuyện.\n\n${contextText(input.context, input.selectedCharacterIds || [])}\n\nYÊU CẦU CỦA NGƯỜI DÙNG: ${input.intent || "Hãy đề xuất từ bối cảnh dự án."}`;
  if (input.kind === "idea_suggestions")
    return `${base}\n\nĐề xuất đúng ba hướng khác nhau, hữu ích để bắt đầu, không lặp nội dung gần đây. Mỗi hướng có title, idea và why.`;
  if (input.kind === "image_plan")
    return `${base}\n\nSoạn một phương án ảnh hoàn chỉnh: cảnh, hành động, bố cục, ánh sáng, biểu cảm, caption. imagePrompt chỉ mô tả hình, không nhét chữ. headline/subtext để trống trừ khi người dùng yêu cầu rõ bài meme hoặc chữ trên ảnh.`;
  if (input.kind === "video_clip_plan")
    return `${base}\n\n${FILM_INTERACTION_POLICY}\nSoạn một clip ${input.imageMode === "image" ? "từ ảnh đầu đã chọn" : "từ mô tả"}. prompt phải đủ hành động, máy quay, ánh sáng, người nói và câu thoại nếu có. Một clip chỉ một lượt nói; lời thoại vừa với thời lượng. Caption tách riêng.`;
  if (input.kind === "video_plan")
    return `${base}\n\n${FILM_INTERACTION_POLICY}\nViết video nhiều cảnh tổng khoảng ${target} giây, tối thiểu ba cảnh. Có mở đầu, diễn biến và điểm chốt. Chọn đúng một lane biểu cảm trong [${PERFORMANCE_LANES.join(", ")}], không trộn cơ chế. Mỗi cảnh chỉ một người nói và một câu thoại ngắn nếu cần. Shot có thoại dùng cận cảnh chỉ một người trong characterIds để đồng bộ môi; cảnh nhiều người dành cho hành động, mở cảnh hoặc phản ứng không thoại. Mỗi durationSeconds là số nguyên từ 4 đến 30; lời thoại không quá 2.6 từ/giây. Tổng durationSeconds phải trong ±5 giây so với ${target}. imagePrompt chỉ mô tả tư thế và đạo cụ TRƯỚC hành động, không đặt nhân vật ở kết quả. motionPrompt phải có hành vi nhìn thấy được: ít nhất hai hành động vật lý khác nhau, thay đổi quyền chủ động, phản ứng hướng vào người/đạo cụ cụ thể và điểm lộ/cắt. Không dùng riêng các nhãn “tự nhiên”, “nghiêm túc”, “ngây thơ”, “đáng yêu”, “gật đầu”, “nhìn ngơ”. Cho phép máy tĩnh với diễn xuất cụ thể. Hai hành động có thể là hai pha của cùng một việc hoặc phản ứng đồng thời; không ép thêm trò, góc máy hay cú lật cho từng câu. Dùng cảnh độc lập trừ khi hành động thực sự nối tiếp.`;
  const performanceOnly = input.kind === "performance_revision";
  return `${base}\n\n${FILM_INTERACTION_POLICY}\n${performanceOnly ? "Tối ưu biểu cảm cho từng cảnh: giữ nguyên characterIds, speakerCharacterId, dialogue, setting, durationSeconds, imagePrompt và thứ tự. Chỉ sửa action/camera/motionPrompt và performanceDirection. Mỗi cảnh bắt buộc có một lane, hook trong 0–1 giây, tối thiểu hai hành động vật lý khác nhau, thay đổi quyền chủ động, phản ứng hướng vào người/đạo cụ cụ thể và revealOrCut. Không thêm thoại, không đổi cast và không gọi provider." : "Chỉ sửa các cảnh mà yêu cầu nhắc tới."} Cảnh khoá (chỉ số từ 1): ${(input.lockedSceneIndexes || []).map((index) => index + 1).join(", ") || "không có"}. Giữ nguyên nguyên văn các cảnh khoá. Cảnh hiện tại:\n${JSON.stringify(input.currentScenes || [])}`;
}

export function creativeAssistModel(
  kind: CreativeAssistKind,
  hasChannelProfile: boolean,
) {
  return kind === "video_plan" && hasChannelProfile
    ? process.env.FAMILY_CREATIVE_TEXT_MODEL || "gemini-3.1-pro-preview"
    : process.env.CREATIVE_TEXT_MODEL || "gemini-3-flash-preview";
}

export type CreativeAssistOptions = {
  onEditorialProgress?: (trace: FamilyDevelopmentTrace) => Promise<void>;
};

export async function generateCreativeAssist(
  input: CreativeAssistInput,
  options: CreativeAssistOptions = {},
) {
  if (input.kind === "video_plan" && input.context.channelProfile)
    return generateFamilyFilm(input, options);
  const boardRevision =
    (input.kind === "scene_revision" || input.kind === "performance_revision") &&
    input.currentScenes?.some((s) => s.storyboard);
  const prompt = `${instruction(input)}\n\nTrả về JSON ĐÚNG schema, không markdown:\n${schemaFor(input.kind)}${boardRevision ? "\nVới scene có storyboard, giữ thêm toàn bộ storyboard (version, durationSeconds, contentEndSeconds nếu có và beats). Chỉ sửa beat được yêu cầu; giữ timeline liên tục từ 0 đến contentEndSeconds hoặc durationSeconds hiện tại, cast/người nói hợp lệ. dialogue của scene là nối các beat.dialogue có chữ bằng newline, speakerCharacterId của scene=null. Không được bỏ storyboard, ép clip về 15 giây hoặc đổi đoạn thành clip một câu." : ""}`;
  const validate = (value: unknown) => {
    const result = validateCreativeAssist(
      input.kind,
      value,
      input.context,
      input.targetDurationSeconds,
    );
    if (
      (input.kind === "scene_revision" || input.kind === "performance_revision") &&
      (result.kind === "scene_revision" || result.kind === "performance_revision") &&
      input.currentScenes
    ) {
      if (result.scenes.length !== input.currentScenes.length)
        throw new Error("CREATIVE_REVISION_SCENES_CHANGED");
      input.currentScenes.forEach((previous, i) => {
        if (previous.storyboard && !result.scenes[i].storyboard)
          throw new Error("CREATIVE_REVISION_STORYBOARD_LOST");
        if (input.kind === "performance_revision" && !result.scenes[i].performanceDirection)
          throw new Error("CREATIVE_PERFORMANCE_DIRECTION_MISSING");
        if (input.lockedSceneIndexes?.includes(i)) {
          const normalized = plannedScene(previous, input.context);
          if (JSON.stringify(result.scenes[i]) !== JSON.stringify(normalized))
            throw new Error("CREATIVE_REVISION_LOCKED_SCENE_CHANGED");
        }
      });
    }
    return result;
  };
  let candidate: unknown;
  try {
    candidate = await generateJson(prompt);
    return validate(candidate);
  } catch (error) {
    candidate = await generateJson(
      `${prompt}\n\nSửa đúng bản JSON sau (không bỏ cảnh): ${JSON.stringify(candidate ?? {})}\nLỗi cần sửa: ${error instanceof Error ? error.message : "JSON không hợp lệ"}`,
    );
    return validate(candidate);
  }
}

/** Story, dialogue, independent editorial review and shot planning. Never starts media. */
async function generateFamilyFilm(
  input: CreativeAssistInput,
  options: CreativeAssistOptions,
) {
  return new FamilyScriptDirector(input, options).runAll(Date.now() + 155000);
}
