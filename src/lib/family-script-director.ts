import { FILM_INTERACTION_POLICY } from "./film-motion-policy";
import { storyboardGroups } from "./film-storyboard";
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
  storyHasReaction,
  storyShotCount,
} from "./family-ai-contract";
import {
  validateGeneratedFamilyStory,
  normalizeStoryGuests,
  assertDeclaredGuests,
  STORY_SCHEMA,
  type ChannelProfile,
  type Story,
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
import { normalizeFamilyFatherTerms } from "./family-terminology";
import { PERFORMANCE_LANES } from "./performance-direction";
import {
  creativeAssistModel,
  validateCreativeAssist,
  type CreativeAssistInput,
  type CreativeAssistOptions,
  type CreativeAssistResult,
  type CreativeContext,
} from "./creative-assist";

/** The AI director pipeline runs exactly one stage per claim; a stuck stage
 *  parks the run and resumes from the persisted state, never from scratch. */
export const FAMILY_SCRIPT_STAGES = [
  "premises",
  "selection",
  "draft",
  "review",
  "shots",
] as const;
export type FamilyScriptStageKind = (typeof FAMILY_SCRIPT_STAGES)[number];

export type FamilyScriptPipelineState = {
  benchmarkVersion: string;
  stage: FamilyDevelopmentTrace["stage"];
  candidates: FamilyDevelopmentTrace["candidates"];
  selection?: FamilyDevelopmentTrace["selection"];
  drafts: FamilyDevelopmentTrace["drafts"];
  validationFailures?: FamilyDevelopmentTrace["validationFailures"];
  story?: Story;
  draftVersion: number;
  reviewCount: number;
  reviewPassed?: boolean;
  result?: Extract<CreativeAssistResult, { kind: "video_plan" }>;
  completedStages: FamilyScriptStageKind[];
};

/**
 * Mỗi lần checkpoint, toàn bộ state được ghi vào short_film_script_runs.state.
 * Không chặn trần thì danh sách lỗi (kèm nguyên văn phản hồi của model) cứ dài
 * thêm qua từng lần resume và phình hàng đầu ra một bản ghi jsonb. Giữ các lần
 * hỏng gần nhất là đủ để chẩn đoán.
 */
const MAX_VALIDATION_FAILURES = 10;
const MAX_FAILURE_RESPONSE_CHARS = 2000;

function recordFailure(
  existing: FamilyDevelopmentTrace["validationFailures"],
  failure: { stage: FamilyDevelopmentTrace["stage"]; error: string; response: unknown },
): FamilyDevelopmentTrace["validationFailures"] {
  const response =
    typeof failure.response === "string"
      ? failure.response.slice(0, MAX_FAILURE_RESPONSE_CHARS)
      : failure.response === null || failure.response === undefined
        ? null
        : JSON.stringify(failure.response)?.slice(0, MAX_FAILURE_RESPONSE_CHARS) ??
          null;
  return [
    ...(existing || []),
    { ...failure, error: failure.error.slice(0, 1000), response },
  ].slice(-MAX_VALIDATION_FAILURES);
}

export function emptyFamilyScriptState(): FamilyScriptPipelineState {
  return {
    benchmarkVersion: FAMILY_BENCHMARK_VERSION,
    stage: "premises",
    candidates: [],
    drafts: [],
    draftVersion: 0,
    reviewCount: 0,
    completedStages: [],
  };
}

export function nextScriptStage(
  stage: FamilyScriptStageKind,
): FamilyScriptStageKind | "done" {
  const index = FAMILY_SCRIPT_STAGES.indexOf(stage);
  return FAMILY_SCRIPT_STAGES[index + 1] ?? "done";
}

/**
 * Chỉ dẫn sửa dành cho NGƯỜI VIẾT, không phải cho người dùng cuối. Phần lớn mã
 * lỗi tới tay model dưới dạng trần (STORY_WANTS_INVALID), tức là model phải đoán
 * xem sai ở đâu — mà nó chỉ có đúng một lượt sửa. Bảng này nói thẳng cần đổi gì.
 *
 * Cố ý tách khỏi ERROR_MESSAGES trong error-messages.ts: bảng kia viết cho người
 * dùng và thường kết bằng "Hãy cho AI viết lại", vô nghĩa khi chính AI đang đọc.
 */
const REPAIR_HINTS: Record<string, string> = {
  STORY_STRUCTURE_INVALID:
    "Thiếu hoặc bỏ trống một trong các trường bắt buộc: series (phải nằm đúng danh sách đã cho), situation, mechanism, outcome, payoff, setup, caption. Điền đủ, mỗi trường trên 3 ký tự.",
  STORY_WANTS_INVALID:
    "Cần tối thiểu hai mục wants, mỗi mục dùng đúng một characterId trong danh sách được phép và nêu điều nhân vật đó muốn.",
  STORY_DIALOGUE_INVALID:
    "Mỗi lượt thoại cần đủ characterId hợp lệ, text và action; tổng số lượt từ 3 đến 12.",
  STORY_DIALOGUE_LINE_TOO_LONG:
    "Có lượt thoại vượt 35 từ. Tách thành hai lượt hoặc rút ngắn, đừng cắt mất ý.",
  STORY_COMIC_PREMISE_REQUIRED:
    "Thiếu comicPremise. Ghi rõ normalExpectation, invertedReality và visibleContrast.",
  STORY_COMIC_PREMISE_INVALID:
    "comicPremise cần cả ba trường, mỗi trường từ 8 ký tự trở lên và dưới 1000.",
  STORY_ENDING_REQUIRED:
    "Thiếu endingPlan. Chọn mode, đặt stopAfterLine bằng đúng số lượt thoại, trích anchorQuote nguyên văn từ lượt cuối và nêu lý do dừng ở đó.",
  STORY_PERFORMANCE_LANE_INVALID:
    "performanceLane phải là đúng một giá trị trong danh sách lane đã cho.",
  STORY_REPEATED_COMBINATION:
    "Bộ ba situation/mechanism/outcome trùng một tập đã có. Đổi cách chuyện diễn ra, không chỉ đổi đồ vật hay tên.",
  STORY_GUESTS_INVALID:
    "guests phải là một mảng, tối đa hai người.",
  STORY_GUEST_KEY_INVALID:
    "Khách mời chỉ được dùng key guest-1 hoặc guest-2, và không lặp key.",
  STORY_GUEST_DESCRIPTION_REQUIRED:
    "Mỗi khách mời cần name và description tả ngoại hình đủ rõ để dựng ảnh (từ 8 ký tự).",
  STORY_GUEST_UNDECLARED:
    "Thoại hoặc wants dùng một key khách mời chưa khai trong guests. Khai đủ, hoặc đổi sang nhân vật đã có.",
  STORY_SHOTS_MISSING:
    "Số panel không khớp: cần đúng một panel cho mỗi lượt thoại, cộng một panel nữa nếu tập kết bằng reaction im lặng.",
  CREATIVE_PERFORMANCE_DIRECTION_MISSING:
    "Panel thiếu performanceDirection. Mỗi panel cần comicObjective, statusBefore/statusAfter, hook, tối thiểu hai beat hành động vật lý, reactionTarget và revealOrCut.",
  PERFORMANCE_DIRECTION_INVALID:
    "performanceDirection sai cấu trúc: version phải là 1, lane hợp lệ, comicObjective/statusBefore/statusAfter/hook/revealOrCut là câu cụ thể (không chỉ \"cut\"), và beats có từ 2 đến 6 mục với đủ các trường.",
  PERFORMANCE_DIRECTION_WEAK:
    "Hướng diễn còn chung chung. Thay nhãn cảm xúc bằng hành động nhìn thấy được, và statusBefore phải khác statusAfter.",
  PERFORMANCE_LANE_MIXED:
    "Các panel đang khai nhiều lane khác nhau. Dùng đúng một lane cho cả tập.",
  FAMILY_PREMISES_INVALID:
    "Cần đúng ba phương án A/B/C, mỗi phương án đủ situation, familiarPattern, observedBehavior, progression, stopPoint, risk và sampleExchange.",
  FAMILY_PREMISES_DUPLICATED:
    "Ba phương án quá giống nhau. Cho chúng khác nhau ở cách chuyện diễn ra, không chỉ khác đồ vật.",
  FAMILY_SELECTION_INVALID:
    "Phần chọn phương án cần verdict cho từng A/B/C, strongestDetail trích nguyên văn, và selectedId là một phương án được đánh develop (hoặc null nếu cả ba đều nhạt).",
  FAMILY_EDITORIAL_REVIEW_INVALID:
    "Bản nhận xét thiếu trường bắt buộc: cần watchability, endingCheck, speechCheck và intentCheck.",
  STORYBOARD_LINE_TOO_LONG:
    "Một lượt thoại dài hơn một clip nguồn cho phép. Rút ngắn câu đó trong phần dialogue.",
};

/** Nói cho người viết biết cần sửa gì, không chỉ ném lại mã lỗi. */
export function repairHint(error: string) {
  // Nhiều lỗi đã tự kèm giải thích sau dấu hai chấm; giữ nguyên.
  if (error.includes(":")) return error;
  const code = error.trim();
  const hint = REPAIR_HINTS[code] || REPAIR_HINTS[code.replace(/_\d+.*$/, "")];
  return hint ? `${code}: ${hint}` : code;
}

const FAMILY_PRO_MODEL = "gemini-3.1-pro-preview";
const FAMILY_FLASH_MODEL = "gemini-3-flash-preview";

/** A provider-level rejection of the REQUEST (not a network failure) may be a
 *  model/schema quirk; it is worth one attempt on the paired model. */
export function isProviderArgumentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /invalid.argument|INVALID_ARGUMENT|"code"\s*:\s*400|RESOURCE_EXHAUSTED|overloaded|"code"\s*:\s*429|"code"\s*:\s*503|UNAVAILABLE/i.test(
    message,
  );
}

