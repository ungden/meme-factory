import type { FamilyDevelopmentTrace } from "./family-development";
import { FAMILY_WRITING_POLICY_VERSION } from "./family-writing-policy";
import {
  PERFORMANCE_LANES,
  type PerformanceLane,
} from "./performance-direction";
/** Editorial references describe mechanisms only; no source dialogue or media is copied. */
export const FAMILY_SERIES = [
  "Liên minh bí mật",
  "Quân sư gặp nạn",
  "Luật của tụi con",
  "Hai người lớn tí hon",
  "Hôm nay đổi phe",
  "Bố mẹ bị bắt bài",
  "Hai con lo hết",
  "Bố mẹ chưa chịu lớn",
  "Chuyện người lớn phiên bản nhí",
] as const;
export type ChannelProfile = {
  version: number;
  writingPolicyVersion?: string;
  positioning: string;
  audience: string;
  tone: string;
  roles: Array<{
    characterId: string;
    name: string;
    personality: string;
    speechStyle?: string;
  }>;
  series: readonly string[];
  avoid: string[];
  references: Array<{ source: string; mechanism: string; lesson: string }>;
};
export type RecentStory = Pick<
  Story,
  | "performanceLane"
  | "series"
  | "situation"
  | "mechanism"
  | "outcome"
  | "wants"
  | "payoff"
  | "comicPremise"
