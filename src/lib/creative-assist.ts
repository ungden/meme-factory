import {
  storyResponseSchema,
  shotResponseSchema,
  unpackStory,
  compileStoryShots,
} from "./family-ai-contract";
import {
  validateStory,
  localFamilyEditorialIssues,
  STORY_SCHEMA,
  type ChannelProfile,
  type FamilyEditorialIssue,
  type Story,
  type RecentStory,
} from "./family-catalogue";
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

async function generateJson(prompt: string, responseJsonSchema?: unknown) {
  const ai = new GoogleGenAI({ apiKey: await getGeminiApiKey() });
  const model = process.env.CREATIVE_TEXT_MODEL || "gemini-3-flash-preview";
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
      temperature: 0.5,
      httpOptions: { timeout: responseJsonSchema ? 45000 : 35000 },
    },
  });
  return JSON.parse(response.text || "{}") as unknown;
}

const familyEditorialReviewSchema = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    issues: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          location: { type: "string" },
          quote: { type: "string" },
          reason: { type: "string" },
        },
        required: ["location", "quote", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["passed", "issues"],
  additionalProperties: false,
};

function unpackEditorialReview(value: unknown) {
  const review = value as { passed?: unknown; issues?: unknown };
  const issues = Array.isArray(review?.issues)
    ? review.issues
        .map((item) => item as Partial<FamilyEditorialIssue>)
        .filter(
          (item): item is FamilyEditorialIssue =>
            typeof item.location === "string" &&
            typeof item.quote === "string" &&
            typeof item.reason === "string",
        )
        .slice(0, 12)
    : [];
  if (typeof review?.passed !== "boolean")
    throw new Error("FAMILY_EDITORIAL_REVIEW_INVALID");
  return { passed: review.passed && issues.length === 0, issues };
}

