import { testPilot } from "./family-test-fixture";
import { it, expect, vi, beforeEach } from "vitest";
import { buildFamilyPilot, familyPersonalities } from "./family-pilot";
import { creativeAssistModel, generateCreativeAssist } from "./creative-assist";
import { compileStoryShots, unpackStory } from "./family-ai-contract";
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
const reversalPremise = {
  normalExpectation: "Bố mẹ thường chuẩn bị đồ cho con ra khỏi nhà.",
  invertedReality: "Hai bé chuẩn bị túi cơm, thìa và nước cho bố đi làm.",
  visibleContrast:
    "Hai bé kiểm đồ cho bố, nhắc bố đi giày vì sợ bố lại gọi nhờ.",
};
const { profile, plans } = buildFamilyPilot(
  cast,
  [testPilot[0]].map((p) => ({
    ...p,
    situation: "Hai bé soạn túi đồ cho bố đi làm",
    mechanism: "Dáng trẻ con, vai phụ huynh lo đồ người lớn",
    outcome: "Hai bé còn phải kiểm tra xem bố đã đi giày chưa",
    setup: "Túi cơm của bố đang để trước cửa",
    payoff: "Lo xong đồ vẫn phải giục bố chuẩn bị",
    turns: [
      [
        "Bánh Bao",
        "Đậu Đỏ, em lấy túi cơm cho bố chưa?",
        "Kiểm túi nhỏ trước cửa",
      ],
      ["Đậu Đỏ", "Rồi. Em còn cho thìa vào nữa.", "Chỉ chiếc thìa trong túi"],
      ["Bánh Bao", "Bình nước đâu?", "Nhìn ngăn trống"],
      ["Đậu Đỏ", "Bố bảo mang nặng lắm.", "Nhấc bình lên cho chị nhìn"],
      [
        "Bánh Bao",
        "Không mang rồi trưa lại gọi hai chị em mình.",
        "Đưa bình vào túi bố",
      ],
      [
        "Đậu Đỏ",
        "Chị giữ túi đi. Em xem bố đã đi giày chưa.",
        "Bước tới cửa phòng",
      ],
    ],
    reaction: "Hai bé nhìn đôi giày của bố còn nguyên trước cửa",
  })),
);
plans.forEach((p) => {
  p.story.comicPremise = reversalPremise;
  p.story.endingPlan = {
    mode: "silent_reaction",
    stopAfterLine: p.story.dialogue.length,
    anchorQuote: p.story.dialogue.at(-1)!.text,
    reason:
      "Câu cuối giao việc kiểm tra giày rồi dừng ở phản ứng nhìn đôi giày.",
  };
});
const evidence = {
  contrast:
    "Hai bé chuẩn bị túi cơm và kiểm việc bố đi giày, đảo việc bố mẹ thường lo cho con.",
  motivation: "Hai bé cùng muốn bố đủ đồ để đi làm, không phải tranh lượt.",
  development: "Soạn cơm xong hai bé nhắc bình nước, rồi còn kiểm giày của bố.",
  ending: "Đôi giày còn trước cửa cho thấy hai bé còn phải giục bố chuẩn bị.",
  originality:
    "Không dùng chuỗi đấu giá hay đổi tên bộ phận cơ thể của reference.",
};

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
const candidates = [
  {
    id: "A",
    situation: "Hai bé kiểm túi đồ của bố trước giờ đi làm",
    familiarPattern: "Cha mẹ lo đồ đi học cho con",
    observedBehavior: "Bố sợ mang bình nước nặng nên hai bé phải kiểm lại",
    progression: [
      "Hai bé kiểm túi cơm đã có thìa",
      "Bố giấu bình vì sợ nặng nhưng trưa sẽ lại nhờ con",
    ],
    stopPoint: "Đồ đã đủ nhưng giày của bố vẫn chưa đi",
    risk: "Có thể thành liệt kê đồ nếu không có phản ứng cụ thể",
    sampleExchange: plans[0].story.dialogue.slice(0, 2),
  },
  {
    id: "B",
    situation: "Mẹ đòi ăn kem trước bữa tối của gia đình",
    familiarPattern: "Trẻ đòi món ngọt trước cơm",
    observedBehavior: "Mẹ giấu que kem sau hộp rau trong tủ lạnh",
    progression: [
      "Hai bé tìm rau và thấy kem của mẹ",
      "Mẹ xin ăn nốt vì kem đang chảy ra tay",
    ],
    stopPoint: "Hai bé phải lấy bát hứng kem cho mẹ",
    risk: "Tránh biến thành hai bé lên lớp mẹ",
    sampleExchange: plans[0].story.dialogue.slice(2, 4),
  },
  {
    id: "C",
    situation: "Hai bé dẫn một buổi phỏng vấn chủ nhà gối",
    familiarPattern: "Dẫn tour căn nhà sang trọng",
    observedBehavior: "Chủ nhà phải bò qua cửa bằng gối mới vào được",
    progression: [
      "Người dẫn hỏi lối vào nhà",
      "Khách phải cúi rồi bò trong khi vẫn giữ micro",
    ],
    stopPoint: "Chủ nhà vẫn đứng nghiêm chờ khách bò xong",
    risk: "Tránh chỉ đặt tên sang cho đồ chơi",
    sampleExchange: plans[0].story.dialogue.slice(4, 6),
  },
];
const selection = {
  selectedId: "A",
  reason:
    "A có thao tác kiểm túi và phản ứng của bố cụ thể hơn hai phương án còn lại",
  evaluations: candidates.map((c) => ({
    candidateId: c.id,
    decision: c.id === "A" ? "develop" : "reject",
    strongestDetail: c.observedBehavior,
    weakness: c.risk,
    reason: "Đánh giá dựa vào các hành vi và đối đáp đã mô tả trong phương án",
  })),
};
const reviewFor = (story = plans[0].story, decision = "ready_for_user") => ({
  passed: decision === "ready_for_user",
  evidence,
  issues: [],
  endingCheck: {
    status: "clean_stop",
    lastNecessaryLine: story.dialogue.length,
    quote: story.dialogue.at(-1)!.text,
    reason: "Lượt cuối hạ đúng việc đang diễn và không mở thêm một vấn đề mới.",
  },
  speechCheck: {
    status: "natural",
    line: 1,
    quote: story.dialogue[0].text,
    reason:
      "Người nói dùng đại từ và khẩu ngữ phù hợp với người đang nghe trong cảnh.",
  },
  intentCheck: {
    status: "faithful",
    evidence: story.dialogue.at(-1)!.text,
    reason:
      "Bản diễn giữ đầy đủ tình huống và đi tới đúng kết quả mà ý tưởng yêu cầu.",
  },
  watchability: {
    decision,
    formatOnly: false,
    weakestMoment: {
      line: 1,
      quote: story.dialogue[0].text,
      why: "Câu dẫn cần gắn với thao tác kiểm đồ để tránh trở thành liệt kê",
    },
    reason:
      "Các thao tác và câu đáp cụ thể phát triển từ việc soạn đồ tới phải giục bố",
    weakness: "Cần nghe nhịp nói trước khi chọn bản này để sản xuất",
    moments: story.dialogue.slice(0, 2).map((d, i) => ({
      line: i + 1,
      kind: "dialogue",
      quote: d.text,
      why: "Câu này tạo phản ứng cụ thể từ người đối diện trong việc đang làm",
    })),
  },
});
const queue = (...afterSelection: unknown[]) => {
  calls.responses = [{ candidates }, selection, ...afterSelection];
};
beforeEach(() => {
  calls.prompts = [];
  calls.responses = [];
});

