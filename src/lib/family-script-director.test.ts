import { testPilot } from "./family-test-fixture";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFamilyPilot, familyPersonalities } from "./family-pilot";
import {
  FamilyScriptDirector,
  emptyFamilyScriptState,
  nextScriptStage,
  repairHint,
  shotChunkGroups,
} from "./family-script-director";
const calls = vi.hoisted(() => ({
  prompts: [] as string[],
  responses: [] as unknown[],
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (r: { contents: { text: string }[] }) => {
        calls.prompts.push(r.contents[0].text);
        const response = calls.responses.shift();
        if (response instanceof Error) throw response;
        return { text: JSON.stringify(response) };
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
const { profile, plans } = buildFamilyPilot(
  cast,
  [testPilot[0]].map((p) => ({
    ...p,
    situation: "Hai bé soạn túi đồ cho bố đi làm",
    mechanism: "Dáng trẻ con, vai phụ huynh lo đồ người lớn",
    outcome: "Hai bé còn phải kiểm tra xem bố đã đi giày chưa",
    setup: "Túi cơm của bố đang để trước cửa",
    payoff: "Lo xong đồ vẫn phải giục bố chuẩn bị",
    turns: p.turns,
    reaction: "Hai bé nhìn đôi giày của bố còn nguyên trước cửa",
  })),
);
plans.forEach((p) => {
  p.story.comicPremise = {
    normalExpectation: "Bố mẹ thường chuẩn bị đồ cho con ra khỏi nhà.",
    invertedReality: "Hai bé chuẩn bị túi cơm, thìa và nước cho bố đi làm.",
    visibleContrast: "Hai bé kiểm đồ cho bố, nhắc bố đi giày vì sợ bố lại gọi nhờ.",
  };
  p.story.endingPlan = {
    mode: "silent_reaction",
    stopAfterLine: p.story.dialogue.length,
    anchorQuote: p.story.dialogue.at(-1)!.text,
    reason: "Câu cuối giao việc kiểm tra giày rồi dừng ở phản ứng nhìn đôi giày.",
  };
});
const evidence = {
  contrast: "Hai bé chuẩn bị túi cơm và kiểm việc bố đi giày, đảo việc bố mẹ thường lo cho con.",
  motivation: "Hai bé cùng muốn bố đủ đồ để đi làm, không phải tranh lượt.",
  development: "Soạn cơm xong hai bé nhắc bình nước, rồi còn kiểm giày của bố.",
  ending: "Đôi giày còn trước cửa cho thấy hai bé còn phải giục bố chuẩn bị.",
  originality: "Không dùng chuỗi đấu giá hay đổi tên bộ phận cơ thể của reference.",
};
const story = plans[0].story;
const candidates = [
  {
    id: "A",
    situation: "Hai bé kiểm túi đồ của bố trước giờ đi làm",
    familiarPattern: "Cha mẹ lo đồ đi học cho con",
    observedBehavior: "Bố sợ mang bình nước nặng nên hai bé phải kiểm lại",
    progression: ["Hai bé kiểm túi cơm đã có thìa", "Bố giấu bình vì sợ nặng"],
    stopPoint: "Đồ đã đủ nhưng giày của bố vẫn chưa đi",
    risk: "Có thể thành liệt kê đồ nếu không có phản ứng cụ thể",
    sampleExchange: story.dialogue.slice(0, 2),
  },
  {
    id: "B",
    situation: "Mẹ đòi ăn kem trước bữa tối của gia đình",
    familiarPattern: "Trẻ đòi món ngọt trước cơm",
    observedBehavior: "Mẹ giấu que kem sau hộp rau trong tủ lạnh",
    progression: ["Hai bé tìm rau và thấy kem của mẹ", "Mẹ xin ăn nốt"],
    stopPoint: "Hai bé phải lấy bát hứng kem cho mẹ",
    risk: "Tránh biến thành hai bé lên lớp mẹ",
    sampleExchange: story.dialogue.slice(2, 4),
  },
  {
    id: "C",
    situation: "Hai bé dẫn một buổi phỏng vấn chủ nhà gối",
    familiarPattern: "Dẫn tour căn nhà sang trọng",
    observedBehavior: "Chủ nhà phải bò qua cửa bằng gối mới vào được",
    progression: ["Người dẫn hỏi lối vào nhà", "Khách phải bò trong khi giữ micro"],
    stopPoint: "Chủ nhà vẫn đứng nghiêm chờ khách bò xong",
    risk: "Tránh chỉ đặt tên sang cho đồ chơi",
    sampleExchange: story.dialogue.slice(4, 6),
  },
];
const selection = {
  selectedId: "A",
  reason: "A có thao tác kiểm túi và phản ứng của bố cụ thể hơn hai phương án còn lại",
  evaluations: candidates.map((c) => ({
    candidateId: c.id,
    decision: c.id === "A" ? "develop" : "reject",
    strongestDetail: c.observedBehavior,
    weakness: c.risk,
    reason: "Đánh giá dựa vào các hành vi và đối đáp đã mô tả trong phương án",
  })),
};
const reviewFor = () => ({
  passed: true,
  evidence,
  issues: [],
  endingCheck: {
    status: "clean_stop",
    lastNecessaryLine: story.dialogue.length,
    quote: story.dialogue.at(-1)!.text,
    reason: "Lượt cuối hạ đúng việc đang diễn.",
  },
  speechCheck: {
    status: "natural",
    line: 1,
    quote: story.dialogue[0].text,
    reason: "Đại từ phù hợp người nghe.",
  },
  intentCheck: {
    status: "faithful",
    evidence: story.dialogue.at(-1)!.text,
    reason: "Giữ đúng ý tưởng người dùng.",
  },
  watchability: {
    decision: "ready_for_user",
    formatOnly: false,
    weakestMoment: { line: 1, quote: story.dialogue[0].text, why: "Cần gắn thao tác" },
    reason: "Các thao tác cụ thể phát triển từ việc soạn đồ.",
    weakness: "Cần nghe nhịp nói trước khi sản xuất",
    moments: story.dialogue.slice(0, 2).map((d, i) => ({
      line: i + 1,
      kind: "dialogue" as const,
      quote: d.text,
      why: "Câu này tạo phản ứng cụ thể",
    })),
  },
});
/** Bước shots gọi AI theo từng phần; mỗi phần trả đúng các panel của nó. */
const shotResults = () =>
  shotChunkGroups(plans[0].story).map((group, g) => ({
    ...(g === 0 ? { title: plans[0].title, summary: plans[0].brief } : {}),
    shots: group.map((i) => plans[0].scenes[i]),
  }));
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

it("runs exactly one stage per call and resumes from the persisted snapshot", async () => {
  calls.responses = [
    { candidates },
    selection,
    story,
    reviewFor(),
    ...shotResults(),
  ];
  const director = new FamilyScriptDirector(input);
  await director.runStage("premises", Date.now() + 90000);
  expect(director.pipelineState.completedStages).toEqual(["premises"]);
  expect(director.pipelineState.candidates).toHaveLength(3);
  expect(calls.prompts).toHaveLength(1);

  const snapshot = director.snapshot();
  const resumed = new FamilyScriptDirector(input);
  resumed.restore(snapshot);
  await resumed.runStage("selection", Date.now() + 90000);
  expect(resumed.pipelineState.completedStages).toEqual([
    "premises",
    "selection",
  ]);
  expect(calls.prompts).toHaveLength(2);

  const snapshot2 = resumed.snapshot();
  const continued = new FamilyScriptDirector(input);
  continued.restore(snapshot2);
  for (const stage of ["draft", "review", "shots"] as const)
    await continued.runStage(stage, Date.now() + 90000);
  expect(continued.done).toBe(true);
  expect(continued.finalResult?.kind).toBe("video_plan");
  expect(continued.finalResult?.story?.development?.stage).toBe("complete");
  expect(calls.prompts).toHaveLength(4 + shotChunkGroups(plans[0].story).length);
});

it("builds storyboards part by part and resumes from the saved parts", async () => {
  const parts = shotResults();
  expect(parts.length).toBeGreaterThan(1);
  calls.responses = [{ candidates }, selection, story, reviewFor()];
  const director = new FamilyScriptDirector(input);
  for (const stage of ["premises", "selection", "draft", "review"] as const)
    await director.runStage(stage, Date.now() + 90000);

  // Không đủ thời gian cho lượt gọi thứ hai: dừng sau phần đầu, stage chưa xong.
  calls.responses = [parts[0]];
  await director.runStage("shots", Date.now() + 40000);
  expect(director.done).toBe(false);
  expect(director.pipelineState.shotChunks?.filter(Boolean)).toHaveLength(1);

  calls.prompts = [];
  calls.responses = parts.slice(1);
  const resumed = new FamilyScriptDirector(input);
  resumed.restore(director.snapshot());
  await resumed.runStage("shots", Date.now() + 90000);
  expect(resumed.done).toBe(true);
  expect(resumed.pipelineState.shotChunks).toBeUndefined();
  expect(calls.prompts).toHaveLength(parts.length - 1);
  expect(calls.prompts[0]).toContain("ĐÃ CHỐT Ở PHẦN 1");
  // Ràng buộc xuyên phim (chân trần, cầm dép) nằm trong ý tưởng; storyboard phải nhận được.
  expect(calls.prompts[0]).toContain(`Ý TƯỞNG NGƯỜI DÙNG: ${input.intent}`);
  expect(calls.prompts[0]).toContain("RÀNG BUỘC XUYÊN PHIM");
  expect(
    resumed.finalResult?.scenes
      .flatMap((scene) => scene.storyboard?.beats || [])
      .filter((beat) => beat.dialogue)
      .map((beat) => beat.dialogue),
  ).toEqual(story.dialogue.map((line) => line.text));
});

it("parks a stuck stage with its state intact and resumes only that stage", async () => {
  calls.responses = [{ candidates }];
  const director = new FamilyScriptDirector(input);
  await director.runStage("premises", Date.now() + 90000);
  const snapshot = director.snapshot();

  calls.responses = [new Error("transport_down")];
  const stuck = new FamilyScriptDirector(input);
  stuck.restore(snapshot);
  await expect(
    stuck.runStage("selection", Date.now() + 90000),
  ).rejects.toThrow("transport_down");
  // The persisted snapshot still holds the completed premises stage.
  expect(stuck.pipelineState.candidates).toHaveLength(3);
  expect(stuck.pipelineState.completedStages).toEqual(["premises"]);

  calls.responses = [selection];
  const retried = new FamilyScriptDirector(input);
  retried.restore(stuck.snapshot());
  await retried.runStage("selection", Date.now() + 90000);
  expect(retried.pipelineState.completedStages).toEqual([
    "premises",
    "selection",
  ]);
  // Premises ran once; only the selection stage was attempted again.
  expect(calls.prompts).toHaveLength(3);
  expect(calls.prompts[0]).toContain("Đề xuất ĐÚNG BA tình huống");
  expect(calls.prompts[1]).toContain("ba phương án");
  expect(calls.prompts[2]).toContain("ba phương án");
});

it("orders the stage pipe and keeps an empty state resumable", () => {
  expect(nextScriptStage("premises")).toBe("selection");
  expect(nextScriptStage("shots")).toBe("done");
  const state = emptyFamilyScriptState();
  const director = new FamilyScriptDirector(input);
  director.restore(state);
  expect(director.pipelineState.completedStages).toEqual([]);
});

it("switches to the fallback model when the provider rejects the request", async () => {
  calls.responses = [
    new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}'),
    { candidates },
  ];
  const director = new FamilyScriptDirector(input);
  await director.runStage("premises", Date.now() + 90000);
  expect(director.pipelineState.completedStages).toEqual(["premises"]);
  // Same prompt, two model attempts.
  expect(calls.prompts).toHaveLength(2);
  expect(calls.prompts[0]).toContain("Đề xuất ĐÚNG BA tình huống");
  expect(calls.prompts[1]).toBe(calls.prompts[0]);
});

it("stops the stage after both models reject the request", async () => {
  const rejection = () =>
    new Error(
      '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}',
    );
  calls.responses = [rejection(), rejection()];
  const director = new FamilyScriptDirector(input);
  await expect(
    director.runStage("premises", Date.now() + 90000),
  ).rejects.toThrow("invalid argument");
  expect(calls.prompts).toHaveLength(2);
  expect(director.pipelineState.completedStages).toEqual([]);
});

describe("repairHint", () => {
  it("explains a bare code the writer would otherwise have to guess at", () => {
    const hint = repairHint("STORY_WANTS_INVALID");
    expect(hint).toContain("STORY_WANTS_INVALID");
    expect(hint).toContain("hai mục wants");
  });

  // Several validators already append their own explanation; repeating one
  // would just make the repair prompt noisier.
  it("leaves a message that already carries detail alone", () => {
    const detailed = "STORY_SHOT_LIMIT: tối đa 12 shot kể cả reaction";
    expect(repairHint(detailed)).toBe(detailed);
  });

  it("resolves a code carrying a numeric suffix", () => {
    expect(repairHint("STORY_WORDS_87")).toContain("STORY_WORDS_87");
  });

  it("passes an unknown code through rather than inventing advice", () => {
    expect(repairHint("BRAND_NEW_CODE")).toBe("BRAND_NEW_CODE");
  });

  it("never tells the writer to ask an AI to rewrite it", () => {
    // The user-facing dictionary ends many entries that way; it must not leak
    // into a prompt the model itself is reading.
    for (const code of [
      "STORY_STRUCTURE_INVALID", "STORY_DIALOGUE_INVALID",
      "STORY_ENDING_REQUIRED", "PERFORMANCE_DIRECTION_WEAK",
    ])
      expect(repairHint(code), code).not.toMatch(/cho AI|AI viết lại|AI dựng lại/i);
  });
});