async function reviewFamilyStory(
  story: Story,
  context: CreativeContext,
  allowed: string[],
) {
  return unpackEditorialReview(
    await generateJson(
      `${contextText(context, allowed)}
Bạn là biên tập viên độc lập. Chỉ đánh giá lời thoại và điểm dừng của kịch bản sau, không viết lại: ${JSON.stringify(story)}

Đọc từng câu như lời nói thật trong nhà, không đọc như văn trên giấy. Chỉ passed khi:
- Bánh Bao nghe như bé gái mẫu giáo thích làm chị; Đậu Đỏ nghe như bé trai chập chững, câu ngắn và phản ứng vào điều vừa nghe. Bố Mẹ nói đời thường.
- Mỗi câu là điều nhân vật có lý do nói ngay lúc đó. Không dùng ẩn dụ, khẩu hiệu, câu đối, thuật ngữ quảng cáo/hành chính để tác giả cố tạo tiếng cười.
- Hài đến từ mong muốn đối nghịch, hiểu nhầm hoặc hành động; lời thoại không tự giải thích trò đùa.
- Payoff dùng chi tiết đã có và dừng đúng chỗ. Không bắt người bị lộ phải hối lỗi, không thêm câu thắng cuộc hay reaction nếu hình ảnh đã chốt được chuyện.
- Hành động mô tả thứ máy quay nhìn thấy, không gán nhãn cảm xúc như “đắc thắng”, “đầy hối lỗi”, “đầy ẩn ý”.

Ví dụ câu phải báo lỗi: “vụn bánh đang nhảy múa”, “cái má khai hết rồi”, “không cùng phe”, “hệ điều hành khác”, “chốt đơn”. Những câu này là văn viết. Một câu đời thường như “Má em dính gì kìa?” hoặc một hành động im lặng thường tự nhiên hơn. Không đòi thêm bài học hay kết êm.
Trả passed và issues. Mỗi issue ghi location, trích đúng quote và lý do cụ thể.`,
      familyEditorialReviewSchema,
    ),
  );
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

/** Story, dialogue, independent editorial review and shot planning. Never starts media. */
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
    schema?: unknown,
  ): Promise<T> {
    let candidate: unknown;
    try {
      candidate = await generateJson(prompt, schema);
      return validate(candidate);
    } catch (e) {
      if (repairs++ >= 1) throw e;
      candidate = await generateJson(
        `${prompt}\nSửa bản vừa trả, không thay đề tài: ${JSON.stringify(candidate)}\nLỗi: ${e instanceof Error ? e.message : e}`,
        schema,
      );
      return validate(candidate);
    }
  }
  const draftStory = await checked(
    `${contextText(context, allowed)}
Viết CÂU CHUYỆN trước khi chia shot. Ý tưởng: ${input.intent || "Một chuyện nhỏ mới của gia đình"}.
Viết bản ngắn nhất vẫn đủ chuyện, thường 3–12 lượt thoại; không kéo cho đủ thời lượng. Mở bằng việc đang xảy ra. Mỗi câu phải khiến người kia đổi cách làm, lộ ý muốn hoặc tạo hệ quả. Cú chốt phải phát sinh từ một chi tiết đã có; nhân vật không được bỗng dưng làm trái điều vừa hiểu để phục vụ cú chốt. Có thể kết bằng người bị hớ, một sự đồng lõa hoặc một biểu cảm; reaction sau payoff để trống nếu không làm đoạn kết vui hơn.
Thoại là khẩu ngữ Việt Nam: câu ngắn, có ngắt, phản bác và chống chế. Trẻ có thể bắt chước cách nói người lớn để đạt mục đích trẻ con, nhưng không dùng từ hành chính, ẩn dụ cầu kỳ hoặc câu đối đẹp chỉ để tỏ ra thông minh. Tình cảm thể hiện bằng hành động; không chữa mâu thuẫn bằng câu chia sẻ/hợp tác và không giảng đạo. Hai người có mong muốn khác nhau. So sánh tình huống, cơ chế và kết quả với 20 tập trước; đổi người thắng và liên minh.
Trả JSON: ${STORY_SCHEMA}`,
    (v) =>
      validateStory(unpackStory(v), profile, allowed, context.recentStories),
    storyResponseSchema(profile, allowed),
  );
  let story = await checked(
    `${contextText(context, allowed)}
Bạn là biên tập thoại cuối, không phải người viết quảng cáo. Đọc bản nháp sau thành tiếng và sửa trực tiếp: ${JSON.stringify(draftStory)}
Giữ ý tưởng và cast. Được sửa setup, mechanism, outcome, payoff, beats, thoại và hành động để nhân quả kín hơn. Cắt câu giải thích điều khán giả vừa thấy, câu văn hành chính, ẩn dụ gượng, lời đạo lý và reaction thừa. Mỗi nhân vật phải muốn một thứ cụ thể trong cảnh. Đậu Đỏ là em trai chập chững nên nói ngắn, bám vào từ vừa nghe; Bánh Bao là chị mẫu giáo, chỉ nói kiểu người lớn khi đang bày luật hoặc mặc cả. Bố chống chế đời thường; Mẹ bắt bài gọn. Câu cuối phải là điểm dừng tự nhiên và vui nhất, không cần hòa giải.
Tự kiểm tra: nếu bỏ tên người nói thì vẫn nhận ra ít nhất Bánh Bao và Đậu Đỏ qua cách phản ứng; payoff không phụ thuộc vào hành động vô lý; bỏ câu cuối nếu nó chỉ giải thích trò đùa. Trả toàn bộ JSON theo schema: ${STORY_SCHEMA}`,
    (v) =>
      validateStory(unpackStory(v), profile, allowed, context.recentStories),
    storyResponseSchema(profile, allowed),
  );
  let editorialIssues = localFamilyEditorialIssues(story);
  let editorialAccepted = false;
  if (!editorialIssues.length) {
    const review = await reviewFamilyStory(story, context, allowed);
    editorialIssues = review.passed ? [] : review.issues;
    editorialAccepted = review.passed;
  }
  if (editorialIssues.length) {
    story = await checked(
      `${contextText(context, allowed)}
Sửa kịch bản sau theo đúng nhận xét của biên tập viên, giữ đề tài, cast và quan hệ nhân quả: ${JSON.stringify(story)}
NHẬN XÉT BẮT BUỘC SỬA: ${JSON.stringify(editorialIssues)}

Viết lại bằng câu người trong một gia đình Việt có thể bật ra ngay lúc đó. Để hành động và bằng chứng tạo tiếng cười; không thay câu văn viết bằng một ẩn dụ khác. Được cắt reaction, câu thắng cuộc hoặc cả một lượt thoại nếu payoff đã rõ. Hành động chỉ mô tả cử chỉ nhìn thấy được. Không giảng đạo và không làm người bị hớ phải hối lỗi. Trả toàn bộ JSON theo schema: ${STORY_SCHEMA}`,
      (v) =>
        validateStory(unpackStory(v), profile, allowed, context.recentStories),
      storyResponseSchema(profile, allowed),
    );
    editorialAccepted = false;
  }
  const remainingLocalIssues = localFamilyEditorialIssues(story);
  const finalReview = editorialAccepted
    ? { passed: true, issues: [] }
    : remainingLocalIssues.length
      ? { passed: false, issues: remainingLocalIssues }
      : await reviewFamilyStory(story, context, allowed);
  if (!finalReview.passed) {
    throw new Error(
      `FAMILY_EDITORIAL_NEEDS_REVIEW: ${JSON.stringify(finalReview.issues)}`,
    );
  }
  const hasReaction = story.beats.at(-1)?.purpose === "reaction";
  const shotCount = story.dialogue.length + (hasReaction ? 1 : 0);
  const result = await checked(
    `${contextText(context, allowed)}
CÂU CHUYỆN ĐÃ SOẠN: ${JSON.stringify(story)}
Chuyển thành shot sản xuất, GIỮ NGUYÊN từng câu thoại và người nói theo đúng thứ tự. Một lượt thoại là một shot và chỉ có một người nói. Có thể giữ tối đa một người nghe trong khung bằng listenerCharacterIds khi biểu cảm hoặc khoảng nhìn của họ giúp cuộc đối đáp tự nhiên. Cảnh đầu là lời đầu, không thêm mở đầu im lặng. Chỉ tạo shot phản ứng không thoại nếu story đã có reaction. Không thêm lời. Prompt ảnh giữ vị trí, đạo cụ, hướng nhìn và trục đối thoại nhất quán.
Phân biệt clip sinh và thời lượng dựng: durationSeconds là thời lượng clip NGUYÊN 4–30 giây, đủ câu ở tốc độ tối đa 2.6 từ/giây, không bắt tổng clip đúng thời lượng tập. Thời lượng phim ${input.targetDurationSeconds || 35} giây chỉ là dự kiến. KHÔNG ràng buộc tổng clip gốc vào thời lượng phim; thành phẩm tính sau từ audio thật. Không bịa mốc transcript.
Chỉ trả title, summary và object shots với ${shotCount} khóa shot1 đến shot${shotCount}. Mỗi shot có action, setting, camera, durationSeconds, imagePrompt, motionPrompt và listenerCharacterIds. KHÔNG viết lại dialogue hoặc speaker. shot1..shot${story.dialogue.length} tương ứng đúng thứ tự các lượt thoại. Mỗi prompt ảnh/chuyển động tối đa 300 ký tự, cụ thể và không lặp hồ sơ nhân vật.${hasReaction ? " Shot cuối là phản ứng không thoại đã có trong story." : " Không thêm shot kết."} Server giữ nguyên từng câu và ID người nói từ câu chuyện.`,
    (v) => {
      const r = validateCreativeAssist(
        "video_plan",
        compileStoryShots(v, story, context.characters),
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
            !s.characterIds.includes(story.dialogue[i].characterId) ||
            s.characterIds.length > 2,
        )
      )
        throw new Error(
          "FAMILY_DIALOGUE_CHANGED: giữ nguyên thoại, thứ tự, đúng người nói và tối đa một người nghe",
        );
      return r;
    },
    shotResponseSchema(story, allowed),
  );
  return {
    ...result,
    story: {
      ...story,
      intendedShotSeconds: result.scenes.map(
        (s) => s.intendedDurationSeconds || s.durationSeconds,
      ),
    },
    caption: story.caption,
  };
}
