import {
  storyboardGroups,
  validateStoryboard,
  storyboardDialogue,
  type FilmStoryboard,
} from "./film-storyboard";
import {
  FAMILY_WRITING_POLICY,
  FAMILY_WRITING_POLICY_VERSION,
  FAMILY_REVIEW_CRITERIA,
} from "./family-writing-policy";
import {
  storyResponseSchema,
  shotResponseSchema,
  unpackStory,
  compileStoryboards,
} from "./family-ai-contract";
import {
  validateGeneratedFamilyStory,
  STORY_SCHEMA,
  type ChannelProfile,
  type Story,
  type RecentStory,
} from "./family-catalogue";
import {
  FAMILY_EDITORIAL_BENCHMARK,
  FAMILY_BENCHMARK_VERSION,
  premiseSchema,
  selectionSchema,
  editorialReviewSchema,
  validatePremises,
  validateSelection,
  validateEditorialReview,
  type FamilyDevelopmentTrace,
} from "./family-development";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { getGeminiApiKey } from "@/lib/server-secrets";

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
  | "scene_revision";

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
      scenes: PlannedScene[];
    }
  | { kind: "scene_revision"; scenes: PlannedScene[]; summary: string };

export type CreativeAssistInput = {
  kind: CreativeAssistKind;
  intent?: string;
  context: CreativeContext;
  selectedCharacterIds?: string[];
  targetDurationSeconds?: 15 | 30 | 35 | 40 | 60;
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
    (Number(item.durationSeconds) !== 15 ||
      item.dialogue !== storyboardDialogue(storyboard))
  )
    return null;
  const intendedDuration = Number(item.durationSeconds);
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
  };
}

export function validateCreativeAssist(
  kind: CreativeAssistKind,
  value: unknown,
  context: CreativeContext,
  targetDurationSeconds?: number,
): CreativeAssistResult {
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
  return { kind, scenes, summary: text(result.summary, 700) };
}

function contextText(
  context: CreativeContext,
  selectedIds: string[],
  includeWritingPolicy = true,
) {
  const selected = selectedIds.length
    ? context.characters.filter((item) => selectedIds.includes(item.id))
    : context.characters;
  return `${context.channelProfile ? "HỒ SƠ KÊNH (giữ vai trò và tính cách, không tự đổi ảnh chuẩn): " + JSON.stringify(context.channelProfile) + "\n20 TẬP GẦN NHẤT (tránh lặp tình huống/format–cách tạo tương phản–chuỗi đối đáp/kết quả; không mặc định mọi tập có người thua): " + JSON.stringify(context.recentStories || []) + "\n" : ""}DỰ ÁN: ${context.projectName}\nGIỌNG VIẾT: ${context.channelProfile?.tone || context.brandVoice || "tự nhiên, rõ ràng"}\nĐỘC GIẢ: ${context.channelProfile?.audience || context.audience || "khán giả fanpage Việt Nam"}\nHƯỚNG DẪN: ${context.guidelines || ""}\nNHÂN VẬT ĐƯỢC PHÉP DÙNG (chỉ dùng ID trong danh sách):\n${selected.map((character) => `- ${character.name} | ID ${character.id} | ${character.description || "nhân vật 3D đã duyệt"}; ${context.channelProfile?.roles.find((role) => role.characterId === character.id)?.personality || character.personality || ""}`).join("\n") || "Không có nhân vật được chọn."}\nNỘI DUNG GẦN ĐÂY CẦN TRÁNH LẶP: ${context.recentContent.join(" | ") || "chưa có"}${context.channelProfile && includeWritingPolicy ? "\n\n" + FAMILY_WRITING_POLICY : ""}`;
}