>;
export type Story = {
  performanceLane?: PerformanceLane;
  intendedShotSeconds?: number[];
  writingPolicyVersion?: string;
  profileVersion: number;
  comicPremise?: {
    normalExpectation: string;
    invertedReality: string;
    visibleContrast: string;
  };
  editorialEvidence?: Record<string, string>;
  endingPlan?: {
    mode: "hard_cut" | "silent_reaction" | "resolved";
    stopAfterLine: number;
    anchorQuote: string;
    reason: string;
  };
  development?: FamilyDevelopmentTrace;
  series: string;
  situation: string;
  mechanism: string;
  outcome: string;
  wants: Array<{ characterId: string; want: string }>;
  beats: Array<{
    purpose: "hook" | "turn" | "payoff" | "reaction";
    description: string;
  }>;
  payoff: string;
  setup: string;
  caption: string;
  dialogue: Array<{ characterId: string; text: string; action: string }>;
};
export function compactStory(story: Story): RecentStory {
  return {
    ...(story.performanceLane ? { performanceLane: story.performanceLane } : {}),
    series: story.series,
    ...(story.comicPremise ? { comicPremise: story.comicPremise } : {}),
    situation: story.situation,
    mechanism: story.mechanism,
    outcome: story.outcome,
    wants: story.wants,
    payoff: story.payoff,
  };
}
export const referenceMechanisms: ChannelProfile["references"] = [
  {
    source: "1 · Đấu giá việc rửa bát",
    mechanism: "Cạnh tranh tăng cấp → tự mắc bẫy → lật lần hai",
    lesson:
      "Từ muốn phần thưởng chuyển sang muốn thắng đối thủ: mỗi bên đổi giá vì phản ứng của bên kia. Hài tăng qua cuộc mặc cả trước cú lật cuối. Học động cơ đổi chiến thuật, không viết lại đấu giá bằng món đồ khác.",
  },
  {
    source: "2 · Hẹn giờ khóc",
    mechanism: "Trẻ tổ chức nhu cầu trẻ con bằng tư duy người lớn",
    lesson:
      "Hai bé bàn thời điểm, phân vai rồi thực hiện để đạt nhu cầu. Lập kế hoạch bằng tư duy người lớn là phần gây cười; kế hoạch thành công đủ làm kết, không cần phạt hoặc lật.",
  },
  {
    source: "3 · Các loại chân",
    mechanism: "Luật vô lý được theo đuổi nhất quán",
    lesson:
      "Bé bịa lý lẽ để được bế rồi thích nghi khi mẹ đổi điều kiện. Học lý sự có lợi và đổi chiến thuật; không lấy chuỗi chân chơi/chân về/chân kem thay thành tay/tai hay món khác.",
  },
  {
    source: "4 · Không so sánh mẹ",
    mechanism: "Đảo chiều người bị đánh giá",
    lesson:
      "Bé dùng chính tiêu chuẩn của người lớn để bảo vệ mình. Lập luận có thể nhiều câu nếu để thuyết phục người đối diện; tránh chê ngoại hình, thu nhập hoặc hạ nhục.",
  },
  {
    source: "5 · Quân sư né việc",
    mechanism: "Quân sư quên tính mình vào điều kiện",
    lesson:
      "Em giải thích khá dài cách đọc tâm trạng mẹ, lời khuyên thực sự giúp chị né việc rồi chính em quên tính mình vào. Đừng cắt màn quân sư vì coi giải thích là thừa; gieo điều kiện để hệ quả sau tự nhiên.",
  },
  {
    source: "6 · Bố mẹ nhờ mua đồ",
    mechanism: "Đảo vai người lớn và trẻ con",
    lesson:
      "Hình chính đã đảo thường thức: hai bé đeo cặp chuẩn bị đi học nhưng còn phải lo đồ ăn cho bố mẹ đang nằm trên giường. Người lớn dặn món, mè nheo; trẻ thở dài như người phải chăm lo. Đây là tương phản dáng vẻ/vai trò và mọi việc đến tay con, không chỉ là mặc cả hay thua lý. Nhượng bộ để được yên, lời cảm ơn và lời hứa trả tiền đều tự nhiên. File được gửi lại là cùng reference, không tính thành mẫu độc lập mới.",
  },
  {
    source: "7 · Cuộc gọi đáng ngờ",
    mechanism: "Người bị xem nhẹ giành quyền dẫn dắt",
    lesson:
      "Phản ứng người chứng kiến là một nhịp; sáng tác tình huống Việt mới.",
  },
  {
    source: "8 · Phỏng vấn chủ xe đồ chơi",
    mechanism:
      "Parody format TikTok phỏng vấn người giàu/chủ xe sang, nhưng khách và xe là phiên bản trẻ con",
    lesson:
      "Khán giả nhận ra format nhờ micro, cách tiếp cận/phỏng vấn, vị thế khách và phong thái nghiêm túc; thấy vô lý vì đó là trẻ con bên xe đồ chơi. Học cả cấu trúc diễn của format và tương phản quy mô, không chỉ thêm từ khó hoặc việc vặt. Hai bé đóng cả hai vai là đủ, không cần cha mẹ/chăm sóc. Được parody cùng thể loại bằng cuộc đối đáp mới; không bê nguyên chuỗi hỏi–đáp/câu chốt nguồn. Không bắt nhân vật tự nhận đùa.",
  },
  {
    source: "9 · Bé thương lượng với bố",
    mechanism: "Tương phản tỷ lệ, thương lượng rồi khoe ngược để giữ thể diện",
    lesson:
      "Chênh lệch giữa điều mong đợi và phần nhận được tạo nhịp; bé vẫn nói như mình rất giỏi dù đang lép vế. Lời nói và biểu cảm cố ý lệch nhau, không cần sửa thành nhận thua. Chỉ lấy cơ chế cho chuyện nhẹ nhàng khác; không bê sính lễ, đùa bạo hành hoặc lời thoại nguồn.",
  },
  {
    source: "10a · Hai chiếc bánh, hai phản ứng",
    mechanism:
      "Cùng một lời mời, một người ăn ngay, một người nghĩ tới người mời",
    lesson:
      "Sự chậm lại ban đầu được giải thích bằng quan tâm cho mẹ; đẩy bánh và lời mời mẹ là điểm chốt. Không tự suy ra đang giả hiếu thảo để trục lợi, không thêm cú lật ích kỷ hay bài học. Đây là một mẩu độc lập trong file tổng hợp.",
  },
  {
    source: "10b · Chọn tiền khi thăm ông",
    mechanism: "Người lớn nhìn giá tiền, bé trả lời bằng mục đích đến thăm",
    lesson:
      "Một lựa chọn bị hiểu nhầm được giải thích bằng câu nói khéo/thân tình. Cho phép kết ở phản ứng nhận ra, không bắt có quà hay giao dịch chứng minh. Không suy động cơ diễn đạo đức chỉ từ câu trả lời; không cố định em ham lợi để chị luôn hơn. Tách khỏi mẩu hai chiếc bánh.",
  },
];
export function familyProfile(roles: ChannelProfile["roles"]): ChannelProfile {
  return {
    version: 9,
    writingPolicyVersion: FAMILY_WRITING_POLICY_VERSION,
    positioning:
      "Hai chị em trong một gia đình cố định, kể chuyện bằng đảo thường thức và parody thế giới người lớn. Hai nhánh: con lo cho bố mẹ như phụ huynh; trẻ diễn format/vai xã hội người lớn rất nghiêm túc với đạo cụ và quy mô trẻ con. Khán giả nhận ra khuôn mẫu rồi thấy sự tương phản vui vẻ. Không bắt mọi tập có bố mẹ, việc nhà hoặc bánh.",
    audience: "Người lớn, đặc biệt cha mẹ Việt Nam",
    tone: "Hài tương phản vui vẻ: tình huống/format người lớn quen thuộc được diễn trong thế giới trẻ con. Nhân vật nghiêm túc trong vai, khán giả thấy cái lệch; thoại đời thường hoặc đúng phong cách format. Giữ tình cảm gia đình, không cố chơi chữ/giảng đạo hoặc bắt mọi tập là con chăm bố mẹ.",
    roles,
    series: FAMILY_SERIES,
    references: referenceMechanisms,
    avoid: [
      "Không sao chép lời thoại hay thay tên trong video nguồn",
      "Không cố định chị luôn khôn, em luôn thua, bố vụng, mẹ phạt",
      "Không chê ngoại hình/tiền bạc hoặc làm nhục thành viên",
      "Không gắn bài học tổng kết hoặc cả nhà cùng cười vào cuối; cho phép tình cảm là chính câu chuyện khi có lựa chọn/lời nói cụ thể",
      "Không kéo thoại cho đủ thời lượng",
      "Không ép tất cả tập về bánh",
      "Không ép mọi tập có tranh giành, bẫy hoặc người thua; sự quan tâm hay muốn giữ thể diện cũng là động cơ",
      "Không viết câu chỉ nhằm khoe chơi chữ; ngôn ngữ người lớn được dùng khi phục vụ ý đồ của nhân vật, không cấm theo danh sách từ",
      "Phân biệt lỗi sự kiện/nhân quả của tác giả với lời nói ngược, khoe quá hoặc diễn ngầu có chủ ý của nhân vật",
    ],
  };
}
export function fingerprint(
  story: Pick<Story, "situation" | "mechanism" | "outcome">,
) {
  return [story.situation, story.mechanism, story.outcome]
    .map((s) =>
      s
        .normalize("NFC")
        .toLocaleLowerCase("vi")
        .replace(/[\p{P}\p{S}\s]+/gu, " ")
        .trim(),
    )
    .join("|");
}
export function validateStory(
  value: unknown,
  profile: ChannelProfile,
  allowed: string[],
  recent: Pick<Story, "situation" | "mechanism" | "outcome">[] = [],
): Story {
  const s = value as Story;
  if (s?.performanceLane !== undefined && !PERFORMANCE_LANES.includes(s.performanceLane))
    throw new Error("STORY_PERFORMANCE_LANE_INVALID");
  if (
    s?.comicPremise !== undefined &&
    (!s.comicPremise ||
      ![
        s.comicPremise.normalExpectation,
        s.comicPremise.invertedReality,
        s.comicPremise.visibleContrast,
      ].every(
        (v) =>
          typeof v === "string" && v.trim().length >= 8 && v.length <= 1000,
      ))
  )
    throw new Error("STORY_COMIC_PREMISE_INVALID");
  if (
    !s ||
    !profile.series.includes(s.series) ||
    ![s.situation, s.mechanism, s.outcome, s.payoff, s.setup, s.caption].every(
      (v) => typeof v === "string" && v.trim().length > 3 && v.length <= 1600,
    )
  )
    throw new Error("STORY_STRUCTURE_INVALID");
  if (
    !Array.isArray(s.wants) ||
    s.wants.length < 2 ||
    s.wants.some((w) => !allowed.includes(w.characterId) || !w.want?.trim())
  )
    throw new Error("STORY_WANTS_INVALID");
  const payoffIndex = s?.beats?.findIndex((b) => b.purpose === "payoff") ?? -1;
  const reactionIndex =
    s?.beats?.findIndex((b) => b.purpose === "reaction") ?? -1;
  if (
    !Array.isArray(s.beats) ||
    s.beats.length < 2 ||
    s.beats.length > 7 ||
    s.beats[0]?.purpose !== "hook" ||
    payoffIndex < 1 ||
    s.beats.filter((b) => b.purpose === "payoff").length !== 1 ||
    s.beats.filter((b) => b.purpose === "turn").length > 4 ||
    s.beats.slice(1, payoffIndex).some((b) => b.purpose !== "turn") ||
    (reactionIndex >= 0 &&
      (reactionIndex !== s.beats.length - 1 || reactionIndex < payoffIndex)) ||
    s.beats.some((b) => !b.description?.trim())
  )
    throw new Error(
      `STORY_BEATS_INVALID: cần hook, 0–4 turn, payoff và reaction chỉ khi làm câu chuyện hay hơn; nhận ${JSON.stringify(s.beats?.map((b) => b.purpose))}`,
    );
  if (
    !Array.isArray(s.dialogue) ||
    s.dialogue.length < 3 ||
    s.dialogue.length > 12 ||
    s.dialogue.some(
      (d) =>
        !allowed.includes(d.characterId) ||
        !d.text?.trim() ||
        !d.action?.trim(),
    )
  )
    throw new Error("STORY_DIALOGUE_INVALID");
  if (s.dialogue.length + (reactionIndex >= 0 ? 1 : 0) > 12)
    throw new Error(
      "STORY_SHOT_LIMIT: tối đa 12 shot kể cả reaction; giữ đối đáp, bỏ reaction nếu không cần",
    );
  if (s.endingPlan !== undefined) {
    const ending = s.endingPlan;
    const last = s.dialogue.at(-1);
    const hasReaction = reactionIndex >= 0;
    if (
      !ending ||
      !["hard_cut", "silent_reaction", "resolved"].includes(ending.mode) ||
      ending.stopAfterLine !== s.dialogue.length ||
      !last ||
      typeof ending.anchorQuote !== "string" ||
      ending.anchorQuote.trim().length < 2 ||
      ![last.text, last.action].some((text) =>
        text.includes(ending.anchorQuote),
      ) ||
      typeof ending.reason !== "string" ||
      ending.reason.trim().length < 12 ||
      (ending.mode === "silent_reaction") !== hasReaction
    )
      throw new Error(
        "STORY_ENDING_INVALID: điểm dừng phải ở lượt cuối; reaction chỉ có khi endingPlan là silent_reaction",
      );
  }
  const words = s.dialogue.reduce(
    (n, d) => n + d.text.trim().split(/\s+/).length,
    0,
  );
  if (words < 15 || words > 120)
    throw new Error(`STORY_WORDS_${words}: cần 15–120 đơn vị lời thoại`);
  if (
    s.dialogue.some(
      (d) => d.text.trim().split(/\s+/).filter(Boolean).length > 35,
    )
  )
    throw new Error("STORY_DIALOGUE_LINE_TOO_LONG");
  if (recent.some((r) => fingerprint(r) === fingerprint(s)))
    throw new Error("STORY_REPEATED_COMBINATION");
  return { ...s, profileVersion: profile.version };
}