it("keeps existing text models", () => {
  expect(creativeAssistModel("video_plan", true)).toBe(
    "gemini-3.1-pro-preview",
  );
  expect(creativeAssistModel("image_plan", true)).toBe(
    "gemini-3-flash-preview",
  );
});
it("records all alternatives and comparison, then freezes reviewed dialogue into shots", async () => {
  queue(plans[0].story, reviewFor(), shotResult(plans[0]));
  const checkpoints: unknown[] = [];
  const result = await generateCreativeAssist(input, {
    onEditorialProgress: async (t) => {
      checkpoints.push(t);
    },
  });
  expect(calls.prompts).toHaveLength(5);
  if (result.kind !== "video_plan") throw Error("Wrong kind");
  expect(result.story?.profileVersion).toBe(9);
  expect(result.story?.development?.candidates).toHaveLength(3);
  expect(result.story?.development?.selection?.selectedId).toBe("A");
  expect(result.story?.development?.stage).toBe("complete");
  expect(result.story?.development?.drafts).toHaveLength(1);
  expect(
    result.scenes
      .flatMap((s) => s.storyboard?.beats || [])
      .map((b) => b.dialogue)
      .filter(Boolean),
  ).toEqual(plans[0].story.dialogue.map((d) => d.text));
  expect(checkpoints.length).toBeGreaterThan(3);
  // Reviewer must not see the author's labels or the premise winner as an endorsement.
  expect(calls.prompts[3]).not.toContain('"selectedId":"A"');
});
it("stops before drafting when no premise merits development and retains the comparison", async () => {
  calls.responses = [
    { candidates },
    {
      ...selection,
      selectedId: null,
      evaluations: selection.evaluations.map((e) => ({
        ...e,
        decision: "reject",
      })),
    },
  ];
  const checkpoints: unknown[] = [];
  await expect(
    generateCreativeAssist(input, {
      onEditorialProgress: async (t) => {
        checkpoints.push(t);
      },
    }),
  ).rejects.toThrow("FAMILY_PREMISES_NEED_REVIEW");
  expect(calls.prompts).toHaveLength(2);
  expect(checkpoints.at(-1)).toMatchObject({
    candidates,
    selection: { selectedId: null },
  });
});
it("rejects a structurally valid but dull script without inventing a structural error or planning media", async () => {
  queue(plans[0].story, reviewFor(plans[0].story, "reject"));
  const checkpoints: unknown[] = [];
  await expect(
    generateCreativeAssist(input, {
      onEditorialProgress: async (t) => {
        checkpoints.push(t);
      },
    }),
  ).rejects.toThrow("FAMILY_EDITORIAL_NEEDS_REVIEW");
  expect(calls.prompts).toHaveLength(4);
  expect(checkpoints.at(-1)).toMatchObject({
    stage: "review",
    drafts: [{ review: { issues: [], watchability: { decision: "reject" } } }],
  });
});
it("revises only after a concrete review, preserving both drafts", async () => {
  const stiff = {
    ...plans[0].story,
    dialogue: plans[0].story.dialogue.map((d, i) =>
      i === 1 ? { ...d, text: "Vụn bánh đang nhảy múa đó!" } : d,
    ),
  };
  const fail = {
    ...reviewFor(stiff, "revise"),
    issues: [
      {
        location: "dialogue.2",
        quote: stiff.dialogue[1].text,
        reason: "Ví von không đáp lại câu vừa hỏi",
      },
    ],
  };
  queue(stiff, fail, plans[0].story, reviewFor(), shotResult(plans[0]));
  const result = await generateCreativeAssist(input);
  expect(
    result.kind === "video_plan" && result.story?.development?.drafts,
  ).toHaveLength(2);
  expect(calls.prompts).toHaveLength(7);
});
it("removes a forced spoken tail instead of inventing another ending", async () => {
  const forcedTail = {
    ...plans[0].story,
    dialogue: [
      ...plans[0].story.dialogue,
      {
        characterId: plans[0].story.dialogue[0].characterId,
        text: "Nhưng chị chỉ biết tên trường thôi.",
        action: "Đứng lại ở cửa và nhìn em",
      },
    ],
    endingPlan: {
      mode: "silent_reaction" as const,
      stopAfterLine: plans[0].story.dialogue.length + 1,
      anchorQuote: "Nhưng chị chỉ biết tên trường thôi.",
      reason:
        "Bản nháp đề xuất dừng sau câu mở thêm chuyện hai bé không biết đường.",
    },
  };
  const forcedReview = {
    ...reviewFor(forcedTail, "ready_for_user"),
    endingCheck: {
      status: "forced_tail" as const,
      lastNecessaryLine: plans[0].story.dialogue.length,
      quote: plans[0].story.dialogue.at(-1)!.text,
      reason:
        "Câu về tên trường mở vấn đề mới sau khi việc chính đã hạ ở lượt trước.",
    },
  };
  queue(
    forcedTail,
    forcedReview,
    plans[0].story,
    reviewFor(),
    shotResult(plans[0]),
  );
  const result = await generateCreativeAssist(input);
  if (result.kind !== "video_plan") throw Error("Wrong kind");
  expect(result.story?.development?.drafts).toHaveLength(2);
  expect(result.story?.development?.drafts[0].endingPlan?.stopAfterLine).toBe(
    7,
  );
  expect(result.story?.development?.drafts[0].review?.passed).toBe(false);
  expect(result.story?.development?.drafts[1].dialogue).toHaveLength(6);
  expect(
    result.scenes.map((scene) => scene.dialogue).filter(Boolean),
  ).not.toContain("Nhưng chị chỉ biết tên trường thôi.");
  expect(calls.prompts[4]).toContain("cắt từ sau lastNecessaryLine");
});
it("does not continue an unproductive revision loop", async () => {
  queue(
    plans[0].story,
    reviewFor(plans[0].story, "revise"),
    plans[0].story,
    reviewFor(plans[0].story, "revise"),
  );
  await expect(generateCreativeAssist(input)).rejects.toThrow(
    "FAMILY_EDITORIAL_NEEDS_REVIEW",
  );
  expect(calls.prompts).toHaveLength(6);
});
it("retains reviewed work when checkpoint storage fails before shot planning", async () => {
  queue(plans[0].story, reviewFor(), shotResult(plans[0]));
  await expect(
    generateCreativeAssist(input, {
      onEditorialProgress: async (t) => {
        if (t.stage === "shots") throw Error("storage down");
      },
    }),
  ).rejects.toThrow("storage down");
  expect(calls.prompts).toHaveLength(4);
});
it("normalizes provider durations without altering the editorial timing or exact speakers", async () => {
  queue(
    plans[0].story,
    reviewFor(),
    shotResult({
      ...plans[0],
      scenes: plans[0].scenes.map((s) => ({
        ...s,
        durationSeconds: 1.5,
        dialogue: "changed",
        speakerCharacterId: "foreign",
      })),
    }),
  );
  const r = await generateCreativeAssist(input);
  if (r.kind !== "video_plan") throw Error("Wrong kind");
  expect(r.scenes.every((s) => s.durationSeconds >= 4)).toBe(true);
  expect(r.scenes.every((s) => s.durationSeconds <= 30)).toBe(true);
  expect(r.story?.intendedShotSeconds).toEqual(
    r.scenes.map((s) => s.storyboard?.durationSeconds),
  );
  expect(r.scenes[0].storyboard?.beats[0].dialogue).toBe(
    plans[0].story.dialogue[0].text,
  );
  expect(r.scenes[0].storyboard?.beats[0].speakerCharacterId).toBe(
    plans[0].story.dialogue[0].characterId,
  );
});
it("sizes provider clips from complete dialogue instead of a fixed multiple", async () => {
  queue(
    plans[0].story,
    reviewFor(),
    shotResult({
      ...plans[0],
      scenes: plans[0].scenes.map((s) => ({ ...s, durationSeconds: 9 })),
    }),
  );
  const r = await generateCreativeAssist(input);
  if (r.kind !== "video_plan") throw Error("Wrong kind");
  expect(r.scenes).toHaveLength(3);
  expect(r.scenes.some((s) => s.durationSeconds !== 15)).toBe(true);
  expect(r.scenes.every((s) => s.durationSeconds >= 4 && s.durationSeconds <= 30)).toBe(true);
});
it("limits malformed response repair globally and never drops invalid shots", async () => {
  const bad = shotResult({
    ...plans[0],
    scenes: plans[0].scenes.map((s) => ({ ...s, imagePrompt: "" })),
  });
  calls.responses = [
    {},
    { candidates },
    selection,
    plans[0].story,
    reviewFor(),
    bad,
  ];
  await expect(generateCreativeAssist(input)).rejects.toThrow("INVALID");
  expect(calls.prompts).toHaveLength(6);
});
it("preserves a sibling-only staged parody without inventing a parent or final reaction", async () => {
  const story = {
    ...plans[0].story,
    dialogue: plans[0].story.dialogue.slice(0, 3).map((d, i) => ({
      ...d,
      text: [
        "Mời anh giới thiệu lối vào của căn nhà này.",
        "Cửa chính đây. Anh cúi đầu thấp một chút nữa nhé.",
        "Thấp nữa à? Tôi đang ngồi xổm rồi đấy.",
      ][i],
    })),
    beats: [
      { purpose: "hook" as const, description: "Micro trước nhà gối" },
      { purpose: "payoff" as const, description: "Khách cần bò qua cửa" },
    ],
    endingPlan: {
      mode: "hard_cut" as const,
      stopAfterLine: 3,
      anchorQuote: "Tôi đang ngồi xổm rồi đấy.",
      reason:
        "Câu cuối hạ độ vô lý của căn nhà gối ngay trong format tour nhà.",
    },
  };
  const scenes = plans[0].scenes.slice(0, 3).map((s) => ({
    ...s,
    listenerCharacterIds: [story.dialogue[1].characterId],
  }));
  queue(story, reviewFor(story), shotResult({ ...plans[0], scenes }));
  const r = await generateCreativeAssist({
    ...input,
    selectedCharacterIds: [cast[0].characterId, cast[1].characterId],
  });
  if (r.kind !== "video_plan") throw Error("Wrong kind");
  expect(r.scenes).toHaveLength(2);
  expect(
    r.scenes.flatMap((s) => s.storyboard?.beats || []).map((b) => b.dialogue),
  ).toEqual(story.dialogue.map((d) => d.text));
  expect(
    r.scenes
      .flatMap((s) => s.characterIds)
      .every((id) => [cast[0].characterId, cast[1].characterId].includes(id)),
  ).toBe(true);
});
it("keeps the general idea assist single-call and preserves identities", async () => {
  calls.responses = [
    {
      ideas: [1, 2, 3].map((i) => ({
        title: `Ý tưởng ${i}`,
        idea: `Một ý tưởng cụ thể ${i}`,
        why: "Tình huống phù hợp với gia đình",
      })),
    },
  ];
  await generateCreativeAssist({ ...input, kind: "idea_suggestions" });
  expect(calls.prompts).toHaveLength(1);
  expect(calls.prompts[0]).toContain("family-dialogue-10");
});
it("compiles listener reactions without inventing extra dialogue", () => {
  const story = {
    ...plans[0].story,
    dialogue: plans[0].story.dialogue.slice(0, 4),
    beats: [
      { purpose: "hook" as const, description: "Bắt đầu việc đang làm" },
      { purpose: "payoff" as const, description: "Đến điểm dừng của chuyện" },
    ],
    endingPlan: {
      mode: "hard_cut" as const,
      stopAfterLine: 4,
      anchorQuote: plans[0].story.dialogue[3].text,
      reason:
        "Lượt thứ tư hạ việc kiểm đồ và không cần thêm một cảnh phản ứng.",
    },
  };
  const shots = Object.fromEntries(
    plans[0].scenes.slice(0, 4).map((s, i) => [
      `shot${i + 1}`,
      {
        ...s,
        listenerCharacterIds: [story.dialogue[(i + 1) % 2].characterId],
      },
    ]),
  );
  const r = compileStoryShots(
    { title: "Đối đáp", summary: "Hai bé", shots },
    story,
    cast.map((c) => ({ id: c.characterId, name: c.name })),
  );
  expect(r.scenes).toHaveLength(4);
  expect(r.scenes[0].characterIds).toHaveLength(2);
});

