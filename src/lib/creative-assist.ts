import {
  validateStory,
  STORY_SCHEMA,
  type ChannelProfile,
  type Story,
} from "./family-catalogue";
import { GoogleGenAI } from "@google/genai";
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
  recentStories?: Story[];
  brandVoice?: string | null;
  audience?: string | null;
  guidelines?: string | null;
  characters: CreativeCharacter[];
  recentContent: string[];
};

export type PlannedScene = {
  characterIds: string[];
  speakerCharacterId: string | null;
  dialogue: string;
  action: string;
  setting: string;
  camera: string;
  durationSeconds: number;
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
  const duration = Number(item.durationSeconds);
  const dialogue = text(item.dialogue, 700);
  if (
    !ids.length ||
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
    (!speaker || dialogue.split(/\s+/).length > Math.ceil(duration * 2.6))
  )
    return null;
  return {
    characterIds: ids,
    speakerCharacterId: speaker,
    dialogue,
    action: text(item.action, 900),
    setting: text(item.setting, 700),
    camera: text(item.camera, 400),
    durationSeconds: duration as PlannedScene["durationSeconds"],
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
      `CREATIVE_ASSIST_SCENE_${invalid + 1}_INVALID: use valid cast IDs, action, setting, imagePrompt, motionPrompt; durationSeconds integer 4-30; dialogue <= 2.6 words/second with speaker in cast`,
    );
  const scenes = parsedScenes as PlannedScene[];
  if (kind === "video_plan") {
    const sum = scenes.reduce(
      (total, scene) => total + scene.durationSeconds,
      0,
    );
    if (
      scenes.length < 3 ||
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

function contextText(context: CreativeContext, selectedIds: string[]) {
  const selected = selectedIds.length
    ? context.characters.filter((item) => selectedIds.includes(item.id))
    : context.characters;
  return `${context.channelProfile ? "HỒ SƠ KÊNH (giữ vai trò và tính cách, không tự đổi ảnh chuẩn): " + JSON.stringify(context.channelProfile) + "\n20 TẬP GẦN NHẤT (tránh lặp tổ hợp tình huống–cơ chế–kết quả và cùng người luôn thua): " + JSON.stringify(context.recentStories || []) + "\n" : ""}DỰ ÁN: ${context.projectName}\nGIỌNG VIẾT: ${context.brandVoice || "tự nhiên, rõ ràng"}\nĐỘC GIẢ: ${context.audience || "khán giả fanpage Việt Nam"}\nHƯỚNG DẪN: ${context.guidelines || ""}\nNHÂN VẬT ĐƯỢC PHÉP DÙNG (chỉ dùng ID trong danh sách):\n${selected.map((character) => `- ${character.name} | ID ${character.id} | ${character.description || "nhân vật 3D đã duyệt"}; ${character.personality || ""}`).join("\n") || "Không có nhân vật được chọn."}\nNỘI DUNG GẦN ĐÂY CẦN TRÁNH LẶP: ${context.recentContent.join(" | ") || "chưa có"}`;
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
    return `${base}\n\nViết video nhiều cảnh tổng khoảng ${target} giây, tối thiểu ba cảnh. Có mở đầu, diễn biến và điểm chốt. Mỗi cảnh chỉ một người nói và một câu thoại ngắn nếu cần. Shot có thoại dùng cận cảnh chỉ một người trong characterIds để đồng bộ môi; cảnh nhiều người dành cho hành động, mở cảnh hoặc phản ứng không thoại. Mỗi durationSeconds là số nguyên từ 4 đến 30; lời thoại không quá 2.6 từ/giây. Tổng durationSeconds phải trong ±5 giây so với ${target}. imagePrompt là ảnh đầu của cảnh; motionPrompt là hành động để sinh clip. Dùng cảnh độc lập trừ khi hành động thực sự nối tiếp.`;
  return `${base}\n\nChỉ sửa các cảnh mà yêu cầu nhắc tới. Cảnh khoá (chỉ số từ 1): ${(input.lockedSceneIndexes || []).map((index) => index + 1).join(", ") || "không có"}. Giữ nguyên nguyên văn các cảnh khoá. Cảnh hiện tại:\n${JSON.stringify(input.currentScenes || [])}`;
}

async function generateJson(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: await getGeminiApiKey() });
  const response = await ai.models.generateContent({
    model: process.env.CREATIVE_TEXT_MODEL || "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.5,
      httpOptions: { timeout: 35000 },
    },
  });
  return JSON.parse(response.text || "{}") as unknown;
}