function schemaFor(kind: CreativeAssistKind) {
  if (kind === "idea_suggestions")
    return '{"ideas":[{"title":"","idea":"","why":""},{"title":"","idea":"","why":""},{"title":"","idea":"","why":""}]}';
  if (kind === "image_plan")
    return '{"headline":"","subtext":"","caption":"","imagePrompt":"","visualDirection":"","characterIds":["uuid"],"textPosition":"bottom"}';
  if (kind === "video_clip_plan")
    return '{"prompt":"","caption":"","dialogue":"","speakerCharacterId":"uuid or null","action":"","setting":""}';
  if (kind === "video_plan")
    return '{"title":"","summary":"","scenes":[{"characterIds":["uuid"],"speakerCharacterId":"uuid or null","dialogue":"","action":"","setting":"","camera":"","durationSeconds":5,"imagePrompt":"","motionPrompt":"","followsPrevious":false}]}';
  return '{"summary":"","scenes":[{"characterIds":["uuid"],"speakerCharacterId":"uuid or null","dialogue":"","action":"","setting":"","camera":"","durationSeconds":5,"imagePrompt":"","motionPrompt":"","followsPrevious":false}]}';
}

function instruction(input: CreativeAssistInput) {
  const target = input.targetDurationSeconds || 30;
  const base = `Bạn là biên kịch và đạo diễn nội dung AIDA cho fanpage Việt Nam. Viết tiếng Việt tự nhiên, cụ thể, không văn mẫu. Bạn lập kế hoạch để người dùng duyệt trước khi sinh media, không nói về provider hay giá. Không tạo nhân vật hoặc ID mới. Giữ nhân vật 3D, trang phục và nhận diện từ ảnh chuẩn; không hứa giữ giọng tuyệt đối. Không tự chèn chữ lên ảnh, trừ khi ý tưởng yêu cầu meme.\n\n${contextText(input.context, input.selectedCharacterIds || [])}\n\nYÊU CẦU CỦA NGƯỜI DÙNG: ${input.intent || "Hãy đề xuất từ bối cảnh dự án."}`;
  if (input.kind === "idea_suggestions")
    return `${base}\n\nĐề xuất đúng ba hướng khác nhau, hữu ích để bắt đầu, không lặp nội dung gần đây. Mỗi hướng có title, idea và why.`;
  if (input.kind === "image_plan")
    return `${base}\n\nSoạn một phương án ảnh hoàn chỉnh: cảnh, hành động, bố cục, ánh sáng, biểu cảm, caption. imagePrompt chỉ mô tả hình, không nhét chữ. headline/subtext để trống trừ khi người dùng yêu cầu rõ bài meme hoặc chữ trên ảnh.`;
  if (input.kind === "video_clip_plan")
    return `${base}\n\nSoạn một clip ${input.imageMode === "image" ? "từ ảnh đầu đã chọn" : "từ mô tả"}. prompt phải đủ hành động, máy quay, ánh sáng, người nói và câu thoại nếu có. Một clip chỉ một lượt nói; lời thoại vừa với thời lượng. Caption tách riêng.`;
  if (input.kind === "video_plan")
    return `${base}\n\nViết video nhiều cảnh tổng khoảng ${target} giây, tối thiểu ba cảnh. Có mở đầu, diễn biến và điểm chốt. Mỗi cảnh chỉ một người nói và một câu thoại ngắn nếu cần. Shot có thoại dùng cận cảnh chỉ một người trong characterIds để đồng bộ môi; cảnh nhiều người dành cho hành động, mở cảnh hoặc phản ứng không thoại. Mỗi durationSeconds là số nguyên từ 4 đến 30; lời thoại không quá 2.6 từ/giây. Tổng durationSeconds phải trong ±5 giây so với ${target}. imagePrompt chỉ khóa ảnh đầu, vị trí và hướng nhìn. motionPrompt chỉ đạo chuyển động bằng các mốc thời gian liên tục từ 0.0s tới hết durationSeconds: hành động chính bắt đầu ngay ở 0.0s, có ít nhất ba nhịp hành động/cảm xúc, camera chuyển động có chủ đích và trạng thái kết rõ để cắt. Không dùng mở cảnh đứng yên, stable camera hoặc gentle push-in chung chung. Dùng cảnh độc lập trừ khi hành động thực sự nối tiếp.`;
  return `${base}\n\nChỉ sửa các cảnh mà yêu cầu nhắc tới. Cảnh khoá (chỉ số từ 1): ${(input.lockedSceneIndexes || []).map((index) => index + 1).join(", ") || "không có"}. Giữ nguyên nguyên văn các cảnh khoá. Cảnh hiện tại:\n${JSON.stringify(input.currentScenes || [])}`;
}