export type FamilyEditorialIssue = {
  location: string;
  quote: string;
  reason: string;
};

/** New AI drafts declare the ordinary expectation and its reversal; historic saved stories remain readable without one. */
export function validateGeneratedFamilyStory(
  value: unknown,
  profile: ChannelProfile,
  allowed: string[],
  recent: RecentStory[] = [],
): Story {
  const story = validateStory(value, profile, allowed, recent);
  if (!story.comicPremise) throw new Error("STORY_COMIC_PREMISE_REQUIRED");
  if (!story.endingPlan) throw new Error("STORY_ENDING_REQUIRED");
  // Keep old fixtures/drafts readable while new planner responses declare a lane.
  return { ...story, performanceLane: story.performanceLane || "deadpan_reversal" };
}
export const STORY_SCHEMA =
  '{"performanceLane":"deadpan_reversal|adult_format_parody|literal_logic|physical_escalation|cinematic_cool", "comicPremise":{"normalExpectation":"","invertedReality":"","visibleContrast":""}, "series":"", "situation":"", "mechanism":"", "outcome":"", "wants":[{"characterId":"uuid","want":""}], "beats":{"hook":"","turns":[],"payoff":"","reaction":""}, "endingPlan":{"mode":"hard_cut|silent_reaction|resolved","stopAfterLine":1,"anchorQuote":"nguyên văn từ lượt cuối","reason":"vì sao dừng đúng ở đây"}, "setup":"", "payoff":"", "caption":"", "dialogue":[{"characterId":"uuid","text":"","action":""}]}';