it("does not turn a legacy reaction label into an extra ending shot", () => {
  const unpacked = unpackStory({
    ...plans[0].story,
    endingPlan: {
      mode: "hard_cut",
      stopAfterLine: plans[0].story.dialogue.length,
      anchorQuote: plans[0].story.dialogue.at(-1)!.text,
      reason:
        "Lời thoại cuối đã là điểm dừng nên không cần thêm cảnh phản ứng.",
    },
    beats: {
      hook: "Hai bé gọi bố mẹ dậy",
      turns: ["Bố mẹ đùn đẩy nhau"],
      payoff: "Hai bé quyết định tự đi",
      reaction: "Lặp lại việc hai bé quyết định tự đi",
    },
  }) as (typeof plans)[number]["story"];
  expect(unpacked.beats.at(-1)?.purpose).toBe("payoff");
});

it("stops at the time budget with the current draft checkpoint intact", async () => {
  queue(plans[0].story, reviewFor(), shotResult(plans[0]));
  let time = 1000;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => time);
  let saved: { stage: string; drafts: unknown[] } | undefined;
  try {
    await expect(
      generateCreativeAssist(input, {
        onEditorialProgress: async (trace) => {
          saved = trace;
          if (trace.stage === "review") time += 156000;
        },
      }),
    ).rejects.toThrow("FAMILY_WRITING_TIMEOUT");
    expect(calls.prompts).toHaveLength(3);
    expect(saved?.stage).toBe("review");
    expect(saved?.drafts).toHaveLength(1);
  } finally {
    clock.mockRestore();
  }
});

it("repairs malformed JSON once but does not retry transport failures", async () => {
  calls.responses = [
    new SyntaxError("Unexpected token"),
    { candidates },
    selection,
    plans[0].story,
    reviewFor(),
    shotResult(plans[0]),
  ];
  const result = await generateCreativeAssist(input);
  expect(result.kind).toBe("video_plan");
  expect(calls.prompts).toHaveLength(6);
  calls.prompts = [];
  calls.responses = [new Error("connection closed")];
  await expect(generateCreativeAssist(input)).rejects.toThrow(
    "connection closed",
  );
  expect(calls.prompts).toHaveLength(1);
});
