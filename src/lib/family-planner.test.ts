import { testPilot } from "./family-test-fixture";
import { it, expect, vi, beforeEach } from "vitest";
import { buildFamilyPilot, familyPersonalities } from "./family-pilot";
import { creativeAssistModel, generateCreativeAssist } from "./creative-assist";
import { compileStoryShots } from "./family-ai-contract";
const calls = vi.hoisted(() => ({
  prompts: [] as string[],
  responses: [] as unknown[],
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (r: { contents: { text: string }[] }) => {
        calls.prompts.push(r.contents[0].text);
        return { text: JSON.stringify(calls.responses.shift()) };
      },
    };
  },
}));
vi.mock("@/lib/server-secrets", () => ({
  getGeminiApiKey: async () => "test",
}));
const cast = Object.keys(familyPersonalities).map((name, i) => ({
  name,
  characterId: String(i),
  description: "ref",
  personality: "",
  imageUrl: "ref",
  referenceImages: ["ref"],
  assetVersionId: String(i),
  assetVersion: 2,
}));
const reversalPremise = {
  normalExpectation: "Bố mẹ thường chuẩn bị đồ cho con ra khỏi nhà.",
  invertedReality: "Hai bé chuẩn bị túi cơm, thìa và nước cho bố đi làm.",
  visibleContrast: "Hai bé kiểm đồ cho bố, nhắc bố đi giày vì sợ bố lại gọi nhờ.",
};
const { profile, plans } = buildFamilyPilot(cast, [testPilot[0]].map(p => ({
  ...p,
  situation: "Hai bé soạn túi đồ cho bố đi làm",
  mechanism: "Dáng trẻ con, vai phụ huynh lo đồ người lớn",
  outcome: "Hai bé còn phải kiểm tra xem bố đã đi giày chưa",
  setup: "Túi cơm của bố đang để trước cửa",
  payoff: "Lo xong đồ vẫn phải giục bố chuẩn bị",
  turns: [
    ["Bánh Bao", "Đậu Đỏ, em lấy túi cơm cho bố chưa?", "Kiểm túi nhỏ trước cửa"],
    ["Đậu Đỏ", "Rồi. Em còn cho thìa vào nữa.", "Chỉ chiếc thìa trong túi"],
    ["Bánh Bao", "Bình nước đâu?", "Nhìn ngăn trống"],
    ["Đậu Đỏ", "Bố bảo mang nặng lắm.", "Nhấc bình lên cho chị nhìn"],
    ["Bánh Bao", "Không mang rồi trưa lại gọi hai chị em mình.", "Đưa bình vào túi bố"],
    ["Đậu Đỏ", "Chị giữ túi đi. Em xem bố đã đi giày chưa.", "Bước tới cửa phòng"],
  ],
  reaction: "Hai bé nhìn đôi giày của bố còn nguyên trước cửa",
})));
plans.forEach(p => { p.story.comicPremise = reversalPremise; });
const evidence = {
  contrast: "Hai bé chuẩn bị túi cơm và kiểm việc bố đi giày, đảo việc bố mẹ thường lo cho con.",
  motivation: "Hai bé cùng muốn bố đủ đồ để đi làm, không phải tranh lượt.",
  development: "Soạn cơm xong hai bé nhắc bình nước, rồi còn kiểm giày của bố.",
  ending: "Đôi giày còn trước cửa cho thấy hai bé còn phải giục bố chuẩn bị.",
  originality: "Không dùng chuỗi đấu giá hay đổi tên bộ phận cơ thể của reference.",
};
const editorialPass = { passed: true, evidence, issues: [] };
const shotResult = (p: (typeof plans)[number]) => ({
  title: p.title,
  summary: p.brief,
  shots: Object.fromEntries(p.scenes.map((s, i) => [`shot${i + 1}`, s])),
});
const input = {
  kind: "video_plan" as const,
  intent: "Một câu chuyện",
  context: {
    projectName: "Family",
    characters: cast.map((c) => ({ id: c.characterId, name: c.name })),
    recentContent: [],
    channelProfile: profile,
  },
  targetDurationSeconds: 35 as const,
};
beforeEach(() => {
  calls.prompts = [];
  calls.responses = [];
});
it("uses the higher quality family writing model without changing other assists", () => {
  expect(creativeAssistModel("video_plan", true)).toBe(
    "gemini-3.1-pro-preview",
  );
  expect(creativeAssistModel("image_plan", true)).toBe(
    "gemini-3-flash-preview",
  );
});
it("writes story then shots, carries caption and freezes exact dialogue", async () => {
  calls.responses = [
    plans[0].story,
    plans[0].story,
    editorialPass,
    shotResult(plans[0]),
  ];
  const result = await generateCreativeAssist(input);
  expect(calls.prompts).toHaveLength(4);
  expect(result.kind === "video_plan" && result.story?.profileVersion).toBe(4);
  expect(result.kind === "video_plan" && result.caption).toBe(
    plans[0].story.caption,
  );
});
it("allows only one repair across both passes and never drops bad shots", async () => {
  const bad = {
    ...plans[0],
    scenes: plans[0].scenes.map((s) => ({
      ...s,
      imagePrompt: "",
    })),
  };
  calls.responses = [
    {},
    plans[0].story,
    plans[0].story,
    editorialPass,
    shotResult(bad),
  ];
  await expect(generateCreativeAssist(input)).rejects.toThrow("INVALID");
  expect(calls.prompts).toHaveLength(5);
});