/**
 * Primary/fallback pair per stage. Heavy story/visual stages default to the
 * stronger model; fast exploration stages default to the lighter one. Each
 * stage can be overridden independently:
 * FAMILY_{PREMISES|SELECTION|DRAFT|REVIEW|SHOTS}_PRIMARY_MODEL / _FALLBACK_MODEL.
 */
export function familyStageModels(
  stage: FamilyScriptStageKind,
): string[] {
  const heavy = stage === "draft" || stage === "shots";
  const envPrimary = process.env[`FAMILY_${stage.toUpperCase()}_PRIMARY_MODEL`];
  const envFallback = process.env[`FAMILY_${stage.toUpperCase()}_FALLBACK_MODEL`];
  const primary =
    envPrimary ||
    (heavy
      ? process.env.FAMILY_CREATIVE_TEXT_MODEL || FAMILY_PRO_MODEL
      : process.env.CREATIVE_TEXT_MODEL || FAMILY_FLASH_MODEL);
  const fallback =
    envFallback || (heavy ? FAMILY_FLASH_MODEL : FAMILY_PRO_MODEL);
  return fallback && fallback !== primary
    ? [primary, fallback]
    : fallback
      ? [primary]
      : [primary];
}

export function contextText(
  context: CreativeContext,
  selectedIds: string[],
  includeWritingPolicy = true,
) {
  const selected = selectedIds.length
    ? context.characters.filter((item) => selectedIds.includes(item.id))
    : context.characters;
  return `${context.channelProfile ? "HỒ SƠ KÊNH (giữ vai trò và tính cách, không tự đổi ảnh chuẩn): " + JSON.stringify(context.channelProfile) + "\n20 TẬP GẦN NHẤT (tránh lặp tình huống/format–cách tạo tương phản–chuỗi đối đáp/kết quả; không mặc định mọi tập có người thua): " + JSON.stringify(context.recentStories || []) + "\n" : ""}DỰ ÁN: ${context.projectName}\nGIỌNG VIẾT: ${context.channelProfile?.tone || context.brandVoice || "tự nhiên, rõ ràng"}\nĐỘC GIẢ: ${context.channelProfile?.audience || context.audience || "khán giả fanpage Việt Nam"}\nHƯỚNG DẪN: ${context.guidelines || ""}\nNHÂN VẬT ĐƯỢC PHÉP DÙNG (chỉ dùng ID trong danh sách):\n${selected.map((character) => `- ${character.name} | ID ${character.id} | ${character.description || "nhân vật 3D đã duyệt"}; ${context.channelProfile?.roles.find((role) => role.characterId === character.id)?.personality || character.personality || ""}`).join("\n") || "Không có nhân vật được chọn."}\nQUY ƯỚC GIA ĐÌNH: luôn gọi người cha là Bố/bố; không dùng Ba/ba để chỉ người cha. Từ “ba” chỉ giữ khi là số đếm.\nNỘI DUNG GẦN ĐÂY CẦN TRÁNH LẶP: ${context.recentContent.join(" | ") || "chưa có"}${context.channelProfile && includeWritingPolicy ? "\n\n" + FAMILY_WRITING_POLICY : ""}`;
}