export function creativeAssistModel(
  kind: CreativeAssistKind,
  hasChannelProfile: boolean,
) {
  return kind === "video_plan" && hasChannelProfile
    ? process.env.FAMILY_CREATIVE_TEXT_MODEL || "gemini-3.1-pro-preview"
    : process.env.CREATIVE_TEXT_MODEL || "gemini-3-flash-preview";
}

async function generateJson(
  prompt: string,
  responseJsonSchema?: unknown,
  modelOverride?: string,
  deadline?: number,
  temperature = 0.5,
) {
  const remaining = deadline ? deadline - Date.now() : 45000;
  if (remaining < 5000) throw new Error("FAMILY_WRITING_TIMEOUT");
  const ai = new GoogleGenAI({ apiKey: await getGeminiApiKey() });
  const model =
    modelOverride ||
    process.env.CREATIVE_TEXT_MODEL ||
    "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      ...(responseJsonSchema
        ? {
            responseJsonSchema,
            maxOutputTokens: 8192,
            ...(model.startsWith("gemini-3")
              ? { thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel } }
              : {}),
          }
        : {}),
      temperature,
      httpOptions: {
        timeout: Math.min(remaining, responseJsonSchema ? 45000 : 35000),
      },
    },
  });
  return JSON.parse(response.text || "{}") as unknown;
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
    input.kind === "scene_revision" &&
    input.currentScenes?.some((s) => s.storyboard);
  const prompt = `${instruction(input)}\n\nTrả về JSON ĐÚNG schema, không markdown:\n${schemaFor(input.kind)}${boardRevision ? "\nVới scene có storyboard, giữ thêm toàn bộ storyboard (version, durationSeconds và beats). Chỉ sửa beat được yêu cầu; giữ timeline 0–15, cast/người nói hợp lệ. dialogue của scene là nối các beat.dialogue có chữ bằng newline, speakerCharacterId của scene=null. Không được bỏ storyboard hoặc đổi đoạn thành clip một câu." : ""}`;
  const validate = (value: unknown) => {
    const result = validateCreativeAssist(
      input.kind,
      value,
      input.context,
      input.targetDurationSeconds,
    );
    if (
      input.kind === "scene_revision" &&
      result.kind === "scene_revision" &&
      input.currentScenes
    ) {
      if (result.scenes.length !== input.currentScenes.length)
        throw new Error("CREATIVE_REVISION_SCENES_CHANGED");
      input.currentScenes.forEach((previous, i) => {
        if (previous.storyboard && !result.scenes[i].storyboard)
          throw new Error("CREATIVE_REVISION_STORYBOARD_LOST");
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

export function buildFamilyEditorialPrompt(
  input: CreativeAssistInput,
  story: Story,
) {
  const allowed = input.selectedCharacterIds?.length
    ? input.selectedCharacterIds
    : input.context.characters.map((c) => c.id);
  const context = {
    ...input.context,
    characters: input.context.characters.filter((c) => allowed.includes(c.id)),
  };
  const intent =
    input.intent || "Chọn một chuyện mới từ gia đình và 20 tập gần nhất.";
  const performance = {
    setup: story.setup,
    dialogue: story.dialogue,
    proposedEndingPlan: story.endingPlan,
    reaction:
      story.beats.find((b) => b.purpose === "reaction")?.description || "",
  };
  return `${contextText(context, allowed)}
${FAMILY_EDITORIAL_BENCHMARK}
Ý TƯỞNG PHẢI GIỮ: ${intent}
BẢN DIỄN CẦN ĐÁNH GIÁ: ${JSON.stringify(performance)}
${FAMILY_REVIEW_CRITERIA}
Đây là bước chọn chất lượng, không chỉ dò lỗi. watchability.decision: ready_for_user khi đáng gửi cho người dùng chọn; revise nếu một sửa cụ thể có thể cứu phần đối đáp đang tốt; reject nếu tiền đề vẫn nhạt/dễ đoán/cần thay gốc. Được reject dù issues=[] vì bản không có lỗi cấu trúc nhưng không đáng xem.
Audit điểm dừng độc lập, không tin proposedEndingPlan của người viết. Đọc từ cuối lên và thử bỏ từng lượt. endingCheck.status=clean_stop chỉ khi lượt cuối là lượt cuối thật sự cần thiết; lastNecessaryLine phải là số lượt đó và quote trích nguyên văn thoại/action. forced_tail khi điểm dừng thật nằm trước phần đuôi đang có; unfinished khi chưa có lượt nào hạ được việc/quan hệ đang diễn. Kết chớt quớt vẫn clean_stop nếu câu cuối làm cái vô lý đủ rõ, dù hậu quả chưa giải quyết. Câu cuối mở thêm vấn đề không được phát triển, giải thích lại điều đã thấy hoặc cố thêm trò đùa thứ hai là forced_tail. ready_for_user bắt buộc clean_stop tại đúng lượt cuối.
Audit khẩu ngữ độc lập theo đúng characterId, tên và người họ đang nói cùng. speechCheck trích một lượt đáng kiểm tra nhất. status=needs_revision nếu đại từ sai góc nhìn/quan hệ, câu giống dịch hoặc tác giả kể hộ nhân vật; khi đó không được ready_for_user. Ví dụ Đậu Đỏ nói với Bánh Bao phải dùng “chị em mình/tụi mình”, không tự gọi cả hai là “hai đứa”; nói với bố mẹ mới dùng “tụi con”. status=natural chỉ khi toàn bộ thoại qua kiểm tra này; reason phải giải thích bằng ngữ cảnh người nói/người nghe.
Trước khi quyết định, phản biện bản này như một biên tập viên phải từ chối bài nhạt. weakestMoment trích một câu/action NGUYÊN VĂN ở line tương ứng và why nêu nguy cơ cụ thể khiến người xem chán; không dùng "cần nghe diễn viên" hay "không có điểm yếu" để né đánh giá bản chữ. formatOnly=true nếu toàn sức hút vẫn chỉ là trẻ đóng vai người lớn hoặc gọi đồ nhỏ bằng từ sang, chưa có quan sát/đối đáp/hành động riêng đáng xem; khi đó không được ready_for_user. Đừng mặc định đúng format là xuất sắc. Có thể nhận xét một câu yếu dù tổng thể vẫn đạt.
watchability.reason nêu căn cứ cụ thể, weakness nêu hạn chế còn lại. moments trích NGUYÊN VĂN đoạn thoại hoặc action, line là số lượt từ 1, kind=dialogue/action, why giải thích vì sao đoạn ấy thú vị hoặc phản ứng nào được tạo. ready_for_user cần ít nhất hai đoạn ở các lượt khác nhau (có thể là hành động/câu dẫn có tác dụng, không bắt hai punchline). Không chấp nhận lý do chỉ là đúng format/đảo vai. Câu trích của issues cũng phải có trong bản diễn.
Không có lỗi chưa đủ để ready_for_user. Chỉ trả quyết định này khi bản đáng gửi người dùng và không còn issue cần sửa. Đây không phải người dùng duyệt; server tự suy trạng thái từ quyết định và bằng chứng, không cần một cờ passed riêng.`;
}

/** Story, dialogue, independent editorial review and shot planning. Never starts media. */
async function generateFamilyFilm(
  input: CreativeAssistInput,
  options: CreativeAssistOptions,
) {
  const deadline = Date.now() + 155000;
  const trace: FamilyDevelopmentTrace = {
    benchmarkVersion: FAMILY_BENCHMARK_VERSION,
    stage: "premises",
    candidates: [],
    drafts: [],
  };
  const checkpoint = async (stage: FamilyDevelopmentTrace["stage"]) => {
    trace.stage = stage;
    await options.onEditorialProgress?.(structuredClone(trace));
  };
  const profile = input.context.channelProfile!;
  const model = creativeAssistModel(input.kind, true);
  const allowed = input.selectedCharacterIds?.length
    ? input.selectedCharacterIds
    : input.context.characters.map((c) => c.id);
  const context = {
    ...input.context,
    characters: input.context.characters.filter((c) => allowed.includes(c.id)),
  };
  let repairs = 0;
  async function checked<T>(
    prompt: string,
    validate: (v: unknown) => T,
    schema?: unknown,
    temperature = 0.5,
  ): Promise<T> {
    while (true) {
      let candidate: unknown;
      try {
        candidate = await generateJson(
          prompt,
          schema,
          model,
          deadline,
          temperature,
        );
        return validate(candidate);
      } catch (e) {
        if (candidate === undefined && !(e instanceof SyntaxError)) throw e;
        const error =
          e instanceof Error ? e.message : "FAMILY_RESPONSE_INVALID";
        trace.validationFailures = [
          ...(trace.validationFailures || []),
          { stage: trace.stage, error, response: candidate ?? null },
        ];
        await checkpoint(trace.stage);
        if (repairs++ >= 1) throw e;
        prompt = `${prompt}\nSửa bản vừa trả, không thay đề tài: ${JSON.stringify(candidate)}\nLỗi: ${error}`;
      }
    }
  }
  // Let the writer explore with a short positive brief. The rejection benchmark
  // belongs to selection/review; feeding failed scripts to every stage anchors imitation.
  const writerContext = `${contextText(context, allowed, false)}
BẠN LÀ BIÊN KỊCH HÀI GIA ĐÌNH, viết để diễn như đang nói chuyện, không viết lời giới thiệu ý tưởng.
Tìm một thói quen nhỏ rất thật: người đang vội vẫn nhờ thêm; khách hỏi chuyện vì chính họ tò mò; người khoe tự lộ điều mình coi là quan trọng. Đặt người lớn/trẻ con vào vai bị đảo, hoặc đặt quy mô trẻ con vào một format người lớn dễ nhận ra. Giữ nghiêm túc trong vai, sự quan tâm và vẻ tỉnh bơ.
Hai người nghe nhau: câu vừa nghe hoặc việc vừa xảy ra cho họ điều cụ thể để hỏi, chống chế, đồng ý hay nhờ tiếp. Người hỏi có sự tò mò riêng, không chỉ "còn gì nữa?" để khách đọc danh sách. Câu kể được phép nếu tự cách kể bộc lộ tính cách; không bắt phải có tai nạn hay tranh cãi.
Mở ngay ở việc đang diễn ra. Chọn chi tiết dễ hình dung, khẩu ngữ có nhịp dài ngắn. Dừng đúng lúc quan hệ hoặc cái lệch vừa lộ rõ; không cần thông điệp, hình phạt hay câu chốt thông minh. Thoại trẻ diễn người lớn vẫn được tự tin, hiểu chuyện, xưng hô theo vai. Chỉ dùng cast đã chọn, giữ quan hệ, giới tính và vóc dáng.`;
  const intent =
    input.intent || "Chọn một chuyện mới từ gia đình và 20 tập gần nhất.";
  trace.candidates = await checked(
    `${writerContext}
Ý TƯỞNG NGƯỜI DÙNG: ${intent}
Đề xuất ĐÚNG BA tình huống A/B/C trước khi viết kịch bản. Nếu đã có đề tài/format, cả ba giữ đề tài ấy nhưng phát triển bằng hành vi và quan hệ KHÁC NHAU; nếu để trống, chọn ba hướng khác nhau.
Mỗi phương án gồm situation, familiarPattern (thường thức/format được nhận ra), observedBehavior (hành vi cụ thể đời thường), progression (2–4 việc/câu đáp làm tình huống tiếp diễn), stopPoint (đúng khoảnh khắc nên cắt, không bắt giải quyết hậu quả), risk (vì sao có thể nhạt), sampleExchange (2–4 lượt thoại cùng hành động, đúng cast).
Viết mẫu đối đáp thật để so sánh, không chỉ nhãn hài. Trước hết tìm thói quen nhỏ của con người (cách nhờ, hỏi vặn, giữ thể diện, chen nhu cầu), rồi đặt vào tình huống; đừng bắt đầu bằng danh sách thuật ngữ để đổi tên đồ chơi. Mẫu trao đổi phải cho thấy nét riêng của hai người đang nói. Mỗi progression phát triển cái vừa xảy ra/được kể, không chỉ chuyển sang tiện ích/chủ đề kế tiếp. Quan sát ý muốn, thói quen và cách nhân vật phản ứng trước người kia. Các phương án khác nhau về cách chuyện diễn ra, không chỉ thay đồ vật. Không chọn sẵn phương án thắng. Mỗi trường mô tả ngắn gọn, sampleExchange mỗi câu tối đa 25 từ.`,
    (v) => validatePremises(v, allowed),
    premiseSchema(allowed),
    0.9,
  );
  await checkpoint("selection");
  trace.selection = await checked(
    `${writerContext}
${FAMILY_EDITORIAL_BENCHMARK}
Ý TƯỞNG PHẢI GIỮ: ${intent}
Đây là ba phương án của một người viết khác: ${JSON.stringify(trace.candidates)}
So sánh thực sự observedBehavior/progression/sampleExchange của cả ba. Cần lý do để xem tiếp ngoài hình bé + vai người lớn. Ai làm gì khiến người kia phải phản ứng khác? Phần nào chỉ lặp, kể lại, đổi tên đồ vật hoặc câu kết thêm cho có?
Đánh giá từng A/B/C bằng develop hoặc reject, strongestDetail trích NGUYÊN VĂN một đoạn trong hành vi/diễn biến/kết/thoại của đúng phương án, weakness và reason cụ thể. Không tự chấm đạt vì đúng cơ chế. Loại phương án chỉ liệt kê ba ví dụ của tiền đề (gối=nhập khẩu, bánh=kho năng lượng, trùm chăn=bảo mật); nếu đổi thứ tự các câu mà không mất gì thì cần xem xét kỹ khả năng chỉ là danh mục. Câu dẫn bình thường vẫn được; đánh giá toàn cuộc tương tác và chi tiết về con người, không đếm thuật ngữ/punchline. selectedId chọn phương án develop mạnh nhất và reason phải giải thích vì sao hơn các phương án khác. Nếu cả ba nhạt thì selectedId=null; không bắt chọn phương án ít dở nhất. Không đề xuất thay đề tài người dùng.`,
    (v) => validateSelection(v, trace.candidates),
    selectionSchema,
  );
  await checkpoint("draft");
  const selected = trace.candidates.find(
    (c) => c.id === trace.selection?.selectedId,
  );
  if (!selected) throw new Error("FAMILY_PREMISES_NEED_REVIEW");
  let story = await checked(
    `${writerContext}
Ý TƯỞNG PHẢI GIỮ: ${intent}
TÌNH HUỐNG ĐÃ CHỌN: ${JSON.stringify(selected)}
NHẬN XÉT SO SÁNH: ${JSON.stringify(trace.selection)}
Viết bản đầy đủ bằng tiếng Việt, khai thác hành vi/quan hệ cụ thể đã chọn. Không chỉ minh họa một phép đảo vai hoặc gắn micro vào chuyện kể. Giữ các câu phản ứng có tác dụng, không bắt mỗi câu là một trò đùa. Khác biệt hai bé phải thể hiện qua cách xử lý/đối đáp, không chỉ đổi tên người nói.
Thời lượng dự kiến ${input.targetDurationSeconds || 35} giây; đừng kéo chuyện cho đủ số lượt. Tổng 15–120 đơn vị lời thoại, mỗi lượt tối đa 35; tối đa 12 lượt kể cả reaction. Có thể không có reaction nếu đã đủ điểm dừng. Viết tình huống đang diễn ra, lời kể chỉ khi format cần và cách kể tự có sức hút.
endingPlan.mode chọn hard_cut, silent_reaction hoặc resolved. stopAfterLine bắt buộc bằng đúng số lượt thoại; anchorQuote trích nguyên văn từ thoại/action lượt cuối; reason nói vì sao phép đảo/quan hệ hạ đúng ở đó. payoff và beats.payoff là mô tả điểm dừng để tương thích dữ liệu, KHÔNG phải yêu cầu punchline. Nếu dùng silent_reaction thì beats.reaction mô tả phản ứng không thoại; hai mode còn lại để reaction rỗng. Trước khi trả, thử xóa lần lượt các câu cuối: cắt mọi câu không làm mất điểm rơi. Không thêm câu mở vấn đề mới sau khi chuyện đã hạ, không nối câu đùa thứ hai để “finish”. Trước khi trả, đọc từng câu từ góc nhìn người đang nói: hai chị em nói với nhau dùng chị/em, “chị em mình/tụi mình”; nói với bố mẹ dùng “tụi con”; không để một bé tự gọi cả hai là “hai đứa”.
comicPremise ghi thường thức/format gốc, điều bị đảo/lệch và tín hiệu nhìn/nghe thấy. Phần thoại/action phải tự thể hiện, không dựa vào lời tác giả tự khen. Không thêm người ngoài cast, không ép parody thành việc chăm bố mẹ.
Trả JSON: ${STORY_SCHEMA}`,
    (v) =>
      validateGeneratedFamilyStory(
        unpackStory(v),
        profile,
        allowed,
        context.recentStories,
      ),
    storyResponseSchema(profile, allowed),
    0.8,
  );
  let review;
  for (let attempt = 0; attempt < 2; attempt++) {
    trace.drafts.push({
      dialogue: story.dialogue,
      setup: story.setup,
      payoff: story.payoff,
      endingPlan: story.endingPlan,
    });
    await checkpoint("review");
    // Read the staged dialogue without the writer's self-justification or selection verdict.
    review = await checked(
      buildFamilyEditorialPrompt(input, story),
      (v) => validateEditorialReview(v, story),
      editorialReviewSchema,
    );
    trace.drafts[trace.drafts.length - 1].review = review;
    await checkpoint("review");
    if (review.passed) break;
    if (review.watchability.decision === "reject" || attempt === 1)
      throw new Error("FAMILY_EDITORIAL_NEEDS_REVIEW");
    story = await checked(
      `${writerContext}
Ý TƯỞNG PHẢI GIỮ: ${intent}
BẢN CHỮ: ${JSON.stringify(story)}
NHẬN XÉT BẮT BUỘC SỬA: ${JSON.stringify(review)}
Sửa một lượt theo lý do cụ thể, giữ đoạn đang có sức sống. Nếu endingCheck=forced_tail, cắt từ sau lastNecessaryLine rồi cập nhật endingPlan; không thay đuôi thừa bằng một câu chốt mới. Nếu unfinished, phát triển đúng việc đang diễn trước khi chọn điểm cắt. Nếu speechCheck=needs_revision, sửa đúng ngôi nói/khẩu ngữ ở câu được trích và rà cùng lỗi trong các câu khác; không đổi diễn biến chỉ để chữa đại từ. Không thêm câu chốt thông minh để che tiền đề yếu, không rút tất cả thoại thành câu cụt. Giữ nguyên đề tài, cast và format. Trả toàn bộ JSON: ${STORY_SCHEMA}`,
      (v) =>
        validateGeneratedFamilyStory(
          unpackStory(v),
          profile,
          allowed,
          context.recentStories,
        ),
      storyResponseSchema(profile, allowed),
    );
  }
  if (!review?.passed) throw new Error("FAMILY_EDITORIAL_NEEDS_REVIEW");
  await checkpoint("shots");
  const hasReaction = story.beats.at(-1)?.purpose === "reaction";
  const shotCount = story.dialogue.length + (hasReaction ? 1 : 0);
  const groups = storyboardGroups(story.dialogue, hasReaction);
  const result = await checked(
    `${contextText(context, allowed)}
CÂU CHUYỆN ĐÃ SOẠN: ${JSON.stringify(story)}
DỰNG STORYBOARD: chia thành ${groups.length} đoạn video, mỗi đoạn 15 giây. Các nhịp thoại/panel được nhóm sẵn (chỉ số từ 1): ${JSON.stringify(groups.map((g) => g.map((i) => i + 1)))}. Mỗi panel là một nhịp bên trong đoạn, KHÔNG phải một job video riêng. GIỮ NGUYÊN câu thoại, thứ tự và người nói. Không thêm lời. durationSeconds ở panel chỉ là nhịp diễn dự kiến; server chia timeline 15 giây của cả đoạn.
Trong cùng đoạn: cùng bối cảnh, ánh sáng, vị trí nhân vật, hướng nhìn và trục máy. Có thể pan theo người nói hoặc cắt đối đáp theo storyboard; không đổi cảnh ngẫu nhiên. Hành động bắt đầu ngay, người nghe phản ứng trong khi người kia nói, không đứng đợi tới lượt. Viết motionPrompt cho từng nhịp bằng hành động cụ thể, KHÔNG thêm mốc giây riêng; server gắn mốc liên tục từ 0 tới 15. Chỉ một người nói tại mỗi thời điểm, đến nhịp sau mới đổi người. Không slow motion, kéo dài âm tiết, khoảng chờ mở đầu hoặc lặp động tác để đủ 15 giây.
Panel đầu mỗi đoạn là một khung sạch có đủ người sẽ xuất hiện trong đoạn đó; đủ ảnh chuẩn từng người, đúng tỷ lệ, trang phục và vị trí. Không dùng grid/storyboard sheet làm ảnh đầu video. Các panel sau mô tả diễn tiến hành động/camera. Kết đoạn có tư thế, đạo cụ và hướng nhìn khớp đầu đoạn tiếp; giữ trục đối thoại để nối bằng hard cut. Không cố thêm reaction sau điểm dừng đã chọn. Với parody giữ tín hiệu nhận diện format.
Chỉ trả title, summary và shots với ${shotCount} khóa shot1..shot${shotCount}. Mỗi panel có action, setting, camera, durationSeconds, imagePrompt, motionPrompt và listenerCharacterIds. shot1..shot${story.dialogue.length} tương ứng các lượt thoại; ${hasReaction ? "panel cuối phản ứng im lặng đã có trong story" : "không thêm panel kết"}. imagePrompt tối đa 300 ký tự, motionPrompt tối đa 600. Không viết lại dialogue/speaker. Thời lượng phim khoảng ${input.targetDurationSeconds || 35} giây; các clip gốc 15 giây, thời lượng thực kiểm tra sau, không bịa transcript.`,
    (v) => {
      const r = validateCreativeAssist(
        "video_plan",
        compileStoryboards(v, story, context.characters),
        context,
        input.targetDurationSeconds || 35,
      );
      if (r.kind !== "video_plan") throw new Error("FAMILY_PLAN_INVALID");
      const spoken = r.scenes
        .flatMap((s) => s.storyboard?.beats || [])
        .filter((s) => s.dialogue);
      if (
        spoken.length !== story.dialogue.length ||
        spoken.some(
          (s, i) =>
            s.dialogue !== story.dialogue[i].text ||
            s.speakerCharacterId !== story.dialogue[i].characterId,
        )
      )
        throw new Error(
          "FAMILY_DIALOGUE_CHANGED: giữ nguyên thoại, thứ tự và người nói của từng nhịp storyboard",
        );
      return r;
    },
    shotResponseSchema(story, allowed),
  );
  await checkpoint("complete");
  return {
    ...result,
    story: {
      ...story,
      writingPolicyVersion: FAMILY_WRITING_POLICY_VERSION,
      editorialEvidence: review.evidence,
      development: trace,
      intendedShotSeconds: result.scenes.map(
        (s) => s.intendedDurationSeconds || s.durationSeconds,
      ),
    },
    caption: story.caption,
  };
}