it("does not confuse generated clip duration with edited film duration", async () => {
  calls.responses = [
    plans[0].story,
    plans[0].story,
    editorialPass,
    shotResult({
      ...plans[0],
      scenes: plans[0].scenes.map((s) => ({ ...s, durationSeconds: 9 })),
    }),
  ];
  const result = await generateCreativeAssist(input);
  expect(
    result.kind === "video_plan" &&
      result.scenes.reduce((n, s) => n + s.durationSeconds, 0),
  ).toBe(63);
});

it("normalizes short acting beats to provider minimum without changing the editorial timing", async () => {
  const shots = plans[0].scenes.map((s) => ({ ...s, durationSeconds: 1.5 }));
  calls.responses = [
    plans[0].story,
    plans[0].story,
    editorialPass,
    shotResult({ ...plans[0], scenes: shots }),
  ];
  const result = await generateCreativeAssist(input);
  expect(
    result.kind === "video_plan" &&
      result.scenes.every((s) => s.durationSeconds >= 4),
  ).toBe(true);
  expect(
    result.kind === "video_plan" && result.story?.intendedShotSeconds?.at(-1),
  ).toBe(1.5);
});

it("compiles dialogue and speakers from the story even if the shot response tries to change them", async () => {
  const altered = shotResult({
    ...plans[0],
    scenes: plans[0].scenes.map((s) => ({
      ...s,
      dialogue: "khác",
      speakerCharacterId: "foreign",
      characterIds: ["foreign"],
    })),
  });
  calls.responses = [plans[0].story, plans[0].story, editorialPass, altered];
  const r = await generateCreativeAssist(input);
  expect(r.kind === "video_plan" && r.scenes[0].dialogue).toBe(
    plans[0].story.dialogue[0].text,
  );
  expect(r.kind === "video_plan" && r.scenes[0].characterIds).toEqual([
    plans[0].story.dialogue[0].characterId,
  ]);
});

it("repairs written jokes before planning shots", async () => {
  const stiff = {
    ...plans[0].story,
    caption: "Khi cái má không cùng phe với cái miệng",
    dialogue: plans[0].story.dialogue.map((line, index) =>
      index === 1 ? { ...line, text: "Vụn bánh đang nhảy múa đó!" } : line,
    ),
  };
  calls.responses = [
    plans[0].story,
    stiff,
    { passed: false, evidence, issues: [{ location: "dialogue.2", quote: "Vụn bánh đang nhảy múa đó!", reason: "Câu này không đáp lời chị hoặc giúp em giấu việc ăn vụng; thay cuộc đối đáp bằng ví von của tác giả." }] },
    plans[0].story,
    editorialPass,
    shotResult(plans[0]),
  ];
  const result = await generateCreativeAssist(input);
  expect(result.kind).toBe("video_plan");
  expect(
    calls.prompts.some((prompt) => prompt.includes("NHẬN XÉT BẮT BUỘC SỬA")),
  ).toBe(true);
});