export async function generateJson(
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

export function buildFamilyEditorialPrompt(
  input: CreativeAssistInput,
  story: Story,
) {
  const guestIds = (input.guestCharacters || []).map((guest) => guest.key);
  const allowed = [
    ...(input.selectedCharacterIds?.length
      ? input.selectedCharacterIds
      : input.context.characters.map((c) => c.id)),
    ...guestIds,
  ];
  const context = {
    ...input.context,
    characters: [
      ...input.context.characters.filter((c) => allowed.includes(c.id)),
      ...(input.guestCharacters || []).map((guest) => ({
        id: guest.key,
        name: guest.name,
        description: guest.description || null,
        personality: guest.personality || null,
      })),
    ],
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
Audit intentCheck độc lập với lời tự mô tả của người viết. Tách các chi tiết người dùng yêu cầu rõ, nhất là diễn biến cuối hoặc câu/ý kết thúc. status=faithful chỉ khi thoại hoặc hành động THỰC SỰ diễn đủ chi tiết ấy; evidence phải trích nguyên văn từ bản diễn. Một hành động xảy ra sớm hơn, một kết tương tự hoặc outcome tự khai không được thay thế yêu cầu. Nếu người dùng không chỉ định kết cụ thể, kiểm tra chủ đề và quan hệ cốt lõi. Thiếu một nhịp bắt buộc thì needs_revision và không được ready_for_user.
Trước khi quyết định, phản biện bản này như một biên tập viên phải từ chối bài nhạt. weakestMoment trích một câu/action NGUYÊN VĂN ở line tương ứng và why nêu nguy cơ cụ thể khiến người xem chán; không dùng "cần nghe diễn viên" hay "không có điểm yếu" để né đánh giá bản chữ. formatOnly=true nếu toàn sức hút vẫn chỉ là trẻ đóng vai người lớn hoặc gọi đồ nhỏ bằng từ sang, chưa có quan sát/đối đáp/hành động riêng đáng xem; khi đó không được ready_for_user. Đừng mặc định đúng format là xuất sắc. Có thể nhận xét một câu yếu dù tổng thể vẫn đạt.
watchability.reason nêu căn cứ cụ thể, weakness nêu hạn chế còn lại. moments trích NGUYÊN VĂN đoạn thoại hoặc action, line là số lượt từ 1, kind=dialogue/action, why giải thích vì sao đoạn ấy thú vị hoặc phản ứng nào được tạo. ready_for_user cần ít nhất hai đoạn ở các lượt khác nhau (có thể là hành động/câu dẫn có tác dụng, không bắt hai punchline). Không chấp nhận lý do chỉ là đúng format/đảo vai. Câu trích của issues cũng phải có trong bản diễn.
Không có lỗi chưa đủ để ready_for_user. Chỉ trả quyết định này khi bản đáng gửi người dùng và không còn issue cần sửa. Đây không phải người dùng duyệt; server tự suy trạng thái từ quyết định và bằng chứng, không cần một cờ passed riêng.`;
}

/**
 * Step-by-step family writer/director. runStage performs exactly one Gemini
 * stage and mutates the serializable pipeline state; callers persist the
 * snapshot and resume from it. Never starts media.
 */
export class FamilyScriptDirector {
  private readonly profile: ChannelProfile;
  private readonly model: string;
  private readonly allowed: string[];
  private readonly context: CreativeContext;
  private readonly intent: string;
  private readonly writerContext: string;
  private state: FamilyScriptPipelineState;
  private repairs = 0;
  private providerFallbacks = 0;

  constructor(
    private readonly input: CreativeAssistInput,
    private readonly options: CreativeAssistOptions = {},
  ) {
    this.profile = input.context.channelProfile!;
    this.model = creativeAssistModel(input.kind, true);
    const guestIds = (input.guestCharacters || []).map((guest) => guest.key);
    this.allowed = [
      ...(input.selectedCharacterIds?.length
        ? input.selectedCharacterIds
        : input.context.characters.map((c) => c.id)),
      ...guestIds,
    ];
    this.context = {
      ...input.context,
      characters: [
        ...input.context.characters.filter((c) => this.allowed.includes(c.id)),
        ...(input.guestCharacters || []).map((guest) => ({
          id: guest.key,
          name: guest.name,
          description: guest.description || null,
          personality: guest.personality || null,
        })),
      ],
    };
    this.intent =
      input.intent || "Chọn một chuyện mới từ gia đình và 20 tập gần nhất.";
    // Let the writer explore with a short positive brief. The rejection benchmark
    // belongs to selection/review; feeding failed scripts to every stage anchors imitation.
    this.writerContext = `${contextText(this.context, this.allowed, false)}
BẠN LÀ BIÊN KỊCH GIA ĐÌNH, viết để diễn như đang nói chuyện, không viết lời giới thiệu ý tưởng. TONE do ý tưởng người dùng quyết định: hài tương phản/parody khi họ muốn vui, cinematic cảm động khi họ nêu ký ức, hoài niệm, xúc động hoặc tình cảm gia đình. Không tự bẻ một ý tưởng cảm động thành joke, cũng không làm tập hài thành bài học êm.
Tập hài: tìm một thói quen nhỏ rất thật: người đang vội vẫn nhờ thêm; khách hỏi chuyện vì chính họ tò mò; người khoe tự lộ điều mình coi là quan trọng. Đặt người lớn/trẻ con vào vai bị đảo, hoặc đặt quy mô trẻ con vào một format người lớn dễ nhận ra. Tập cảm động: bắt đầu từ một hành động/đạo cụ/ký ức cụ thể nhìn thấy được, để câu nói cuối có nguyên nhân; giữ cảm xúc tiết chế, không triết lý chung chung.
Hai người nghe nhau: câu vừa nghe hoặc việc vừa xảy ra cho họ điều cụ thể để hỏi, chống chế, đồng ý hay nhờ tiếp. Người hỏi có sự tò mò riêng, không chỉ "còn gì nữa?" để khách đọc danh sách. Câu kể được phép nếu tự cách kể bộc lộ tính cách; không bắt phải có tai nạn hay tranh cãi.
Mở ngay ở việc đang diễn ra. Chọn chi tiết dễ hình dung, khẩu ngữ có nhịp dài ngắn. Dừng đúng lúc quan hệ hoặc cái lệch vừa lộ rõ; không cần thông điệp, hình phạt hay câu chốt thông minh. Thoại trẻ diễn người lớn vẫn được tự tin, hiểu chuyện, xưng hô theo vai. Chỉ dùng cast đã chọn, giữ quan hệ, giới tính và vóc dáng.`;
    this.state = emptyFamilyScriptState();
  }

  get pipelineState(): FamilyScriptPipelineState {
    return this.state;
  }

  get done() {
    return this.state.completedStages.includes("shots");
  }

  get finalResult(): Extract<
    CreativeAssistResult,
    { kind: "video_plan" }
  > | null {
    return this.state.result || null;
  }

  restore(state: FamilyScriptPipelineState) {
    this.state = structuredClone(state);
    this.state.candidates = [...(state.candidates || [])];
    this.state.drafts = [...(state.drafts || [])];
    this.state.validationFailures = [...(state.validationFailures || [])];
    this.state.completedStages = [...(state.completedStages || [])];
  }

  snapshot(): FamilyScriptPipelineState {
    return structuredClone(this.state);
  }

  private trace(): FamilyDevelopmentTrace {
    return {
      benchmarkVersion: this.state.benchmarkVersion,
      stage: this.state.stage,
      candidates: this.state.candidates,
      drafts: this.state.drafts,
      ...(this.state.selection ? { selection: this.state.selection } : {}),
      ...(this.state.validationFailures?.length
        ? { validationFailures: this.state.validationFailures }
        : {}),
    };
  }

  private async checkpoint(stage: FamilyDevelopmentTrace["stage"]) {
    this.state.stage = stage;
    await this.options.onEditorialProgress?.(structuredClone(this.trace()));
  }

  private async checked<T>(
    prompt: string,
    validate: (v: unknown) => T,
    deadline: number,
    schema?: unknown,
    temperature = 0.5,
    models?: string[],
  ): Promise<T> {
    const modelList = models?.length ? models : [this.model];
    let modelIndex = 0;
    while (true) {
      let candidate: unknown;
      try {
        candidate = await generateJson(
          prompt,
          schema,
          modelList[modelIndex],
          deadline,
          temperature,
        );
        return validate(candidate);
      } catch (e) {
        // One fallback attempt on the paired model when the provider rejects
        // the request itself. Transport/link errors and malformed/soft-format
        // failures keep their existing strict behavior.
        if (isProviderArgumentError(e)) {
          this.state.validationFailures = recordFailure(
            this.state.validationFailures,
            {
              stage: this.state.stage,
              error: e instanceof Error ? e.message : "FAMILY_MODEL_REJECTED",
              response: null,
            },
          );
          await this.checkpoint(this.state.stage);
          if (
            modelIndex < modelList.length - 1 &&
            this.providerFallbacks++ < 1
          ) {
            modelIndex += 1;
            continue;
          }
          throw e;
        }
        if (candidate === undefined && !(e instanceof SyntaxError)) throw e;
        const error =
          e instanceof Error ? e.message : "FAMILY_RESPONSE_INVALID";
        this.state.validationFailures = recordFailure(
          this.state.validationFailures,
          { stage: this.state.stage, error, response: candidate ?? null },
        );
        await this.checkpoint(this.state.stage);
        if (this.repairs++ >= 1) throw e;
        prompt = `${prompt}\nSửa bản vừa trả, không thay đề tài: ${JSON.stringify(candidate)}\nLỗi cần sửa: ${repairHint(error)}`;
      }
    }
  }

  private declared(value: unknown) {
    const normalized = normalizeFamilyFatherTerms(unpackStory(value)) as Story;
    const guests = normalizeStoryGuests(
      (normalized as { guests?: unknown }).guests,
    );
    const story = { ...normalized, guests };
    assertDeclaredGuests(story);
    return {
      story,
      guests,
      allowedIds: [...this.allowed, ...guests.map((guest) => guest.key)],
    };
  }

  private validateStoryValue(value: unknown) {
    const { story } = this.declared(value);
    return validateGeneratedFamilyStory(
      story,
      this.profile,
      [...this.allowed, ...(story.guests || []).map((guest) => guest.key)],
      this.context.recentStories,
    );
  }

  /** Runs exactly one pipeline stage within its own deadline. */
  async runStage(stage: FamilyScriptStageKind, deadlineMs: number) {
    if (this.state.completedStages.includes(stage)) return;
    this.providerFallbacks = 0;
    if (stage === "premises") {
      this.state.candidates = await this.checked(
        `${this.writerContext}
Ý TƯỞNG NGƯỜI DÙNG: ${this.intent}
Đề xuất ĐÚNG BA tình huống A/B/C trước khi viết kịch bản. Nếu đã có đề tài/format, cả ba giữ đề tài ấy nhưng phát triển bằng hành vi và quan hệ KHÁC NHAU; nếu để trống, chọn ba hướng khác nhau.
Mỗi phương án gồm situation, familiarPattern (thường thức/format được nhận ra), observedBehavior (hành vi cụ thể đời thường), progression (2–4 việc/câu đáp làm tình huống tiếp diễn), stopPoint (đúng khoảnh khắc nên cắt, không bắt giải quyết hậu quả), risk (vì sao có thể nhạt), sampleExchange (2–4 lượt thoại cùng hành động, đúng cast).
Viết mẫu đối đáp thật để so sánh, không chỉ nhãn hài. Trước hết tìm thói quen nhỏ của con người (cách nhờ, hỏi vặn, giữ thể diện, chen nhu cầu), rồi đặt vào tình huống; đừng bắt đầu bằng danh sách thuật ngữ để đổi tên đồ chơi. Mẫu trao đổi phải cho thấy nét riêng của hai người đang nói. Mỗi progression phát triển cái vừa xảy ra/được kể, không chỉ chuyển sang tiện ích/chủ đề kế tiếp. Quan sát ý muốn, thói quen và cách nhân vật phản ứng trước người kia. Các phương án khác nhau về cách chuyện diễn ra, không chỉ thay đồ vật. Không chọn sẵn phương án thắng. Mỗi trường mô tả ngắn gọn, sampleExchange mỗi câu tối đa 25 từ.`,
        (v) => validatePremises(v, this.allowed),
        deadlineMs,
        premiseSchema(this.allowed),
        0.9,
        familyStageModels("premises"),
      );
      await this.checkpoint("selection");
      this.state.completedStages.push("premises");
      return;
    }
    if (stage === "selection") {
      if (this.state.candidates.length !== 3)
        throw new Error("FAMILY_PREMISES_MISSING");
      this.state.selection = await this.checked(
        `${this.writerContext}
${FAMILY_EDITORIAL_BENCHMARK}
Ý TƯỞNG PHẢI GIỮ: ${this.intent}
Đây là ba phương án của một người viết khác: ${JSON.stringify(this.state.candidates)}
So sánh thực sự observedBehavior/progression/sampleExchange của cả ba. Tập hài cần lý do để xem tiếp ngoài hình bé + vai người lớn. Tập cảm động cần một emotionalCause nhìn thấy được trước câu kết: ai làm gì, thấy gì hoặc nhớ gì khiến quan hệ thay đổi? Phần nào chỉ lặp, kể lại, đổi tên đồ vật hoặc câu kết thêm cho có?
Đánh giá từng A/B/C bằng develop hoặc reject, strongestDetail trích NGUYÊN VĂN một đoạn trong hành vi/diễn biến/kết/thoại của đúng phương án, weakness và reason cụ thể. Không tự chấm đạt vì đúng cơ chế. Loại phương án chỉ liệt kê ba ví dụ của tiền đề (gối=nhập khẩu, bánh=kho năng lượng, trùm chăn=bảo mật); nếu đổi thứ tự các câu mà không mất gì thì cần xem xét kỹ khả năng chỉ là danh mục. Câu dẫn bình thường vẫn được; đánh giá toàn cuộc tương tác và chi tiết về con người, không đếm thuật ngữ/punchline. selectedId chọn phương án develop mạnh nhất và reason phải giải thích vì sao hơn các phương án khác. Nếu cả ba nhạt thì selectedId=null; không bắt chọn phương án ít dở nhất. Không đề xuất thay đề tài người dùng.`,
        (v) => validateSelection(v, this.state.candidates),
        deadlineMs,
        selectionSchema,
        undefined,
        familyStageModels("selection"),
      );
      await this.checkpoint("draft");
      this.state.completedStages.push("selection");
      return;
    }
    if (stage === "draft") {
      const selected = this.state.candidates.find(
        (c) => c.id === this.state.selection?.selectedId,
      );
      if (!selected) throw new Error("FAMILY_PREMISES_NEED_REVIEW");
      this.state.story = await this.checked(
        `${this.writerContext}
Ý TƯỞNG PHẢI GIỮ: ${this.intent}
TÌNH HUỐNG ĐÃ CHỌN: ${JSON.stringify(selected)}
NHẬN XÉT SO SÁNH: ${JSON.stringify(this.state.selection)}
Viết bản đầy đủ bằng tiếng Việt, khai thác hành vi/quan hệ cụ thể đã chọn. Với tập parody, action phải cho thấy nhân vật dùng đạo cụ nhận diện của chính format đó trong suốt nghi thức; không để hoạt động trẻ con không liên quan thay chỗ format. Với tập cảm động, không ép đảo vai/parody/joke; emotionalCause (như nhìn bóng lưng, thấy kỷ vật) phải nằm trong action của một lượt TRƯỚC lời nói cuối, không gộp vào chính câu kết. Phim chỉ nối bằng hard cut: chuyển cảnh hoặc vào hồi ức bằng hard cut/match cut, không dissolve/fade. Giữ các câu phản ứng có tác dụng, không bắt mỗi câu là một trò đùa. Khác biệt hai bé phải thể hiện qua cách xử lý/đối đáp, không chỉ đổi tên người nói.
Chọn performanceLane đúng một trong: ${PERFORMANCE_LANES.join(", ")}. Mô tả lane bằng hành động trong thoại/action; không tự khen bản thân là hài.
Thời lượng ${this.input.targetDurationSeconds || 35} giây chỉ là mục tiêu gần đúng. Hoàn tất trọn diễn biến và kết thúc người dùng yêu cầu trước; nếu câu chuyện tự nhiên cần dài hơn thì viết thêm lượt đến đúng điểm kết, nếu xong sớm thì dừng, tuyệt đối không cắt mất kết hoặc kéo lời để chạm mốc. Tổng 15–120 đơn vị lời thoại, mỗi lượt tối đa 35; tối đa 12 lượt kể cả reaction. Có thể không có reaction nếu đã đủ điểm dừng. Viết tình huống đang diễn ra, lời kể chỉ khi format cần và cách kể tự có sức hút.
Nhân vật: chỉ dùng cast đã chọn. Nếu câu chuyện thật sự cần một người ngoài gia đình (trên máy bay, hàng xóm đến gõ cửa, người kiểm định…), được thêm TỐI ĐA MỘT nhân vật khách mời một tập trong mục guests: key guest-1, name ngắn, description tả rõ ngoại hình/trang phục đủ để dựng ảnh nhận diện, personality. Dùng đúng key guest-1 cho thoại và wants của người đó. Không khai khách mời nếu không cần thiết; không tự sáng chế nhân vật khác.
endingPlan.mode chọn hard_cut, silent_reaction hoặc resolved. stopAfterLine bắt buộc bằng đúng số lượt thoại; anchorQuote trích nguyên văn từ thoại/action lượt cuối; reason nói vì sao phép đảo/quan hệ hạ đúng ở đó. payoff và beats.payoff là mô tả điểm dừng để tương thích dữ liệu, KHÔNG phải yêu cầu punchline. Nếu dùng silent_reaction thì beats.reaction mô tả phản ứng không thoại; hai mode còn lại để reaction rỗng. Trước khi trả, thử xóa lần lượt các câu cuối: cắt mọi câu không làm mất điểm rơi. Không thêm câu mở vấn đề mới sau khi chuyện đã hạ, không nối câu đùa thứ hai để “finish”. Trước khi trả, đọc từng câu từ góc nhìn người đang nói: hai chị em nói với nhau dùng chị/em, “chị em mình/tụi mình”; nói với bố mẹ dùng “tụi con”; không để một bé tự gọi cả hai là “hai đứa”.
comicPremise: với tập hài ghi thường thức/format gốc, điều bị đảo/lệch và tín hiệu nhìn/nghe thấy; với tập cảm động ghi khoảnh khắc bình thường, emotionalCause và chi tiết nhìn thấy được dẫn tới cảm xúc. Phần thoại/action phải tự thể hiện, không dựa vào lời tác giả tự khen. Không thêm người ngoài cast, không ép parody thành việc chăm bố mẹ hoặc tập cảm động thành joke.
Trả JSON: ${STORY_SCHEMA}`,
        (v) => this.validateStoryValue(v),
        deadlineMs,
        storyResponseSchema(this.profile, this.allowed),
        0.8,
        familyStageModels("draft"),
      );
      this.state.draftVersion += 1;
      await this.checkpoint("review");
      this.state.completedStages.push("draft");
      return;
    }
    if (stage === "review") {
      if (!this.state.story) throw new Error("FAMILY_DRAFT_MISSING");
      let review;
      for (let attempt = this.state.reviewCount; attempt < 2; attempt++) {
        const story: Story = this.state.story!;
        if (this.state.drafts.length <= attempt)
          this.state.drafts.push({
            dialogue: story.dialogue,
            setup: story.setup,
            payoff: story.payoff,
            endingPlan: story.endingPlan,
          });
        await this.checkpoint("review");
        // Read the staged dialogue without the writer's self-justification or selection verdict.
        review = await this.checked(
          buildFamilyEditorialPrompt(
            { ...this.input, guestCharacters: story.guests || [] },
            story,
          ),
          (v) => validateEditorialReview(v, story),
          deadlineMs,
          editorialReviewSchema,
          undefined,
          familyStageModels("review"),
        );
        this.state.drafts[this.state.drafts.length - 1].review = review;
        await this.checkpoint("review");
        if (review.passed) {
          this.state.reviewCount = attempt;
          this.state.reviewPassed = true;
          await this.checkpoint("shots");
          this.state.completedStages.push("review");
          return;
        }
        if (review.watchability.decision === "reject" || attempt === 1)
          throw new Error("FAMILY_EDITORIAL_NEEDS_REVIEW");
        this.state.story = await this.checked(
          `${this.writerContext}
Ý TƯỞNG PHẢI GIỮ: ${this.intent}
BẢN CHỮ: ${JSON.stringify(this.state.story)}
NHẬN XÉT BẮT BUỘC SỬA: ${JSON.stringify(review)}
Sửa một lượt theo lý do cụ thể, giữ đoạn đang có sức sống. Nếu intentCheck=needs_revision, khôi phục đầy đủ chi tiết/điểm kết người dùng đã yêu cầu và cho nó diễn ra trong thoại hoặc hành động; không thay bằng một kết gần giống xảy ra sớm hơn. Nếu endingCheck=forced_tail, cắt từ sau lastNecessaryLine rồi cập nhật endingPlan; không thay đuôi thừa bằng một câu chốt mới. Nếu unfinished, phát triển đúng việc đang diễn trước khi chọn điểm cắt. Nếu speechCheck=needs_revision, sửa đúng ngôi nói/khẩu ngữ ở câu được trích và rà cùng lỗi trong các câu khác; không đổi diễn biến chỉ để chữa đại từ. Không thêm câu chốt thông minh để che tiền đề yếu, không rút tất cả thoại thành câu cụt. Giữ nguyên đề tài, cast khách mời, và format. Trả toàn bộ JSON: ${STORY_SCHEMA}`,
          (v) => this.validateStoryValue(v),
          deadlineMs,
          storyResponseSchema(this.profile, this.allowed),
          undefined,
          familyStageModels("draft"),
        );
        this.state.draftVersion += 1;
        this.state.reviewCount = attempt + 1;
        await this.checkpoint("review");
      }
      throw new Error("FAMILY_EDITORIAL_NEEDS_REVIEW");
    }
    // shots
    const story: Story | undefined = this.state.story;
    if (!story) throw new Error("FAMILY_DRAFT_MISSING");
    if (!this.state.reviewPassed) throw new Error("FAMILY_REVIEW_MISSING");
    const hasReaction = storyHasReaction(story);
    const shotCount = storyShotCount(story);
    const maxVideoDuration = this.input.maxVideoDurationSeconds || 30;
    const groups = storyboardGroups(story.dialogue, hasReaction, maxVideoDuration);
    const storyGuests = story.guests || [];
    const shotAllowed = [...this.allowed, ...storyGuests.map((guest) => guest.key)];
    const shotContext: CreativeContext = {
      ...this.context,
      characters: [
        ...this.context.characters,
        ...storyGuests.map((guest) => ({
          id: guest.key,
          name: guest.name,
          description: guest.description,
          personality: guest.personality || null,
        })),
      ],
    };
    const result = await this.checked(
      `${contextText(shotContext, shotAllowed)}
CÂU CHUYỆN ĐÃ SOẠN: ${JSON.stringify(story)}
${FILM_INTERACTION_POLICY}
LỚP ĐẠO DIỄN BIỂU CẢM: lane=${story.performanceLane || "deadpan_reversal"}. Mỗi panel phải trả performanceDirection với comicObjective, statusBefore/statusAfter, hook, tối thiểu hai beat hành động vật lý, reactionTarget cụ thể và revealOrCut. Hai beat có thể là hai pha của CÙNG hành động hoặc hành động chính và phản ứng đồng thời của người nghe; không bắt mỗi câu có hai trò, hai góc máy hoặc một cú lật. Dùng hành vi nhìn thấy được; không dùng riêng các nhãn “tự nhiên”, “nghiêm túc”, “ngây thơ”, “đáng yêu”, “gật đầu”, “nhìn ngơ”.
DỰNG STORYBOARD: chia thành ${groups.length} clip nguồn. Server tự chọn duration nguyên 4–${maxVideoDuration} giây cho từng request Seedance từ lượng thoại và hành động; phim cuối tiếp tục cắt ở đúng contentEndSeconds. Các nhịp thoại/panel được nhóm sẵn (chỉ số từ 1): ${JSON.stringify(groups.map((g) => g.map((i) => i + 1)))}. Mỗi panel là một nhịp bên trong đoạn, KHÔNG phải một job video riêng. GIỮ NGUYÊN câu thoại, thứ tự và người nói. Không thêm lời. durationSeconds ở panel chỉ là nhịp diễn dự kiến; server xếp timeline đủ cho lời và hành động, không kéo giãn theo mốc cố định.
Trong cùng đoạn: cùng bối cảnh, ánh sáng, vị trí nhân vật, hướng nhìn và trục máy. Có thể pan theo người nói hoặc cắt đối đáp theo storyboard; không đổi cảnh ngẫu nhiên. Hành động bắt đầu ngay, người nghe phản ứng trong khi người kia nói, không đứng đợi tới lượt. Viết motionPrompt cho từng nhịp bằng hành động cụ thể, KHÔNG thêm mốc giây riêng; server gắn mốc liên tục theo lượng thoại và hành động. Chỉ một người nói tại mỗi thời điểm, đến nhịp sau mới đổi người. Không slow motion, kéo dài âm tiết, khoảng chờ mở đầu hoặc lặp động tác để đủ thời lượng.
Trước khi mô tả ảnh, hãy hiểu logic thị giác riêng của tập và trả visualDirection ở cấp toàn phim: storyMechanism, audienceMustSee, và characterKnowledge cho từng người gồm họ biết gì và chi tiết nào chưa được lộ trước thời điểm nào. Xác định điều gì gây lệch/hài, khán giả phải thấy gì và ở thời điểm nào, đạo cụ/hành động nào quyết định câu chuyện. Không bê checklist tiền, cặp hay micro sang tập khác. Mỗi panel phải có visualRequirements và referenceImages. visualRequirements chỉ liệt kê bằng chứng thật sự cần nhìn thấy (với lane adult_format_parody, đạo cụ nhận diện format của chính tập này là critical); dùng kind=count/text và legibility=countable/readable khi số lượng hoặc chữ/số là dữ kiện của câu chuyện. Mỗi critical requirement phải được ít nhất một reference image bao phủ. referenceImages là các ảnh riêng độ phân giải đầy đủ đưa cùng nhau vào reference_images của Seedance; role=scene cho bố cục/trạng thái, character cho nhận diện, prop cho vật thể quyết định, environment cho bối cảnh. Không tạo first/last-frame contract và không dùng grid/storyboard sheet làm input video. Chỉ đặt requiresOwnSource=true khi góc nhìn, trạng thái hoặc nhịp diễn khác đến mức không nên nằm chung một clip liên tục.
Panel đầu mỗi đoạn là một khung sạch có đủ người sẽ xuất hiện trong đoạn đó; đủ ảnh chuẩn từng người, đúng tỷ lệ, trang phục và vị trí. Mỗi panel phải có openingState, closingState và props. Mỗi đạo cụ có id ổn định xuyên các panel, tên, màu, kích thước, dấu hiệu, số lượng, người cầm và vị trí; cùng vật không được tự đổi màu/kích thước hay nhân bản. Chữ/số thật trên đạo cụ được yêu cầu bởi câu chuyện phải được giữ; chỉ cấm phụ đề, nhãn giao diện, mũi tên và chữ trang trí do model tự thêm. closingState của panel trước phải khớp openingState của panel sau, kể cả người đã rời khung. Trang phục, giày dép và trạng thái đạo cụ giữ nguyên qua các panel, chỉ đổi khi có hành động nhìn thấy được làm đổi. Các panel sau mô tả diễn tiến hành động/camera. Kết đoạn có tư thế, đạo cụ và hướng nhìn khớp đầu đoạn tiếp; giữ trục đối thoại để nối bằng hard cut. Không cố thêm reaction sau điểm dừng đã chọn. Với parody giữ tín hiệu nhận diện format.
Chỉ trả title, summary, visualDirection và shots là mảng đúng ${shotCount} panel theo thứ tự (phần tử 1 là shot1). Mỗi panel có action, setting, camera, durationSeconds, imagePrompt, motionPrompt và listenerCharacterIds. shot1..shot${story.dialogue.length} tương ứng các lượt thoại; ${hasReaction ? "panel cuối phản ứng im lặng đã có trong story" : "không thêm panel kết"}. imagePrompt tối đa 300 ký tự, motionPrompt tối đa 600. Không viết lại dialogue/speaker. ${this.input.targetDurationSeconds || 35} giây là mục tiêu kể chuyện, không phải độ dài bắt buộc; mỗi clip nguồn dùng đúng số giây cần thiết trong khoảng 4–${maxVideoDuration} và được cắt theo nội dung/transcript thật, không bịa transcript.`,
      (v) => {
        const r = validateCreativeAssist(
          "video_plan",
          compileStoryboards(v, story, shotContext.characters, maxVideoDuration),
          shotContext,
          this.input.targetDurationSeconds || 35,
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
      deadlineMs,
      shotResponseSchema(story, shotAllowed),
      undefined,
      familyStageModels("shots"),
    );
    await this.checkpoint("complete");
    const finalStory: Story = {
      ...story,
      writingPolicyVersion: FAMILY_WRITING_POLICY_VERSION,
      editorialEvidence: (() => {
        const last = this.state.drafts.at(-1)?.review;
        return (last as { evidence?: Record<string, string> } | undefined)
          ?.evidence;
      })(),
      development: this.trace(),
      intendedShotSeconds: result.scenes.map(
        (s) => s.intendedDurationSeconds || s.durationSeconds,
      ),
    };
    this.state.result = {
      ...result,
      guests: storyGuests,
      story: finalStory,
      caption: story.caption,
    };
    this.state.completedStages.push("shots");
  }

  /** One-shot driver for interactive use: runs every remaining stage in order. */
  async runAll(deadlineMs: number) {
    for (const stage of FAMILY_SCRIPT_STAGES) {
      if (this.state.completedStages.includes(stage)) continue;
      await this.runStage(stage, Math.min(deadlineMs, Date.now() + 90000));
    }
    if (!this.state.result) throw new Error("FAMILY_PLAN_INVALID");
    return this.state.result;
  }
}
