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
const { profile, plans } = buildFamilyPilot(cast, testPilot);
const editorialPass = { passed: true, issues: [] };
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
  expect(result.kind === "video_plan" && result.story?.profileVersion).toBe(2);
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
      issues: [
        { location: "dialogue.2", quote: "gượng", reason: "vẫn chưa tự nhiên" },
      ],
    },
    plans[0].story,
    {
      passed: false,
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