it("refuses a family script when the independent final review still fails", async () => {
  calls.responses = [
    plans[0].story,
    plans[0].story,
    {
      passed: false,
      evidence,
      issues: [
        {
          location: "dialogue.2",
          quote: "gượng",
          reason: "không giống lời nói thật",
        },
      ],
    },
    plans[0].story,
    {
      passed: false,
      evidence,
      issues: [
        { location: "dialogue.2", quote: "gượng", reason: "vẫn chưa tự nhiên" },
      ],
    },
    plans[0].story,
    {
      passed: false,
      evidence,
      issues: [
        {
          location: "dialogue.2",
          quote: "gượng",
          reason: "vẫn chưa tự nhiên sau hai lượt sửa",
        },
      ],
    },
  ];
  await expect(generateCreativeAssist(input)).rejects.toThrow(
    "FAMILY_EDITORIAL_NEEDS_REVIEW",
  );
});

it("keeps a listener in a native dialogue shot and does not invent a final reaction", () => {
  const story = {
    ...plans[0].story,
    dialogue: plans[0].story.dialogue.slice(0, 4),
    beats: [
      { purpose: "hook" as const, description: "Hai bé tranh lượt" },
      { purpose: "payoff" as const, description: "Cả hai quên trò ban đầu" },
    ],
  };
  const shots = Object.fromEntries(
    story.dialogue.map((_, i) => [
      `shot${i + 1}`,
      {
        action: "Đối đáp",
        setting: "Phòng chơi",
        camera: "Hai người trong trung cảnh",
        durationSeconds: 4,
        imagePrompt: "Hai bé nhìn nhau",
        motionPrompt: "Một người nói, một người nghe",
        listenerCharacterIds: [story.dialogue[(i + 1) % 2].characterId],
      },
    ]),
  );
  const result = compileStoryShots(
    { title: "Tự nhiên", summary: "Đối đáp", shots },
    story,
    cast.map((c) => ({ id: c.characterId, name: c.name })),
  );
  expect(result.scenes).toHaveLength(4);
  expect(result.scenes[0].characterIds).toHaveLength(2);
  expect(result.scenes[0].speakerCharacterId).toBe(
    story.dialogue[0].characterId,
  );
});

 it.each([
   { passed: true, issues: [] },
   { passed: true, evidence: { motivation: evidence.motivation, development: evidence.development, ending: evidence.ending, originality: evidence.originality }, issues: [] },
   { passed: true, evidence, issues: [{ location: "dialogue.1" }] },
   { passed: false, evidence, issues: [] },
 ])("fails closed on malformed or unsupported editorial approval %j", async review => {
   calls.responses = [plans[0].story, plans[0].story, review];
   await expect(generateCreativeAssist(input)).rejects.toThrow("FAMILY_EDITORIAL_REVIEW_INVALID");
   expect(calls.prompts).toHaveLength(3);
 });

 it("applies one writing policy to ideation and preserves child identities", async () => {
   const ideas = { ideas: [1,2,3].map(i => ({ title: `Câu chuyện ${i}`, idea: `Hai bé bàn cách giành lượt chơi ${i}`, why: "Hai mong muốn khác nhau" })) };
   calls.responses = [ideas];
   await generateCreativeAssist({ ...input, kind: "idea_suggestions" });
   expect(calls.prompts[0]).toContain("family-dialogue-4");
   expect(calls.prompts[0]).toContain("KHÔNG giới hạn khả năng lập luận");
 });