export async function generateCreativeAssist(input: CreativeAssistInput) {
  if (input.kind === "video_plan" && input.context.channelProfile)
    return generateFamilyFilm(input);
  const prompt = `${instruction(input)}\n\nTrả về JSON ĐÚNG schema, không markdown:\n${schemaFor(input.kind)}`;
  let candidate: unknown;
  try {
    candidate = await generateJson(prompt);
    return validateCreativeAssist(
      input.kind,
      candidate,
      input.context,
      input.targetDurationSeconds,
    );
  } catch (error) {
    candidate = await generateJson(
      `${prompt}\n\nSửa đúng bản JSON sau (không bỏ cảnh): ${JSON.stringify(candidate ?? {})}\nLỗi cần sửa: ${error instanceof Error ? error.message : "JSON không hợp lệ"}`,
    );
    return validateCreativeAssist(
      input.kind,
      candidate,
      input.context,
      input.targetDurationSeconds,
    );
  }
}

/** Two semantic passes, one repair budget across the whole request. Never starts media. */
async function generateFamilyFilm(input: CreativeAssistInput) {
  const profile = input.context.channelProfile!;
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
  ): Promise<T> {
    let candidate: unknown;
    try {
      candidate = await generateJson(prompt);
      return validate(candidate);
    } catch (e) {
      if (repairs++ >= 1) throw e;
      candidate = await generateJson(
        `${prompt}\nSửa bản vừa trả, không thay đề tài: ${JSON.stringify(candidate)}\nLỗi: ${e instanceof Error ? e.message : e}`,
      );
      return validate(candidate);
    }
  }
  const story = await checked(
    `${contextText(context, allowed)}
Viết CÂU CHUYỆN trước khi chia shot. Ý tưởng: ${input.intent || "Một chuyện nhỏ mới của gia đình"}.
6–10 lượt thoại, tổng 60–90 từ tiếng Việt. Hook là yêu cầu/hành động ngay đầu, không giới thiệu lại gia đình. Hai hoặc ba nhịp thay đổi tình thế; cú chốt được chuẩn bị từ setup; phản ứng cuối cụ thể, không cả nhà cùng cười. Hai người có mong muốn khác nhau. Hài mà thương nhau; không giảng đạo. So sánh cả tình huống, cơ chế và kết quả với 20 tập trước; viết cách kể mới, không chỉ đổi từ đồng nghĩa. Vai trò người thắng/liên minh cần thay đổi.
Trả JSON: ${STORY_SCHEMA}`,
    (v) => validateStory(v, profile, allowed, context.recentStories),
  );
  const result = await checked(
    `${contextText(context, allowed)}
CÂU CHUYỆN ĐÃ SOẠN: ${JSON.stringify(story)}
Chuyển thành shot sản xuất, GIỮ NGUYÊN từng câu thoại và người nói theo đúng thứ tự. Mỗi lượt thoại là một shot chỉ có người nói trong characterIds. Cảnh đầu là lời đầu, không mở bằng cảnh im lặng. Chỉ thêm đúng một shot phản ứng không thoại cuối; 7–11 shot tất cả. Không thêm lời. Hook bắt đầu ngay, không thêm cảnh mở đầu im lặng dài. Cuối có phản ứng cụ thể. Prompt ảnh có vị trí, đạo cụ, hướng nhìn và bối cảnh nhất quán. Giữ trục đối thoại qua các shot, không đưa người nghe vào shot lip-sync.
Phân biệt clip sinh và thời lượng dựng: durationSeconds là thời lượng clip NGUYÊN 4–30 giây, đủ câu ở tốc độ tối đa 2.6 từ/giây, không bắt tổng clip đúng thời lượng tập. Thời lượng phim ${input.targetDurationSeconds || 35} giây chỉ là dự kiến. KHÔNG ràng buộc tổng clip gốc vào thời lượng phim; thành phẩm tính sau từ audio thật. Không bịa mốc transcript.
JSON: ${schemaFor("video_plan")}`,
    (v) => {
      const r = validateCreativeAssist(
        "video_plan",
        v,
        context,
        input.targetDurationSeconds || 35,
      );
      if (r.kind !== "video_plan") throw new Error("FAMILY_PLAN_INVALID");
      const spoken = r.scenes.filter((s) => s.dialogue);
      if (
        spoken.length !== story.dialogue.length ||
        spoken.some(
          (s, i) =>
            s.dialogue !== story.dialogue[i].text ||
            s.speakerCharacterId !== story.dialogue[i].characterId ||
            s.characterIds.length !== 1,
        )
      )
        throw new Error(
          "FAMILY_DIALOGUE_CHANGED: giữ nguyên thoại, thứ tự, người nói; chỉ một người trong shot thoại",
        );
      return r;
    },
  );
  return { ...result, story, caption: story.caption };
}
