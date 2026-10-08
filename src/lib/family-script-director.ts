import {
  FILM_FORMATS,
  FILM_FORMAT_MENU,
  COMEDY_CRAFT_RULES,
  FORMAT_TARGET_SECONDS,
  FORMAT_WRITING_RULES,
  cameraPresetMenu,
  filmFormat,
  filmFormatFromIntent,
  formatAddressesCamera,
  formatAllowsLocationCuts,
} from "./film-camera-language";
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
  normalizeShotResponse,
  storyHasReaction,
  storySlice,
} from "./family-ai-contract";
import {
  validateGeneratedFamilyStory,
  normalizeStoryGuests,
  assertDeclaredGuests,
  storyContractForGenre,
  type ChannelProfile,
  type Story,
} from "./family-catalogue";
import { storyGenreFromIntent, stripStoryGenreMarker } from "./story-genre";
import {
  FAMILY_EDITORIAL_BENCHMARK,
  FAMILY_BENCHMARK_VERSION,
  premiseSchema,
  selectionSchema,
  episodeBriefSchema,
  editorialReviewSchema,
  validatePremises,
  validateSelection,
  validateEpisodeBrief,
  validateEditorialReview,
  compactDevelopmentTrace,
  type EpisodeBrief,
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
  episodeBrief?: EpisodeBrief;
  briefPolicyVersion?: string;
  reviewedWithBenchmarkVersion?: string;
  drafts: FamilyDevelopmentTrace["drafts"];
  validationFailures?: FamilyDevelopmentTrace["validationFailures"];
  story?: Story;
  draftVersion: number;
  reviewCount: number;
  reviewPassed?: boolean;
  result?: Extract<CreativeAssistResult, { kind: "video_plan" }>;
  /** Kết quả đã kiểm của từng đoạn storyboard; null là đoạn chưa dựng. */
  shotChunks?: (Record<string, unknown> | null)[];
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

/** Số panel tối đa trong một lượt gọi dựng storyboard. */
export const SHOT_CHUNK_PANELS = 4;

/**
 * Chia các đoạn clip (storyboardGroups) thành từng lượt gọi: gộp đoạn liền nhau
 * tới SHOT_CHUNK_PANELS panel. Một đoạn clip dài hơn vẫn đi riêng một lượt,
 * vì đoạn clip là đơn vị kiểm tra storyboard.
 */
export function shotChunkGroups(
  story: Story,
  maxVideoDurationSeconds = 30,
): number[][] {
  const chunks: number[][] = [];
  for (const group of storyboardGroups(
    story.dialogue,
    storyHasReaction(story),
    maxVideoDurationSeconds,
    story.performanceLane,
  )) {
    const last = chunks.at(-1);
    if (last && last.length + group.length <= SHOT_CHUNK_PANELS)
      last.push(...group);
    else chunks.push([...group]);
  }
  return chunks;
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
  FAMILY_EPISODE_BRIEF_INVALID:
    "Hồ sơ cần actualSituation, 2–4 nhân vật dùng đúng ID với want/knows/relationship/addressing, requiredElements và đủ bốn trường storyPayoff. Không viết thoại ở bước này.",
  STORY_STRUCTURE_INVALID:
    "Thiếu hoặc bỏ trống một trong các trường bắt buộc: series (phải nằm đúng danh sách đã cho), situation, mechanism, outcome, payoff, setup, caption. Điền đủ, mỗi trường trên 3 ký tự.",
  STORY_WANTS_INVALID:
    "Cần tối thiểu hai mục wants, mỗi mục dùng đúng một characterId trong danh sách được phép và nêu điều nhân vật đó muốn.",
  STORY_DIALOGUE_INVALID:
    "Mỗi lượt cần characterId hợp lệ, text (có thể rỗng cho nhịp không lời) và action; tổng số lượt trong giới hạn kỹ thuật 3 đến 24.",
  STORY_DIALOGUE_LINE_TOO_LONG:
    "Có lượt thoại vượt trần kỹ thuật. Rút gọn ý nói hoặc chuyển phần nhìn thấy được sang action; không tự chia thành hai người nói.",
  STORY_COMIC_PREMISE_REQUIRED:
    "Thiếu comicPremise. Ghi rõ normalExpectation, invertedReality và visibleContrast.",
  STORY_COMIC_PREMISE_INVALID:
    "comicPremise cần cả ba trường, mỗi trường từ 8 ký tự trở lên và dưới 1000.",
  STORY_ENDING_REQUIRED:
    "Thiếu endingPlan. Chọn mode, đặt stopAfterLine bằng đúng số lượt thoại, trích anchorQuote nguyên văn từ lượt cuối và nêu lý do dừng ở đó.",
  STORY_PERFORMANCE_LANE_INVALID:
    "performanceLane phải là đúng một giá trị trong danh sách lane đã cho.",
  STORY_FILM_FORMAT_INVALID:
    "filmFormat phải là đúng một trong family_scene, talk_to_camera, cooking_show, phone_vlog.",
  STORY_WARDROBE_INVALID:
    "wardrobe chỉ dùng characterId có trong danh sách, mỗi người tối đa một mục, outfit tả cụ thể 6–300 ký tự; tập không cần đồ riêng thì để mảng rỗng.",
  STORY_FILM_FORMAT_GENRE:
    "Tập cảm động chỉ dùng filmFormat family_scene hoặc phone_vlog; đổi định dạng, giữ nguyên câu chuyện.",
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
  FAMILY_PREMISES_DOMAIN_NARROW:
    "Khi người dùng chưa chọn đề tài, ba phương án phải thuộc ba socialDomain khác nhau và ít nhất hai phương án phải ở ngoài family_home.",
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
    stripStoryGenreMarker(input.intent) ||
    "Chọn một chuyện đời sống Việt Nam mới, có thể ở gia đình, trường học, nơi công cộng, khu phố, cửa hàng hoặc công việc của bố mẹ.";
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
Audit khẩu ngữ độc lập theo đúng characterId, tên và người họ đang nói cùng. speechCheck trích một lượt đáng kiểm tra nhất. status=needs_revision nếu đại từ sai góc nhìn/quan hệ, câu giống dịch, tác giả kể hộ nhân vật, hoặc một ý tự nhiên bị bẻ thành các mẩu cụt chỉ để mỗi lượt ít từ; khi đó không được ready_for_user. Đọc liền từng cặp: câu sau phải giữ đúng người, việc, thời điểm, điều kiện và mức độ vừa nghe; có thể đồng ý, né, giữ lễ, nhắc khéo hoặc tiếp tục hành động, không bắt phải phản đòn. Không tự thêm “ủa”, “thì”, “chứ” để giả khẩu ngữ và không chê câu trên 8 từ nếu vẫn nói vừa 8 giây. Ví dụ Đậu Đỏ nói với Bánh Bao phải dùng “chị em mình/tụi mình”, không tự gọi cả hai là “hai đứa”; nói với bố mẹ mới dùng “tụi con”. status=natural chỉ khi toàn bộ thoại qua kiểm tra này; reason phải giải thích bằng ngữ cảnh người nói/người nghe.
Với đối nhân xử thế, audit tính dùng được trong đúng quan hệ xã hội. Câu nói với cô giáo, người lớn tuổi, người lạ hoặc đồng nghiệp của Bố/Mẹ phải có đại từ và mức trực diện hợp cảnh. Không tự cho điểm vì câu “gắt”. Nếu mọi đáp án đều nhằm hạ nhục/làm người kia cứng họng, nếu dùng câu mạng quen thay quan sát riêng, hoặc nếu trẻ suy ra cảm giác/động cơ/dữ kiện người lớn chưa kể, phải revise hoặc reject. Format Bố/Mẹ kể chuyện người khác đạt khi câu dẫn nêu đủ câu gốc và trẻ bám đúng chữ/tiền đề ấy; không cần cho người vắng mặt xuất hiện.
Audit intentCheck độc lập với lời tự mô tả của người viết. Tách các chi tiết người dùng yêu cầu rõ, nhất là diễn biến cuối hoặc câu/ý kết thúc. Tách mỗi cảnh trong ý tưởng thành từng hành động và từng câu nói riêng (một cảnh có thể chứa nhiều ý: "Đậu Đỏ hỏi Bố sao vậy; Bố bảo cát bay vào mắt" là hai câu nói). Câu nói phải trích được từ text của đúng người nói, trích action không chứng minh được một câu nói. Liệt kê từng cảnh/hành động/câu nói cụ thể trong ý tưởng (ví dụ cõng con đi dọc biển, hồi tưởng, "bảo là cát bay vào mắt") và kiểm tra mỗi cái có lượt riêng; một cảnh chỉ được nhắc lướt trong setup hoặc action của lượt khác là THIẾU. Lượt text rỗng là nhịp không lời hợp lệ, không phải lỗi thoại. evidence viết đúng dạng: Cảnh 1: "trích nguyên văn thoại hoặc action"; Cảnh 2: "…" — mỗi cảnh một câu trích trong ngoặc kép, chép y nguyên từ bản diễn, không tóm tắt. Cảnh nào không tìm được câu nguyên văn chứng minh thì cảnh đó thiếu: status=needs_revision và evidence ghi Cảnh N: "thiếu". status=faithful chỉ khi thoại hoặc hành động THỰC SỰ diễn đủ chi tiết ấy; evidence phải trích nguyên văn từ bản diễn. Một hành động xảy ra sớm hơn, một kết tương tự hoặc outcome tự khai không được thay thế yêu cầu. Nếu người dùng không chỉ định kết cụ thể, kiểm tra chủ đề và quan hệ cốt lõi. Thiếu một nhịp bắt buộc thì needs_revision và không được ready_for_user.
Tự tìm payoffCheck chỉ từ BẢN DIỄN, không dùng setup/payoff tự khai của người viết và không được xem hồ sơ phát triển tập. Chọn setupTurn là lượt gieo dữ kiện cụ thể và payoffTurn muộn hơn là lượt khiến khán giả hiểu lại chính dữ kiện ấy; ghi đúng dialogue/action và trích nguyên văn ở mỗi lượt. status=grounded chỉ khi explanation chỉ rõ dữ kiện trước thay đổi ý nghĩa lượt sau thế nào và shareReason nêu trải nghiệm cụ thể khiến một nhóm khán giả nhận ra mình hoặc muốn gửi cho ai. status=needs_revision nếu hai lượt chỉ cùng chủ đề, đoạn cuối bịa dữ kiện mới, bóp méo lời trước, dùng câu hỏi ngớ ngẩn để nhân vật giảng đạo, hoặc nhân vật giải thích thông điệp sau khi khán giả đã hiểu. Vẫn trích hai lượt gần nhất cho thấy chỗ nối đang hỏng. Không bắt mọi tập có bài học: ở tập hài, payoff có thể chỉ làm lộ cái vô lý hoặc quan hệ.
Đọc riêng bốn lượt cuối. Kiểm tra mỗi câu còn lý do tự nhiên để nói không, có ai bỗng ngớ ngẩn/xuống giọng/nhận thua không, khán giả đã hiểu mà nhân vật vẫn giải thích không, và một trở ngại mới có được thêm chỉ để kê câu cuối không. Ví dụ “Sao tối nay lại hết được?” là câu hỏi giả khi người lớn đương nhiên hiểu ngày hôm nay sẽ qua; “nhưng hết chỗ rồi bố” là trở ngại mới sau khi Bố đã gập máy; “Gấu bông bảo nó bận kiếm tiền” là punchline cần giải mã thay vì hành động tự mang nghĩa.
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
  private readonly userDirected: boolean;
  private readonly writerContext: string;
  private state: FamilyScriptPipelineState;
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
    this.userDirected = Boolean(stripStoryGenreMarker(input.intent).trim());
    this.intent =
      stripStoryGenreMarker(input.intent) ||
      "Chọn một chuyện đời sống Việt Nam mới, ưu tiên domain chưa xuất hiện gần đây thay vì mặc định quay về việc nhà.";
    // Let the writer explore with a short positive brief. The rejection benchmark
    // belongs to selection/review; feeding failed scripts to every stage anchors imitation.
    this.writerContext = `${contextText(this.context, this.allowed, false)}
BẠN LÀ BIÊN KỊCH SHORT-FORM ĐỜI SỐNG VIỆT NAM, viết để diễn như đang nói chuyện, không viết lời giới thiệu ý tưởng. Gia đình là một domain, không phải toàn bộ thế giới. Cô giáo, bạn học, phụ huynh, người lạ, hàng xóm, người bán hàng, họ hàng và đồng nghiệp/khách hàng/sếp của bố mẹ đều là nguồn tình huống hợp lệ. TONE do ý tưởng người dùng quyết định: hài tương phản/parody hoặc đối nhân xử thế khi họ muốn vui, cinematic cảm động khi họ nêu ký ức, hoài niệm hoặc xúc động. Không tự bẻ một ý tưởng cảm động thành joke, cũng không làm tập hài thành bài học êm.
Tập hài: tìm một thói quen nhỏ rất thật: người đang vội vẫn nhờ thêm; khách hỏi chuyện vì chính họ tò mò; người khoe tự lộ điều mình coi là quan trọng; người nói “ai cũng làm được” nhưng vẫn phải nhờ đúng một người. Đặt người lớn/trẻ con vào vai bị đảo, đặt quy mô trẻ con vào một format người lớn dễ nhận ra, hoặc dựng một cuộc đối đáp trong đó người sau nghe đúng ý rồi trả lời, hỏi rõ, né, giữ lễ, đỡ lời hay nhắc khéo theo động cơ của họ. Tập cảm động: bắt đầu từ một hành động/đạo cụ/ký ức cụ thể nhìn thấy được, để câu nói cuối có nguyên nhân; giữ cảm xúc tiết chế, không triết lý chung chung.
Hai người nghe nhau: câu vừa nghe hoặc việc vừa xảy ra cho họ điều cụ thể để hỏi, chống chế, đồng ý hay nhờ tiếp. Người hỏi có sự tò mò riêng, không chỉ "còn gì nữa?" để khách đọc danh sách. Câu kể được phép nếu tự cách kể bộc lộ tính cách; không bắt phải có tai nạn hay tranh cãi.
Mở ngay ở việc đang diễn ra hoặc câu người lớn đang xin trẻ góp ý. Chọn chi tiết dễ hình dung, khẩu ngữ có nhịp dài ngắn. Dừng đúng lúc quan hệ hoặc cái lệch vừa lộ rõ; không cần thông điệp, hình phạt hay câu chốt thông minh. Thoại trẻ diễn người lớn vẫn được tự tin, hiểu chuyện, xưng hô theo vai. Chỉ dùng cast đã chọn và tối đa một khách mời cần thiết, giữ quan hệ, giới tính và vóc dáng.`;
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
    // A saved draft remains readable. If it has not reached media planning yet,
    // make it pass the current evidence-based editor before any new storyboard
    // work. Finished results are historical artifacts and stay untouched.
    if (
      !this.state.result &&
      this.state.story &&
      this.state.completedStages.includes("review") &&
      this.state.reviewedWithBenchmarkVersion !== FAMILY_BENCHMARK_VERSION
    ) {
      this.state.completedStages = this.state.completedStages.filter(
        (item) => item !== "review" && item !== "shots",
      );
      this.state.reviewCount = 0;
      this.state.reviewPassed = false;
      this.state.stage = "review";
      this.state.benchmarkVersion = FAMILY_BENCHMARK_VERSION;
    }
  }

  /** Production may hold an older database stage while restore has moved an
   * old draft back to the current editorial gate. */
  requiredStage(requested: FamilyScriptStageKind): FamilyScriptStageKind {
    return this.state.story &&
      !this.state.result &&
      this.state.reviewedWithBenchmarkVersion !== FAMILY_BENCHMARK_VERSION &&
      (requested === "review" || requested === "shots")
      ? "review"
      : requested;
  }

  snapshot(): FamilyScriptPipelineState {
    return structuredClone(this.state);
  }

  private trace(): FamilyDevelopmentTrace {
    const writingPolicyVersion =
      this.state.briefPolicyVersion || this.state.story?.writingPolicyVersion;
    return {
      benchmarkVersion: this.state.benchmarkVersion,
      ...(writingPolicyVersion ? { writingPolicyVersion } : {}),
      ...(this.state.reviewedWithBenchmarkVersion
        ? {
            reviewedWithBenchmarkVersion:
              this.state.reviewedWithBenchmarkVersion,
          }
        : {}),
      stage: this.state.stage,
      candidates: this.state.candidates,
      drafts: this.state.drafts,
      ...(this.state.selection ? { selection: this.state.selection } : {}),
      ...(this.state.episodeBrief
        ? { episodeBrief: this.state.episodeBrief }
        : {}),
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
    // Mỗi lời gọi có một lượt sửa riêng. Ngân sách chung cả pipeline từng khiến
    // bước shots không còn lượt sửa nào khi bản chữ đã dùng mất lượt duy nhất.
    let repairs = 0;
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
        if (repairs++ >= 1) throw e;
        prompt = `${prompt}\nSửa bản vừa trả, không thay đề tài: ${JSON.stringify(candidate)}\nLỗi cần sửa: ${repairHint(error)}`;
      }
    }
  }

  private declared(value: unknown) {
    const normalized = normalizeFamilyFatherTerms(unpackStory(value)) as Story;
    const declaredGuests = normalizeStoryGuests(
      (normalized as { guests?: unknown }).guests,
    );
    // Người viết hay khai lại khách mời người dùng đã cung cấp bằng guest-1/2,
    // tạo hai bản "Ông nội" trong cùng cảnh. Gộp về khoá của người dùng.
    const provided = this.input.guestCharacters || [];
    const sameName = (a: string, b: string) =>
      a.normalize("NFC").trim().toLowerCase() === b.normalize("NFC").trim().toLowerCase();
    const remap = new Map(
      declaredGuests.flatMap((guest) => {
        const match = provided.find((item) => sameName(item.name, guest.name));
        return match ? [[guest.key, match.key] as const] : [];
      }),
    );
    const guests = declaredGuests.filter((guest) => !remap.has(guest.key));
    const story = {
      ...normalized,
      dialogue: normalized.dialogue.map((line) => ({
        ...line,
        characterId: remap.get(line.characterId) || line.characterId,
      })),
      wants: (normalized.wants || []).map((want) => ({
        ...want,
        characterId: remap.get(want.characterId) || want.characterId,
      })),
      guests,
    };
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
      // Chống lặp dành cho đề tài AI tự chọn. Khi người dùng viết ý tưởng, họ có
      // thể chủ động làm lại một tập cũ ("Cát bay vào mắt" bị chặn vì trùng các
      // lần làm trước); danh sách tập gần đây vẫn nằm trong prompt để tránh lặp
      // những gì họ không yêu cầu.
      this.userDirected ? [] : this.context.recentStories,
    );
  }

  /** The brief chooses the contract before drafting; a cinematic result cannot
   * accidentally inherit comedy's game/button requirements. */
  private draftGenre() {
    return storyGenreFromIntent(this.input.intent, this.profile.genres);
  }

  /** Runs exactly one pipeline stage within its own deadline. */
  async runStage(stage: FamilyScriptStageKind, deadlineMs: number) {
    if (this.state.completedStages.includes(stage)) return;
    if (
      stage === "shots" &&
      this.state.reviewedWithBenchmarkVersion !== FAMILY_BENCHMARK_VERSION
    )
      throw new Error("FAMILY_EDITORIAL_REVIEW_REQUIRED");
    this.providerFallbacks = 0;
    if (stage === "premises") {
      const genre = this.draftGenre();
      this.state.candidates = await this.checked(
        `${this.writerContext}
Ý TƯỞNG NGƯỜI DÙNG: ${this.intent}
THỂ LOẠI ĐÃ CHỌN: ${genre === "emotion" ? "cảm động có nguyên nhân; mỗi phương án phải gieo một chi tiết, có khoảnh khắc nhận ra và hành động thay đổi sau đó" : "hài tự nhiên; mỗi phương án phải có đối đáp hoặc phản ứng làm tình thế đổi"}. Chỉ đề xuất phương án thuộc nhánh này.
Đề xuất ĐÚNG BA tình huống A/B/C trước khi viết kịch bản. Mỗi phương án khai socialDomain và interactionFrame đúng enum trong schema. Nếu đã có đề tài/format, cả ba giữ đề tài ấy nhưng phát triển bằng hành vi và quan hệ KHÁC NHAU; nếu để trống, A/B/C phải thuộc BA socialDomain khác nhau, ít nhất hai phương án ở ngoài family_home. Chủ động dùng school, public_space, parents_workplace, neighborhood, service_commerce và relatives_friends; không lấy ba biến thể việc nhà.
Mỗi phương án gồm socialDomain, interactionFrame, situation, familiarPattern (thường thức/format được nhận ra), observedBehavior (hành vi cụ thể đời thường), progression (2–4 việc/câu đáp làm tình huống tiếp diễn), stopPoint (đúng khoảnh khắc nên cắt, không bắt giải quyết hậu quả), risk (vì sao có thể nhạt), sampleExchange (2–4 lượt thoại cùng hành động). sampleExchange được dùng guest-1 nếu người ngoài gia đình thật sự xuất hiện; nếu Bố/Mẹ chỉ kể chuyện người khác thì không cho người vắng mặt vào thoại.
Viết mẫu đối đáp thật để so sánh, không chỉ nhãn hài. Trước hết tìm thói quen nhỏ của con người (cách nhờ, hỏi vặn, giữ thể diện, chen nhu cầu), rồi đặt vào tình huống; đừng bắt đầu bằng danh sách thuật ngữ để đổi tên đồ chơi. Mẫu trao đổi phải cho thấy nét riêng của hai người đang nói. Mỗi progression phát triển cái vừa xảy ra/được kể, không chỉ chuyển sang tiện ích/chủ đề kế tiếp. Quan sát ý muốn, thói quen và cách nhân vật phản ứng trước người kia. Các phương án khác nhau về cách chuyện diễn ra, không chỉ thay đồ vật. Không chọn sẵn phương án thắng. Mỗi trường mô tả ngắn gọn, sampleExchange mỗi câu tối đa 25 từ.${genre === "comedy" && !filmFormatFromIntent(this.input.intent) ? `
Ít nhất MỘT phương án là bé nói thẳng với người xem (định dạng chủ lực của kênh ngắn ăn khách): một nỗi khổ người lớn ai cũng gặp, bé than/mắng/dạy người xem qua ống kính, đổi nơi theo từng ý, kết bằng mẹo thật hoặc lộ tẩy. situation bắt đầu bằng "Bé nói với người xem:"; người cầm máy (Bố/Mẹ) là người thứ hai, chỉ lọt tay hoặc nói một câu ngoài khung; sampleExchange là các câu bé nói vào máy và phản ứng của người cầm máy.` : ""}`,
        (v) => validatePremises(v, this.allowed, !this.userDirected),
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
THỂ LOẠI ĐÃ CHỌN: ${this.draftGenre() === "emotion" ? "cảm động; chọn phương án có chuỗi nguyên nhân cảm xúc nhìn thấy được" : "hài; chọn phương án có quan sát, đối đáp và điểm dừng đáng xem"}.
Đây là ba phương án của một người viết khác: ${JSON.stringify(this.state.candidates)}
So sánh thực sự socialDomain/interactionFrame/observedBehavior/progression/sampleExchange của cả ba. Tập hài cần lý do để xem tiếp ngoài hình bé + vai người lớn. Tập đối nhân xử thế cần câu đáp bám chính xác câu vừa nghe và hợp mức lễ phép của quan hệ; không tự cộng điểm chỉ vì “gắt”. Tập cảm động cần một emotionalCause nhìn thấy được trước câu kết: ai làm gì, thấy gì hoặc nhớ gì khiến quan hệ thay đổi? Phần nào chỉ lặp, kể lại, đổi tên đồ vật hoặc câu kết thêm cho có?
Đánh giá từng A/B/C bằng develop hoặc reject, strongestDetail trích NGUYÊN VĂN một đoạn trong hành vi/diễn biến/kết/thoại của đúng phương án, weakness và reason cụ thể. Không tự chấm đạt vì đúng cơ chế. Loại phương án chỉ liệt kê ba ví dụ của tiền đề (gối=nhập khẩu, bánh=kho năng lượng, trùm chăn=bảo mật). Không loại một chuỗi hội thoại chỉ vì có nhiều câu hỏi: chuỗi đạt khi từng câu đáp giữ đúng lời/hàm ý vừa nghe, xuất phát từ điều nhân vật muốn hoặc biết và làm cách hiểu hay việc đang diễn tiến lên; không bắt quyền chủ động phải đổi bên ở mọi lượt. Nếu đổi thứ tự mà vẫn hiểu như cũ thì mới là danh mục. Câu dẫn bình thường vẫn được; đánh giá toàn cuộc tương tác và chi tiết về con người, không đếm thuật ngữ/punchline. selectedId chọn phương án develop mạnh nhất và reason phải giải thích vì sao hơn các phương án khác. Nếu cả ba nhạt thì selectedId=null; không bắt chọn phương án ít dở nhất. Không đề xuất thay đề tài người dùng.
Phương án "Bé nói với người xem" không bị trừ điểm vì là độc thoại: đánh giá nó bằng nỗi khổ có đủ quen để người xem nhận ra mình không, các ý có leo thang không, và kết có mẹo thật hoặc cú lộ tẩy không.`,
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
      const genre = this.draftGenre();
      if (!this.state.episodeBrief) {
        const coreProfile = { ...this.profile, references: [] };
        this.state.episodeBrief = await this.checked(
          `YÊU CẦU NGƯỜI DÙNG PHẢI GIỮ: ${this.intent}
${contextText(
  { ...this.context, channelProfile: coreProfile },
  this.allowed,
  false,
)}
TÌNH HUỐNG ĐÃ CHỌN: ${JSON.stringify(selected)}
NHẬN XÉT SO SÁNH: ${JSON.stringify(this.state.selection)}
${FAMILY_WRITING_POLICY}
THAM KHẢO CƠ CHẾ, KHÔNG SAO CHÉP: ${JSON.stringify(this.profile.references)}
Lập hồ sơ riêng cho tập trước khi viết thoại. actualSituation nói đúng việc đang xảy ra. socialContext phải giữ đúng socialDomain của tình huống đã chọn; ghi interactionFrame, outsideRole (vai xã hội bên ngoài, hoặc “không có” nếu thật sự không có), friction cụ thể và responseMode phù hợp. Với mỗi nhân vật thực sự tham gia, ghi họ muốn gì, đã biết gì, quan hệ với người kia và cách xưng hô. Được dùng guest-1 cho đúng một cô giáo/người lạ/hàng xóm/người bán hàng/đồng nghiệp xuất hiện trong cảnh. Nếu người ngoài chỉ được Bố/Mẹ kể lại thì không thêm guest-1; nhân vật trong cảnh chỉ được biết đúng điều đã được kể. requiredElements liệt kê riêng từng cảnh/hành động/câu nói người dùng bắt buộc; để [] nếu người dùng không chỉ định chi tiết.
storyPayoff là giả thuyết phát triển: initialReading là cách người xem hiểu ban đầu; groundingDetail là chi tiết cụ thể phải xuất hiện sớm; reframedReading là điều chi tiết ấy khiến người xem nhìn lại; shareReason là trải nghiệm cụ thể khiến ai nhận ra mình hoặc muốn gửi cho ai. Với chuỗi hỏi cách đáp, groundingDetail có thể là chính câu nói được kể và reframedReading là chỗ mâu thuẫn/tiêu chuẩn kép mà câu đáp làm lộ ra; không ép thành một bài học lớn. Không biến storyPayoff thành lời đạo lý để nhân vật đọc. Không thêm bí mật, tai nạn, bệnh tật, hy sinh hoặc dữ kiện mới ở cuối.`,
          (v) =>
            validateEpisodeBrief(
              v,
              this.allowed,
              selected.socialDomain,
              selected.interactionFrame,
            ),
          deadlineMs,
          episodeBriefSchema,
          0.6,
          familyStageModels("draft"),
        );
        this.state.briefPolicyVersion = FAMILY_WRITING_POLICY_VERSION;
        // If the process stops after this write, the next claim reuses the
        // exact brief instead of paying to devise the episode again.
        await this.checkpoint("draft");
      }
      const chosenFormat = filmFormatFromIntent(this.input.intent);
      const genreContract = genre === "emotion"
        ? `THỂ LOẠI: cảm động. genre phải là emotion và performanceLane phải cinematic_emotion. Dùng chuỗi quan hệ cụ thể → chi tiết được gieo → khoảnh khắc nhận ra → hành động thay đổi → dư âm. emotionalArc phải trích NGUYÊN VĂN action/text của ba lượt khác nhau theo đúng thứ tự đó. Nhịp không lời là bình thường. Không trả game, beatFunction, unusual_thing, heighten, button, đảo vai hay câu chốt hài.`
        : `THỂ LOẠI: hài. genre phải là comedy. comicPremise ghi thường thức, điều đảo và tương phản nhìn/nghe thấy được. performanceLane mô tả cách diễn; verbal_counterplay vẫn được dùng cho cảnh đối đáp nhưng không ép mọi câu thành phản đòn.`;
      const genreWritingRules =
        genre === "emotion"
          ? `NHỊP CẢM XÚC:
• Viết số lượt đúng với diễn biến, tối thiểu 3 và tối đa 24; không kéo thành 14–20 lượt và không chẻ một khoảnh khắc chỉ để đạt mật độ.
• Mỗi lượt phải làm một việc nhìn thấy được: gieo chi tiết, làm nhân vật chú ý, khiến họ nhận ra, hoặc cho thấy hành động đã đổi sau khi nhận ra.
• seed, recognition và changedAction là ba trích dẫn nguyên văn từ text/action của ba lượt khác nhau theo đúng thứ tự. Nếu không trích được thì nguyên nhân cảm xúc chưa tồn tại trong phim.
• Thoại được dài ngắn tự nhiên theo người nói. Giữ tiết chế; để hình ảnh và hành động mang cảm xúc, không dùng độc thoại đạo lý hay câu chốt thông minh.`
          : `NHỊP HÀI:
• Viết đúng số lượt tình huống cần, trong giới hạn kỹ thuật 3–24; không kéo để đủ mật độ và không cắt câu theo số từ.
• Mỗi câu đáp giữ đúng người, việc, thời điểm, điều kiện và mức độ vừa nghe. Nhân vật được đồng ý, hỏi rõ, né, giữ lễ, đỡ lời, nhắc khéo, tiếp tục hành động hoặc phản bác khi họ có lý do; không biến cuộc thoại thành thi đấu khẩu. Nếu là format hỏi cách đáp, mỗi cặp phải dùng chính chữ/tiền đề của câu vừa kể, không tự bịa dữ kiện về người vắng mặt.
• beatFunction và game là trường tương thích để mô tả nhịp, không phải công thức: chọn nhãn gần nhất cho từng lượt, không cần đủ số lần heighten/counter và không bắt kết bằng button/callback/exit.
• Điểm khiến người xem hiểu lại phải được chi tiết có sẵn nâng đỡ. Không làm ai hỏi điều họ đương nhiên biết, tự nhận thua hoặc đổi tính chỉ để nhân vật khác nói câu hay.`;
      const coreProfile = { ...this.profile, references: [] };
      this.state.story = await this.checked(
        `Ý TƯỞNG PHẢI GIỮ: ${this.intent}
${contextText(
  { ...this.context, channelProfile: coreProfile },
  this.allowed,
  false,
)}
HỒ SƠ TẬP ĐÃ CHỐT: ${JSON.stringify(this.state.episodeBrief)}
${FAMILY_WRITING_POLICY}
THAM KHẢO CƠ CHẾ, KHÔNG SAO CHÉP: ${JSON.stringify(this.profile.references)}
TÌNH HUỐNG ĐÃ CHỌN: ${JSON.stringify(selected)}
NHẬN XÉT SO SÁNH: ${JSON.stringify(this.state.selection)}
${genreContract}
Viết bản đầy đủ bằng tiếng Việt, dùng hồ sơ tập làm căn cứ nhưng không chép initialReading/reframedReading/shareReason vào miệng nhân vật. Mỗi người chỉ nói điều họ có lý do nói từ want/knows/relationship; không cho họ hỏi ngớ ngẩn, cãi vô cớ, đổi nghĩa lời trước hoặc tự nhận thua để kê câu cuối. Với tập parody, action phải cho thấy nhân vật dùng đạo cụ nhận diện của chính format đó trong suốt nghi thức; không để hoạt động trẻ con không liên quan thay chỗ format. Với tập cảm động, không ép đảo vai/parody/joke; emotionalCause (như nhìn bóng lưng, thấy kỷ vật) phải nằm trong action của một lượt TRƯỚC lời nói cuối, không gộp vào chính câu kết. Phim chỉ nối bằng hard cut: chuyển cảnh hoặc vào hồi ức bằng hard cut/match cut, không dissolve/fade. Giữ các câu phản ứng có tác dụng, không bắt mỗi câu là một trò đùa. Khác biệt hai bé phải thể hiện qua cách xử lý/đối đáp, không chỉ đổi tên người nói.
Chọn performanceLane đúng một trong: ${PERFORMANCE_LANES.join(", ")}. Mô tả lane bằng hành động trong thoại/action; không tự khen bản thân là hài.
${chosenFormat
  ? `ĐỊNH DẠNG PHIM: người dùng đã chọn filmFormat=${chosenFormat}. ${FORMAT_WRITING_RULES[chosenFormat]}${chosenFormat !== "family_scene" ? `\n${COMEDY_CRAFT_RULES}` : ""}`
  : `ĐỊNH DẠNG PHIM: chọn filmFormat đúng một trong — ${FILM_FORMAT_MENU} Ý tưởng nói rõ cách quay thì theo đúng ý tưởng; tình huống đã chọn bắt đầu bằng "Bé nói với người xem:" thì là talk_to_camera; còn lại chọn định dạng làm tình huống đọng nhất.${genre === "emotion" ? " Tập cảm động chỉ dùng family_scene hoặc phone_vlog." : ""} Định dạng đã chọn kéo theo luật viết riêng dưới đây (chỉ áp luật của định dạng đã chọn):
${FILM_FORMATS.filter((f) => FORMAT_WRITING_RULES[f]).map((f) => FORMAT_WRITING_RULES[f]).join("\n")}
${COMEDY_CRAFT_RULES}`}
TRANG PHỤC TẬP: wardrobe để rỗng khi mọi người mặc đồ thường ngày trong ảnh chuẩn. Chỉ khai khi bộ đồ phục vụ cú hài hoặc vai diễn: mỗi người một bộ cho cả tập, tả cụ thể màu, kiểu, phụ kiện và giày (ví dụ "bộ vest xanh than cỡ trẻ em, sơ mi trắng, cà vạt sọc, giày da đen"). Không đổi đồ giữa các cảnh.
MỌI CẢNH NGƯỜI DÙNG NÊU RÕ trong ý tưởng (ví dụ: cõng con đi dọc biển, một đoạn hồi tưởng, nhìn kỷ vật) phải thành lượt riêng theo đúng thứ tự, không gộp vào action của lượt khác và không lược đi cho gọn. Cảnh không cần lời dùng NHỊP KHÔNG LỜI: text là chuỗi rỗng, characterId là người hành động chính, action tả cụ thể việc nhìn thấy (tối thiểu 6 từ; hồi tưởng ghi rõ "hồi tưởng" và ai làm gì). Tối đa 3 nhịp không lời, vẫn cần ít nhất 2 lượt có lời; lượt cuối nên có lời hoặc là reaction. Câu nói mà ý tưởng nêu ra (ví dụ con hỏi "Bố sao vậy", Bố bảo "cát bay vào mắt", con hứa sau này cõng lại Bố) phải được CHÍNH người đó NÓI trong text, không chỉ tả trong action, và giữ đúng người nói như ý tưởng.
Thời lượng ${(chosenFormat && FORMAT_TARGET_SECONDS[chosenFormat]) || this.input.targetDurationSeconds || 35} giây${chosenFormat ? "" : " (bé nói với người xem, bé vào bếp và vlog thì khoảng 60 giây)"} chỉ là mục tiêu gần đúng. Hoàn tất trọn diễn biến và kết thúc người dùng yêu cầu trước; nếu câu chuyện tự nhiên cần dài hơn thì viết thêm lượt đến đúng điểm kết, nếu xong sớm thì dừng, tuyệt đối không cắt mất kết hoặc kéo lời để chạm mốc. Có thể không có reaction nếu đã đủ điểm dừng. Viết tình huống đang diễn ra, lời kể chỉ khi format cần và cách kể tự có sức hút.
${genreWritingRules}
Nhân vật: chỉ dùng cast đã chọn. Khách mời đã có trong danh sách nhân vật thì dùng đúng ID của họ, không khai lại thành guest-1/guest-2. Nếu socialContext có guest-1, phải khai đúng MỘT khách mời trong guests với key guest-1, name là vai xã hội ngắn (Cô giáo, Người xếp hàng, Cô bán hàng, Đồng nghiệp của Bố…), description tả rõ ngoại hình/trang phục đủ để dựng ảnh nhận diện, personality; dùng guest-1 cho thoại và wants. Nếu socialContext là reported_situation/advice_roleplay và người ngoài không có trong characters thì họ vắng mặt: Bố/Mẹ kể câu của họ, không khai guest và không cắt sang minh họa người đó. Không tự sáng chế thêm nhân vật.
endingPlan.mode chọn hard_cut, silent_reaction hoặc resolved. stopAfterLine bắt buộc bằng đúng số lượt thoại; anchorQuote trích nguyên văn từ thoại/action lượt cuối; reason nói vì sao quan hệ hoặc cách hiểu hạ đúng ở đó. payoff và beats.payoff là mô tả điểm dừng để tương thích dữ liệu, KHÔNG phải yêu cầu punchline. Nếu dùng silent_reaction thì beats.reaction mô tả phản ứng không thoại; hai mode còn lại để reaction rỗng. Đọc riêng bốn lượt cuối: cắt câu không còn lý do tự nhiên để nói, câu giải thích điều đã thấy và trở ngại mới chỉ dùng để kê câu cuối. Trước khi trả, đọc từng câu từ góc nhìn người đang nói: hai chị em nói với nhau dùng chị/em, “chị em mình/tụi mình”; nói với bố mẹ dùng “tụi con”; không để một bé tự gọi cả hai là “hai đứa”.
Phần thoại/action phải tự thể hiện diễn biến, không dựa vào lời tác giả tự khen. Không thêm người ngoài cast, không ép parody thành việc chăm bố mẹ hoặc tập cảm động thành joke.
Trả JSON theo hợp đồng ${genre}: ${storyContractForGenre(genre)}`,
        (v) => this.validateStoryValue(v),
        deadlineMs,
        storyResponseSchema(this.profile, this.allowed, genre, chosenFormat),
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
          (v) => validateEditorialReview(v, story, this.intent),
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
          this.state.reviewedWithBenchmarkVersion = FAMILY_BENCHMARK_VERSION;
          this.state.benchmarkVersion = FAMILY_BENCHMARK_VERSION;
          await this.checkpoint("shots");
          this.state.completedStages.push("review");
          return;
        }
        if (review.watchability.decision === "reject")
          throw new Error("FAMILY_PREMISES_NEED_REVIEW");
        if (attempt === 1)
          throw new Error("FAMILY_EDITORIAL_NEEDS_REVIEW");
        this.state.story = await this.checked(
          `Ý TƯỞNG PHẢI GIỮ: ${this.intent}
${contextText(this.context, this.allowed, false)}
HỒ SƠ TẬP ĐÃ CHỐT: ${JSON.stringify(this.state.episodeBrief)}
${FAMILY_WRITING_POLICY}
BẢN CHỮ: ${JSON.stringify(this.state.story)}
NHẬN XÉT BẮT BUỘC SỬA: ${JSON.stringify(review)}
Sửa một lượt theo lý do cụ thể, giữ đoạn đang có sức sống. Nếu intentCheck=needs_revision, khôi phục đầy đủ chi tiết/điểm kết người dùng đã yêu cầu và cho nó diễn ra trong thoại hoặc hành động; không thay bằng một kết gần giống xảy ra sớm hơn. Nếu payoffCheck=needs_revision, gieo dữ kiện sớm hơn hoặc sửa lượt phát huy để hai lượt thật sự nối nghĩa; không thêm bí mật mới, câu hỏi ngớ ngẩn hay lời giảng đạo. Nếu endingCheck=forced_tail, cắt từ sau lastNecessaryLine rồi cập nhật endingPlan; không thay đuôi thừa bằng một câu chốt mới. Nếu unfinished, phát triển đúng việc đang diễn trước khi chọn điểm cắt. Nếu speechCheck=needs_revision, sửa đúng ngôi nói/khẩu ngữ ở câu được trích và rà cùng lỗi trong các câu khác; không đổi diễn biến chỉ để chữa đại từ. Nối lại câu bị bẻ vụn, nhưng không thêm tiểu từ máy móc hoặc biến mọi lượt thành phản đòn. Nếu genre=emotion, chỉ sửa seed/recognition/changedAction bị đứt, trích nguyên văn ba lượt theo đúng thứ tự và không thêm game hay punchline. Nếu genre=comedy, sửa động cơ, dữ kiện gieo hoặc diễn biến yếu trước khi nghĩ tới câu cuối. Giữ nguyên đề tài, cast khách mời, format và hồ sơ tập. Trả toàn bộ JSON: ${storyContractForGenre(story.genre || this.draftGenre())}`,
          (v) => this.validateStoryValue(v),
          deadlineMs,
          storyResponseSchema(this.profile, this.allowed, this.state.story?.genre || this.draftGenre()),
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
    const maxVideoDuration = this.input.maxVideoDurationSeconds || 30;
    const groups = shotChunkGroups(story, maxVideoDuration);
    // Khách mời gồm cả người dùng khai sẵn cho lượt (ông nội, Bố hồi bé) lẫn
    // khách AI tự thêm. Chỉ lấy khách AI khai thì khi lưu, khoá của khách người
    // dùng không được đổi thành id và bị ghi thẳng vào cột uuid.
    const storyGuests = [
      ...new Map(
        [
          ...(this.input.guestCharacters || []).map((guest) => ({
            key: guest.key,
            name: guest.name,
            description: guest.description || "",
            personality: guest.personality || "",
          })),
          ...(story.guests || []),
        ].map((guest) => [guest.key, guest] as const),
      ).values(),
    ].filter((guest) =>
      story.dialogue.some(
        (line) =>
          line.characterId === guest.key ||
          line.action.normalize("NFC").includes(guest.name.normalize("NFC")),
      ),
    );
    const shotAllowed = [...this.allowed, ...storyGuests.map((guest) => guest.key)];
    const shotContext: CreativeContext = {
      ...this.context,
      characters: [
        ...this.context.characters,
        ...storyGuests
          .filter((guest) => !this.context.characters.some((c) => c.id === guest.key))
          .map((guest) => ({
            id: guest.key,
            name: guest.name,
            description: guest.description,
            personality: guest.personality || null,
          })),
      ],
    };
    const targetSeconds = this.input.targetDurationSeconds || 35;
    const compileShots = (value: unknown, part: Story) => {
      const r = validateCreativeAssist(
        "video_plan",
        compileStoryboards(value, part, shotContext.characters, maxVideoDuration),
        shotContext,
        targetSeconds,
      );
      if (r.kind !== "video_plan") throw new Error("FAMILY_PLAN_INVALID");
      const spoken = r.scenes
        .flatMap((s) => s.storyboard?.beats || [])
        .filter((s) => s.dialogue);
      // Nhịp không lời không có dòng thoại nào để giữ nguyên.
      const lines = part.dialogue.filter((line) => line.text.trim());
      if (
        spoken.length !== lines.length ||
        spoken.some(
          (s, i) =>
            s.dialogue !== lines[i].text ||
            s.speakerCharacterId !== lines[i].characterId,
        )
      )
        throw new Error(
          "FAMILY_DIALOGUE_CHANGED: giữ nguyên thoại, thứ tự và người nói của từng nhịp storyboard",
        );
      return r;
    };
    const shotList = (chunk: Record<string, unknown> | null | undefined) =>
      Object.entries((chunk?.shots || {}) as Record<string, unknown>)
        .sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4)))
        .map(([, shot]) => shot);
    const storyFormat = filmFormat(story.filmFormat);
    const basePrompt = `${contextText(shotContext, shotAllowed)}
Ý TƯỞNG NGƯỜI DÙNG: ${this.intent}
CÂU CHUYỆN ĐÃ SOẠN: ${JSON.stringify(story)}
RÀNG BUỘC XUYÊN PHIM: openingState của mỗi panel ghi rõ giày dép của TỪNG nhân vật trong khung (chân trần hay đi giày/dép gì), giữ nhất quán giữa các panel cùng bối cảnh; ảnh chuẩn nhân vật có giày không có nghĩa trong cảnh phải đi giày. Mọi yêu cầu trong ý tưởng về trạng thái nhìn thấy được kéo dài qua nhiều cảnh (chân trần, cầm dép, trang phục, vết bẩn, đồ vật đang cầm, đang cõng/bế) phải được ghi rõ vào openingState/closingState và props của TỪNG panel liên quan, kể cả khi ảnh chuẩn nhân vật mặc/đi khác; không để model ảnh tự lấy lại giày dép hay trang phục mặc định.
${FILM_INTERACTION_POLICY}
LỚP ĐẠO DIỄN BIỂU CẢM: lane=${story.performanceLane || "deadpan_reversal"}. Mỗi panel phải trả performanceDirection với comicObjective (ở tập cảm động, trường tương thích này ghi mục tiêu cảm xúc của nhân vật), statusBefore/statusAfter, hook, tối thiểu hai beat hành động vật lý, reactionTarget cụ thể và revealOrCut. Với verbal_counterplay, hai beat là cách người nói phát câu và vi phản ứng của người nghe (liếc, khựng, nhướng mày, quay mặt); giữ shot–reverse-shot/cận biểu cảm, không bịa đạo cụ hay đại động tác để minh họa câu nói. Với lane khác, hai beat có thể là hai pha của cùng hành động hoặc hành động chính và phản ứng đồng thời của người nghe. Không bắt mỗi câu có hai trò, hai góc máy hoặc một cú lật. Dùng hành vi nhìn thấy được; không dùng riêng các nhãn “tự nhiên”, “nghiêm túc”, “ngây thơ”, “đáng yêu”, “gật đầu”, “nhìn ngơ”.
DỰNG STORYBOARD: chia thành ${groups.length} clip nguồn. Server chọn duration nguyên 4–${maxVideoDuration} giây cho từng request Seedance từ cả lời nói VÀ durationSeconds do đạo diễn cấp; phim cuối cắt ở đúng contentEndSeconds. Các nhịp thoại/panel được nhóm sẵn (chỉ số từ 1): ${JSON.stringify(groups.map((g) => g.map((i) => i + 1)))}. Mỗi panel là một nhịp bên trong đoạn, KHÔNG phải một job video riêng. GIỮ NGUYÊN câu thoại, thứ tự và người nói. Không thêm lời. durationSeconds phải đủ cho toàn bộ hành động nhìn thấy được từ openingState tới closingState; đừng chỉ đo thời gian phát âm câu thoại và đừng thêm đệm vô nghĩa.
${formatAllowsLocationCuts(storyFormat)
  ? "Định dạng này được đổi nơi giữa các panel, kể cả trong cùng đoạn: mỗi panel ghi setting là một nơi thật, cụ thể (chợ, ga tàu, hành lang chung cư…); cùng nơi với panel trước thì chép lại nguyên văn. Người và trang phục giữ nguyên qua mọi nơi."
  : "Trong cùng đoạn: cùng bối cảnh, ánh sáng, vị trí nhân vật, hướng nhìn và trục máy. Có thể pan theo người nói hoặc cắt đối đáp theo storyboard; không đổi cảnh ngẫu nhiên."}
${storyFormat !== "family_scene" ? `${COMEDY_CRAFT_RULES}\n` : ""}${story.wardrobe?.length ? `TRANG PHỤC TẬP NÀY (đã khoá, mặc suốt mọi panel): ${story.wardrobe.map((item) => `${shotContext.characters.find((c) => c.id === item.characterId)?.name || item.characterId}: ${item.outfit}`).join("; ")}. openingState ghi đúng bộ này, không quay lại đồ trong ảnh chuẩn.\n` : ""}MÁY QUAY (filmFormat=${storyFormat}): mỗi panel chọn cameraPreset trong menu — ${cameraPresetMenu(storyFormat)}. Đổi preset giữa hai panel liền nhau khi có thể; câu chốt dùng khung cận nhất.${formatAddressesCamera(storyFormat) ? " Người nói nhìn thẳng ống kính khi nói." : ""} Hành động bắt đầu ngay, người nghe phản ứng trong khi người kia nói, không đứng đợi tới lượt. Viết motionPrompt cho từng nhịp bằng hành động cụ thể, KHÔNG thêm mốc giây riêng; server gắn mốc liên tục theo lượng thoại và hành động. Chỉ một người nói tại mỗi thời điểm, đến nhịp sau mới đổi người. Không slow motion, kéo dài âm tiết, khoảng chờ mở đầu hoặc lặp động tác để đủ thời lượng.
Trước khi mô tả ảnh, hãy hiểu logic thị giác riêng của tập và trả visualDirection ở cấp toàn phim: storyMechanism, audienceMustSee, và characterKnowledge cho từng người gồm họ biết gì và chi tiết nào chưa được lộ trước thời điểm nào. Xác định điều gì gây lệch/hài, khán giả phải thấy gì và ở thời điểm nào, đạo cụ/hành động nào quyết định câu chuyện. Không bê checklist tiền, cặp hay micro sang tập khác. Mỗi panel phải có visualRequirements và referenceImages. visualRequirements chỉ liệt kê bằng chứng thật sự cần nhìn thấy (với lane adult_format_parody, đạo cụ nhận diện format của chính tập này là critical); dùng kind=count/text và legibility=countable/readable khi số lượng hoặc chữ/số là dữ kiện của câu chuyện. Mỗi critical requirement phải được ít nhất một reference image bao phủ. referenceImages là các ảnh riêng độ phân giải đầy đủ đưa cùng nhau vào reference_images của Seedance; role=scene cho bố cục/trạng thái, character cho nhận diện, prop cho vật thể quyết định, environment cho bối cảnh. Không tạo first/last-frame contract và không dùng grid/storyboard sheet làm input video. Chỉ đặt requiresOwnSource=true khi góc nhìn, trạng thái hoặc nhịp diễn khác đến mức không nên nằm chung một clip liên tục.
Panel đầu mỗi đoạn là một khung sạch có đủ người sẽ xuất hiện trong đoạn đó; đủ ảnh chuẩn từng người, đúng tỷ lệ, trang phục và vị trí. Mỗi panel phải có openingState, closingState và props. Mỗi đạo cụ có id ổn định xuyên các panel, tên, màu, kích thước, dấu hiệu, số lượng, người cầm và vị trí; cùng vật không được tự đổi màu/kích thước hay nhân bản. Chữ/số thật trên đạo cụ được yêu cầu bởi câu chuyện phải được giữ; chỉ cấm phụ đề, nhãn giao diện, mũi tên và chữ trang trí do model tự thêm. closingState của panel trước phải khớp openingState của panel sau, kể cả người đã rời khung. Trang phục, giày dép và trạng thái đạo cụ giữ nguyên qua các panel, chỉ đổi khi có hành động nhìn thấy được làm đổi. Các panel sau mô tả diễn tiến hành động/camera. Kết đoạn có tư thế, đạo cụ và hướng nhìn khớp đầu đoạn tiếp; giữ trục đối thoại để nối bằng hard cut. Không cố thêm reaction sau điểm dừng đã chọn. Với parody giữ tín hiệu nhận diện format.
`;

    // Dựng từng đoạn clip một lượt gọi: output nhỏ, không chạm timeout, đoạn hỏng
    // chỉ phải dựng lại chính nó. Tiến độ nằm trong state để lượt sau chạy tiếp.
    const chunks =
      this.state.shotChunks?.length === groups.length
        ? [...this.state.shotChunks]
        : groups.map(() => null);
    for (let g = 0; g < groups.length; g++) {
      if (chunks[g]) continue;
      // Một lời gọi có thể mất tới 45 giây; không bắt đầu đoạn mới khi không đủ
      // thời gian. Stage chưa xong, lượt sau tiếp tục từ đoạn này.
      if (chunks.some(Boolean) && deadlineMs - Date.now() < 50000) {
        this.state.shotChunks = chunks;
        await this.checkpoint(this.state.stage);
        return;
      }
      const group = groups[g];
      const part = storySlice(story, group);
      const header = chunks[0] as {
        title?: string;
        summary?: string;
        visualDirection?: unknown;
      } | null;
      const priorShots = chunks.slice(0, g).flatMap(shotList);
      const lastShot = priorShots.at(-1) as
        | { closingState?: string; props?: unknown }
        | undefined;
      const panelNumbers = group.map((i) => i + 1);
      const chunkPrompt = `${basePrompt}
LƯỢT NÀY CHỈ DỰNG PHẦN ${g + 1}/${groups.length}: panel ${panelNumbers.join(", ")} (đánh số toàn phim). ${group
        .map((i) =>
          !story.dialogue[i]
            ? `Panel ${i + 1} là phản ứng im lặng cuối phim.`
            : story.dialogue[i].text.trim()
              ? `Panel ${i + 1} là lượt thoại ${i + 1}.`
              : `Panel ${i + 1} là nhịp KHÔNG LỜI: ${story.dialogue[i].action} Dựng bằng hành động và máy quay, không ai mấp máy môi.`,
        )
        .join(" ")}
${
  header
    ? `ĐÃ CHỐT Ở PHẦN 1, GIỮ NGUYÊN: visualDirection=${JSON.stringify(header.visualDirection)}
PHẦN TRƯỚC KẾT Ở: ${JSON.stringify(lastShot?.closingState || "")}
BỐI CẢNH ĐANG Ở: ${JSON.stringify((lastShot as { setting?: string } | undefined)?.setting || "")} — còn ở đó thì chép lại NGUYÊN VĂN chuỗi này vào setting, không viết gọn và không diễn đạt lại; chỉ viết chuỗi mới khi câu chuyện thật sự chuyển sang nơi khác.
ĐẠO CỤ ĐÃ CÓ (dùng lại đúng id, tên, màu, kích thước, dấu hiệu, số lượng): ${JSON.stringify([...new Map(priorShots.flatMap((shot) => ((shot as { props?: { id: string }[] }).props || []).map((prop) => [prop.id, prop] as const))).values()])}
Chỉ trả shots là mảng đúng ${group.length} panel theo thứ tự trên.`
    : `Chỉ trả title, summary, visualDirection (cho toàn phim) và shots là mảng đúng ${group.length} panel theo thứ tự trên.`
}
Mỗi panel có action, setting, camera, durationSeconds, imagePrompt, motionPrompt và listenerCharacterIds. imagePrompt tối đa 300 ký tự, motionPrompt tối đa 600. Không viết lại dialogue/speaker. ${this.input.targetDurationSeconds || 35} giây là mục tiêu kể chuyện, không phải độ dài bắt buộc; mỗi clip nguồn dùng đúng số giây cần thiết trong khoảng 4–${maxVideoDuration} và được cắt theo nội dung/transcript thật, không bịa transcript.`;
      const accepted = await this.checked(
        chunkPrompt,
        (v) => {
          const normalized = normalizeShotResponse(
            header
              ? {
                  ...(v as Record<string, unknown>),
                  title: header.title,
                  summary: header.summary,
                  visualDirection: header.visualDirection,
                }
              : v,
            priorShots,
          ) as Record<string, unknown>;
          compileShots(normalized, part);
          return normalized;
        },
        deadlineMs,
        shotResponseSchema(part, shotAllowed, { header: !header }),
        undefined,
        familyStageModels("shots"),
      );
      chunks[g] = accepted;
      this.state.shotChunks = chunks;
      await this.checkpoint(this.state.stage);
    }

    const header = chunks[0] as {
      title: string;
      summary: string;
      visualDirection?: unknown;
    };
    let result: Extract<CreativeAssistResult, { kind: "video_plan" }>;
    try {
      result = compileShots(
        normalizeShotResponse({
          title: header.title,
          summary: header.summary,
          visualDirection: header.visualDirection,
          shots: chunks.flatMap(shotList),
        }),
        story,
      );
    } catch (error) {
      // Các đoạn đạt riêng lẻ nhưng ghép lại không hợp lệ: dựng lại từ đầu thay vì
      // kẹt mãi ở cùng một bộ đoạn đã lưu.
      this.state.shotChunks = undefined;
      throw error;
    }
    await this.checkpoint("complete");
    const finalStory: Story = {
      ...story,
      writingPolicyVersion:
        this.state.briefPolicyVersion || story.writingPolicyVersion,
      editorialEvidence: (() => {
        const last = this.state.drafts.at(-1)?.review;
        return (last as { evidence?: Record<string, string> } | undefined)
          ?.evidence;
      })(),
      development: compactDevelopmentTrace(this.trace()),
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
    this.state.shotChunks = undefined;
    this.state.completedStages.push("shots");
  }

  /** One-shot driver for interactive use: runs every remaining stage in order. */
  async runAll(deadlineMs: number) {
    for (const stage of FAMILY_SCRIPT_STAGES) {
      // shots có thể trả về khi mới dựng xong một phần; chạy tiếp tới khi xong.
      while (!this.state.completedStages.includes(stage)) {
        const built = (this.state.shotChunks || []).filter(Boolean).length;
        await this.runStage(stage, Math.min(deadlineMs, Date.now() + 90000));
        if (
          !this.state.completedStages.includes(stage) &&
          (this.state.shotChunks || []).filter(Boolean).length === built
        )
          throw new Error("FAMILY_WRITING_TIMEOUT");
      }
    }
    if (!this.state.result) throw new Error("FAMILY_PLAN_INVALID");
    return this.state.result;
  }
}
