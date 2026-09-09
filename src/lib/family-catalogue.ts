import { FAMILY_WRITING_POLICY_VERSION } from "./family-writing-policy";
/** Editorial references describe mechanisms only; no source dialogue or media is copied. */
export const FAMILY_SERIES = [
  "Liên minh bí mật",
  "Quân sư gặp nạn",
  "Luật của tụi con",
  "Hai người lớn tí hon",
  "Hôm nay đổi phe",
  "Bố mẹ bị bắt bài",
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
  "series" | "situation" | "mechanism" | "outcome" | "wants" | "payoff"
>;
export type Story = {
  intendedShotSeconds?: number[];
  writingPolicyVersion?: string;
  profileVersion: number;
  editorialEvidence?: Record<string, string>;
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
    series: story.series,
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
    lesson: "Từ muốn phần thưởng chuyển sang muốn thắng đối thủ: mỗi bên đổi giá vì phản ứng của bên kia. Hài tăng qua cuộc mặc cả trước cú lật cuối. Học động cơ đổi chiến thuật, không viết lại đấu giá bằng món đồ khác.",
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
    lesson: "Bé bịa lý lẽ để được bế rồi thích nghi khi mẹ đổi điều kiện. Học lý sự có lợi và đổi chiến thuật; không lấy chuỗi chân chơi/chân về/chân kem thay thành tay/tai hay món khác.",
  },
  {
    source: "4 · Không so sánh mẹ",
    mechanism: "Đảo chiều người bị đánh giá",
    lesson: "Bé dùng chính tiêu chuẩn của người lớn để bảo vệ mình. Lập luận có thể nhiều câu nếu để thuyết phục người đối diện; tránh chê ngoại hình, thu nhập hoặc hạ nhục.",
  },
  {
    source: "5 · Quân sư né việc",
    mechanism: "Quân sư quên tính mình vào điều kiện",
    lesson: "Em giải thích khá dài cách đọc tâm trạng mẹ, lời khuyên thực sự giúp chị né việc rồi chính em quên tính mình vào. Đừng cắt màn quân sư vì coi giải thích là thừa; gieo điều kiện để hệ quả sau tự nhiên.",
  },
  {
    source: "6 · Bố mẹ nhờ mua đồ",
    mechanism: "Đảo vai người lớn và trẻ con",
    lesson: "Bố mẹ muốn nằm tiếp, hai bé muốn đi; đặt món, từ chối, nài nỉ rồi đổi cách thuyết phục. Lời cảm ơn cuối thuộc giao dịch đang diễn ra, không phải bài học gắn thêm. Bố mẹ có thể chủ động bày trò.",
  },
  {
    source: "7 · Cuộc gọi đáng ngờ",
    mechanism: "Người bị xem nhẹ giành quyền dẫn dắt",
    lesson:
      "Phản ứng người chứng kiến là một nhịp; sáng tác tình huống Việt mới.",
  },
];
export function familyProfile(roles: ChannelProfile["roles"]): ChannelProfile {
  return {
    version: 3,
    writingPolicyVersion: FAMILY_WRITING_POLICY_VERSION,
    positioning:
      "Một gia đình cố định, nhiều chuyện nhỏ nối tiếp; Bánh Bao và Đậu Đỏ dẫn chuyện. Mỗi tập độc lập, quan hệ tích luỹ qua các tập. Làm bánh chỉ là một bối cảnh nhận diện.",
    audience: "Người lớn, đặc biệt cha mẹ Việt Nam",
    tone: "Hài gia đình cho người lớn: trẻ con có thể lý sự, tính toán như người lớn vì mong muốn của mình. Đối đáp nghiêm túc trong tình huống buồn cười; giữ tính cách, đổi chiến thuật, người thắng và liên minh. Tình cảm nằm trong quan hệ, không bắt buộc lời kết dễ thương.",
    roles,
    series: FAMILY_SERIES,
    references: referenceMechanisms,
    avoid: [
      "Không sao chép lời thoại hay thay tên trong video nguồn",
      "Không cố định chị luôn khôn, em luôn thua, bố vụng, mẹ phạt",
      "Không chê ngoại hình/tiền bạc hoặc làm nhục thành viên",
      "Không kết bằng bài học, cả nhà cùng cười hoặc cú lật không được chuẩn bị",
      "Không kéo thoại cho đủ thời lượng",
      "Không ép tất cả tập về bánh",
      "Không chữa mâu thuẫn bằng một câu chia sẻ, hợp tác hoặc bài học ở cuối",
      "Không viết câu chỉ nhằm khoe chơi chữ; ngôn ngữ người lớn được dùng khi phục vụ ý đồ của nhân vật, không cấm theo danh sách từ",
      "Không bắt nhân vật làm trái điều vừa hiểu chỉ để tạo cú lật",
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
    throw new Error("STORY_SHOT_LIMIT: tối đa 12 shot kể cả reaction; giữ đối đáp, bỏ reaction nếu không cần");
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

export const STORY_SCHEMA =
  '{"series":"", "situation":"", "mechanism":"", "outcome":"", "wants":[{"characterId":"uuid","want":""}], "beats":{"hook":"","turns":[],"payoff":"","reaction":""}, "setup":"", "payoff":"", "caption":"", "dialogue":[{"characterId":"uuid","text":"","action":""}]}';
