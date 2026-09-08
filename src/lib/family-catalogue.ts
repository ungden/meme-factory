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
  positioning: string;
  audience: string;
  tone: string;
  roles: Array<{ characterId: string; name: string; personality: string }>;
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
  profileVersion: number;
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
    lesson: "Mỗi lượt thay đổi một biến số; cú cuối giải thích hành vi từ đầu.",
  },
  {
    source: "2 · Hẹn giờ khóc",
    mechanism: "Trẻ tổ chức nhu cầu trẻ con bằng tư duy người lớn",
    lesson:
      "Sự đồng lõa và biểu cảm có thể là kết; không bắt mọi tập phải lật.",
  },
  {
    source: "3 · Các loại chân",
    mechanism: "Luật vô lý được theo đuổi nhất quán",
    lesson: "Thay điều kiện lợi ích để phá lý lẽ, không giảng giải.",
  },
  {
    source: "4 · Không so sánh mẹ",
    mechanism: "Đảo chiều người bị đánh giá",
    lesson: "Chỉ ra bất cân xứng; tránh chê ngoại hình, thu nhập hoặc hạ nhục.",
  },
  {
    source: "5 · Quân sư né việc",
    mechanism: "Quân sư quên tính mình vào điều kiện",
    lesson: "Hệ quả dùng đúng điều đã thiết lập; luân phiên người mắc bẫy.",
  },
  {
    source: "6 · Bố mẹ nhờ mua đồ",
    mechanism: "Đảo vai người lớn và trẻ con",
    lesson: "Người lớn cũng đáng yêu và biết cảm ơn; không chỉ sai vặt con.",
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
    version: 1,
    positioning:
      "Một gia đình cố định, nhiều chuyện nhỏ nối tiếp; Bánh Bao và Đậu Đỏ dẫn chuyện. Mỗi tập độc lập, quan hệ tích luỹ qua các tập. Làm bánh chỉ là một bối cảnh nhận diện.",
    audience: "Người lớn, đặc biệt cha mẹ Việt Nam",
    tone: "Hài lém lỉnh, có tình cảm; thể hiện thương nhau qua hành động. Giữ tính cách, đổi người thắng và liên minh.",
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
  if (
    !Array.isArray(s.beats) ||
    s.beats[0]?.purpose !== "hook" ||
    s.beats.at(-1)?.purpose !== "reaction" ||
    !s.beats.some((b) => b.purpose === "payoff") ||
    s.beats.filter((b) => b.purpose === "turn").length < 2 ||
    s.beats.some((b) => !b.description?.trim())
  )
    throw new Error(
      `STORY_BEATS_INVALID: cần hook, 2–3 turn, payoff, reaction; nhận ${JSON.stringify(s.beats?.map((b) => b.purpose))}`,
    );
  if (
    !Array.isArray(s.dialogue) ||
    s.dialogue.length < 6 ||
    s.dialogue.length > 10 ||
    s.dialogue.some(
      (d) =>
        !allowed.includes(d.characterId) ||
        !d.text?.trim() ||
        !d.action?.trim(),
    )
  )
    throw new Error("STORY_DIALOGUE_INVALID");
  const words = s.dialogue.reduce(
    (n, d) => n + d.text.trim().split(/\s+/).length,
    0,
  );
  if (words < 60 || words > 90)
    throw new Error(`STORY_WORDS_${words}: cần 60–90 từ và 6–10 lượt thoại`);
  if (recent.some((r) => fingerprint(r) === fingerprint(s)))
    throw new Error("STORY_REPEATED_COMBINATION");
  return { ...s, profileVersion: profile.version };
}
export const STORY_SCHEMA =
  '{"series":"", "situation":"", "mechanism":"", "outcome":"", "wants":[{"characterId":"uuid","want":""}], "beats":{"hook":"","turns":["",""],"payoff":"","reaction":""}, "setup":"", "payoff":"", "caption":"", "dialogue":[{"characterId":"uuid","text":"","action":""}]}';
