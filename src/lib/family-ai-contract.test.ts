import { describe, expect, it } from "vitest";
import {
  compileStoryShots,
  compileStoryboards,
  mentionedCharacters,
  normalizeShotResponse,
  shotResponseSchema,
  storyHasReaction,
  storyShotCount,
  unpackStory,
  framingCanShowFeet,
  footwearClause,
  legibleTextRequests,
} from "./family-ai-contract";
import type { Story } from "./family-catalogue";

const CAST = [
  { id: "char-a", name: "Bánh Bao" },
  { id: "char-b", name: "Đậu Đỏ" },
];

function story(overrides: Partial<Story> = {}): Story {
  return {
    profileVersion: 11,
    series: "Luật của tụi con",
    situation: "Hai chị em chia bánh",
    mechanism: "Luật vô lý được theo đuổi nhất quán",
    outcome: "Cả hai cùng giữ luật",
    wants: [
      { characterId: "char-a", want: "Được phần to hơn" },
      { characterId: "char-b", want: "Không bị thiệt" },
    ],
    beats: [
      { purpose: "hook", description: "Bánh Bao đặt luật chia bánh" },
      { purpose: "payoff", description: "Luật quay lại hại chính người đặt" },
    ],
    payoff: "Luật quay lại hại chính người đặt",
    setup: "Trên bàn ăn có đúng một cái bánh",
    caption: "Luật là luật",
    dialogue: [
      { characterId: "char-a", text: "Ai cắt thì người kia chọn trước", action: "giơ dao" },
      { characterId: "char-b", text: "Vậy chị cắt đi", action: "khoanh tay" },
    ],
    ...overrides,
  } as Story;
}

function shot(overrides: Record<string, unknown> = {}) {
  return {
    action: "Bánh Bao giơ con dao nhựa lên",
    setting: "Bàn ăn sáng",
    camera: "Trung cảnh ngang tầm mắt",
    imagePrompt: "Hai chị em bên đĩa bánh",
    motionPrompt: "Bánh Bao giơ dao, Đậu Đỏ khoanh tay",
    durationSeconds: 5,
    ...overrides,
  };
}

function reply(count: number, overrides: Record<string, Record<string, unknown>> = {}) {
  const shots: Record<string, Record<string, unknown>> = {};
  for (let i = 1; i <= count; i++) shots[`shot${i}`] = { ...shot(), ...overrides[`shot${i}`] };
  return { title: "Luật chia bánh", summary: "Hai chị em đặt luật", shots };
}

describe("storyShotCount", () => {
  it("counts one panel per spoken line", () => {
    expect(storyShotCount(story())).toBe(2);
  });

  it("adds a panel when the story ends on a silent reaction", () => {
    const withReaction = story({
      beats: [
        { purpose: "hook", description: "Bánh Bao đặt luật" },
        { purpose: "payoff", description: "Luật quay lại" },
        { purpose: "reaction", description: "Bánh Bao đơ người" },
      ],
    });
    expect(storyHasReaction(withReaction)).toBe(true);
    expect(storyShotCount(withReaction)).toBe(3);
  });
});

describe("unpackStory", () => {
  it("expands the model's hook/turns/payoff shape into an ordered beat list", () => {
    const unpacked = unpackStory({
      beats: { hook: "Mở", turns: ["Xoay một", "Xoay hai"], payoff: "Chốt", reaction: "" },
    }) as Story;
    expect(unpacked.beats.map((b) => b.purpose)).toEqual([
      "hook", "turn", "turn", "payoff",
    ]);
    expect(unpacked.beats[1].description).toBe("Xoay một");
  });

  it("drops empty turns rather than emitting blank beats", () => {
    const unpacked = unpackStory({
      beats: { hook: "Mở", turns: ["", "   ", "Thật"], payoff: "Chốt", reaction: "" },
    }) as Story;
    expect(unpacked.beats.filter((b) => b.purpose === "turn")).toHaveLength(1);
  });

  // The legacy free-text reaction field usually just repeats the last line, so
  // it must not silently become an extra paid shot.
  it("only adds a reaction beat for an explicit silent_reaction ending", () => {
    const withoutPlan = unpackStory({
      beats: { hook: "Mở", turns: [], payoff: "Chốt", reaction: "Cả hai nhìn nhau" },
    }) as Story;
    expect(withoutPlan.beats.some((b) => b.purpose === "reaction")).toBe(false);

    const withPlan = unpackStory({
      endingPlan: { mode: "silent_reaction" },
      beats: { hook: "Mở", turns: [], payoff: "Chốt", reaction: "Cả hai nhìn nhau" },
    }) as Story;
    expect(withPlan.beats.at(-1)?.purpose).toBe("reaction");
  });

  it("passes an already-unpacked story through untouched", () => {
    const already = story();
    expect(unpackStory(already)).toBe(already);
  });

  it("passes unusable input through instead of throwing", () => {
    expect(unpackStory(null)).toBeNull();
    expect(unpackStory({ beats: { hook: "x" } })).toEqual({ beats: { hook: "x" } });
  });
});

describe("shotResponseSchema", () => {
  // Gemini từ chối (400 INVALID_ARGUMENT) schema chép panel thành shot1..shotN
  // hoặc có minItems/maxItems lồng trong panel, kể cả khi chỉ có một panel.
  it("describes the panel once as an array item without nested array bounds", () => {
    const schema = shotResponseSchema(story(), ["char-a", "char-b"]) as unknown as {
      properties: { shots: { type: string; items: unknown } };
    };
    expect(schema.properties.shots.type).toBe("array");
    const item = JSON.stringify(schema.properties.shots.items);
    expect(item).not.toMatch(/minItems|maxItems/);
    expect(JSON.stringify(schema)).not.toMatch(/"shot1"/);
  });
});

describe("normalizeShotResponse", () => {
  it("maps an array reply onto shot1..shotN and caps list sizes", () => {
    const normalized = normalizeShotResponse({
      title: "t",
      shots: [
        { ...shot(), referenceImages: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}` })) },
        { ...shot(), visualRequirements: [] },
      ],
    }) as { shots: Record<string, Record<string, unknown>> };
    expect(Object.keys(normalized.shots)).toEqual(["shot1", "shot2"]);
    expect(normalized.shots.shot1.referenceImages).toHaveLength(4);
    expect(normalized.shots.shot2.visualRequirements).toBeUndefined();
  });

  // Model hay viết lại cùng đạo cụ với chữ hơi khác hoặc id có dấu; trước đây
  // validator storyboard chặn cả tập vì những khác biệt vô nghĩa này.
  it("keeps a prop's identity from its first appearance and slugs its id", () => {
    const first = {
      id: "hộp bánh",
      label: "Hộp nhựa",
      color: "Trong suốt",
      size: "Vừa",
      marks: "",
      count: 1,
      holderCharacterId: "char-a",
      position: "Trên tay",
    };
    const normalized = normalizeShotResponse(
      {
        shots: [
          { ...shot(), props: [{ ...first, id: "hop-banh", color: "trong suốt", count: 0, position: "" }] },
        ],
      },
      [{ props: [first] }],
    ) as { shots: Record<string, { props: Record<string, unknown>[] }> };
    expect(normalized.shots.shot1.props[0]).toMatchObject({
      id: "hop-banh",
      color: "Trong suốt",
      count: 1,
      position: "trong khung",
    });
  });
});

describe("mentionedCharacters", () => {
  // Tập "Cát bay vào mắt": cảnh "Bố cõng Đậu Đỏ" chỉ gắn Bố nên ảnh vẽ một bé khác,
  // và cảnh hồi tưởng thiếu "Bố hồi bé".
  const people = [
    { id: "bo", name: "Bố" },
    { id: "do", name: "Đậu Đỏ" },
    { id: "ong", name: "Ông nội" },
    { id: "bo-be", name: "Bố hồi bé" },
  ];
  it("finds everyone named in an action, preferring the longer name", () => {
    expect(mentionedCharacters("Bố đang cõng Đậu Đỏ, dừng lại.", people)).toEqual(["bo", "do"]);
    expect(mentionedCharacters("Hồi tưởng: Ông nội cõng Bố hồi bé đi dọc bãi biển.", people)).toEqual(["ong", "bo-be"]);
    expect(mentionedCharacters("Sóng vỗ vào bờ cát.", people)).toEqual([]);
  });
});

describe("compileStoryShots", () => {
  it("binds each panel to its spoken line and speaker", () => {
    const compiled = compileStoryShots(reply(2), story(), CAST);
    expect(compiled.scenes).toHaveLength(2);
    expect(compiled.scenes[0].speakerCharacterId).toBe("char-a");
    expect(compiled.scenes[0].dialogue).toBe("Ai cắt thì người kia chọn trước");
    expect(compiled.scenes[1].speakerCharacterId).toBe("char-b");
  });

  // This validation is the only thing between a malformed Gemini reply and a
  // paid render, so each missing field has to be refused.
  it.each(["action", "setting", "camera", "imagePrompt", "motionPrompt"])(
    "refuses a panel missing %s",
    (field) => {
      expect(() =>
        compileStoryShots(reply(2, { shot2: { [field]: "" } }), story(), CAST),
      ).toThrow(/STORY_SHOT_2_INVALID/);
    },
  );

  it("casts the people named in a silent beat's action", () => {
    const silent = story({
      dialogue: [
        { characterId: "char-a", text: "", action: "Bánh Bao cõng Đậu Đỏ đi dọc bờ biển lúc hoàng hôn" },
        { characterId: "char-b", text: "Vậy chị cắt đi", action: "khoanh tay" },
      ],
    });
    const compiled = compileStoryShots(reply(2), silent, CAST);
    expect(compiled.scenes[0].speakerCharacterId).toBeNull();
    expect(compiled.scenes[0].characterIds).toEqual(["char-a", "char-b"]);
  });

  it("accepts panels returned as an array", () => {
    const { shots } = reply(2);
    const compiled = compileStoryShots(
      { title: "t", summary: "s", shots: [shots.shot1, shots.shot2] },
      story(),
      CAST,
    );
    expect(compiled.scenes.map((scene) => scene.speakerCharacterId)).toEqual([
      "char-a",
      "char-b",
    ]);
  });

  it("refuses a reply with the wrong number of panels", () => {
    expect(() => compileStoryShots(reply(1), story(), CAST)).toThrow(
      "STORY_SHOTS_MISSING",
    );
    expect(() => compileStoryShots(reply(3), story(), CAST)).toThrow(
      "STORY_SHOTS_MISSING",
    );
  });

  it("names the speaker in the image prompt so only one face talks", () => {
    const compiled = compileStoryShots(reply(2), story(), CAST);
    expect(compiled.scenes[0].imagePrompt).toContain("Bánh Bao");
    expect(compiled.scenes[0].imagePrompt).toContain("người duy nhất nói");
  });

  it("keeps listeners the director named, and only real cast members", () => {
    const compiled = compileStoryShots(
      reply(2, { shot1: { listenerCharacterIds: ["char-b", "ghost", "char-a"] } }),
      story(),
      CAST,
    );
    // Speaker first, the invented id dropped, the speaker not duplicated.
    expect(compiled.scenes[0].characterIds).toEqual(["char-a", "char-b"]);
  });
});

describe("compileStoryboards", () => {
  it("produces beats that carry the dialogue in order", () => {
    const board = compileStoryboards(reply(2), story(), CAST, 30);
    const spoken = board.scenes.flatMap((s) => s.storyboard?.beats || []);
    expect(spoken.map((b) => b.dialogue)).toEqual([
      "Ai cắt thì người kia chọn trước",
      "Vậy chị cắt đi",
    ]);
  });

  it("gives every source clip a provider-legal duration", () => {
    const board = compileStoryboards(reply(2), story(), CAST, 30);
    for (const scene of board.scenes) {
      const duration = scene.storyboard?.durationSeconds ?? 0;
      expect(duration).toBeGreaterThanOrEqual(4);
      expect(duration).toBeLessThanOrEqual(30);
      expect(Number.isInteger(duration)).toBe(true);
    }
  });

  // requiresOwnSource is how the director says a panel cannot share a
  // continuous clip with its neighbour.
  it("splits a group when a panel demands its own source clip", () => {
    const shared = compileStoryboards(reply(2), story(), CAST, 30);
    const split = compileStoryboards(
      reply(2, { shot2: { requiresOwnSource: true } }),
      story(),
      CAST,
      30,
    );
    expect(split.scenes.length).toBeGreaterThan(shared.scenes.length);
  });

  it("refuses to plan a clip longer than the model allows", () => {
    const long = story({
      dialogue: [
        {
          characterId: "char-a",
          text: Array.from({ length: 60 }, () => "từ").join(" "),
          action: "nói dài",
        },
        { characterId: "char-b", text: "Ừ", action: "gật" },
      ],
    });
    expect(() => compileStoryboards(reply(2), long, CAST, 15)).toThrow(
      /STORYBOARD_LINE_TOO_LONG|STORYBOARD_GROUP_TOO_LONG/,
    );
  });

  it("packs content at the start so the render can cut the tail", () => {
    const board = compileStoryboards(reply(2), story(), CAST, 30);
    for (const scene of board.scenes) {
      expect(scene.storyboard?.beats[0].startSeconds).toBe(0);
      const content = scene.storyboard?.contentEndSeconds ?? Infinity;
      expect(content).toBeLessThanOrEqual(scene.storyboard?.durationSeconds ?? 0);
    }
  });
});

describe("framingCanShowFeet", () => {
  it("bỏ yêu cầu giày dép ở khung cắt ngang người", () => {
    for (const camera of [
      "Medium shot, ngang tầm mắt",
      "Close-up khuôn mặt",
      "Cận cảnh tay cầm muỗng",
      "Trung cảnh hai chị em",
      "Bán thân, máy tĩnh",
      "Over-the-shoulder từ phía sau",
    ])
      expect(framingCanShowFeet(camera)).toBe(false);
  });

  it("giữ yêu cầu ở khung rộng và khi khung không ghi rõ", () => {
    for (const camera of ["Wide shot cả căn bếp", "Toàn cảnh phòng khách", "Khung vừa", ""])
      expect(framingCanShowFeet(camera)).toBe(true);
  });
});

describe("footwearClause", () => {
  it("chỉ giữ câu nói về giày dép, bỏ phần tả ai đứng đâu", () => {
    expect(
      footwearClause(
        "Bánh Bao đứng trước tủ lạnh, vẻ mặt nghiêm túc. Đậu Đỏ đứng bên cạnh, vẻ mặt thắc mắc. Cả hai đều đi chân trần.",
      ),
    ).toBe("Cả hai đều đi chân trần.");
  });

  it("gộp nhiều câu khi trạng thái nhắc giày dép ở nhiều chỗ", () => {
    expect(footwearClause("Bố xỏ dép lê. Trời mưa. Đậu Đỏ chân trần chạy theo.")).toBe(
      "Bố xỏ dép lê. Đậu Đỏ chân trần chạy theo.",
    );
  });

  it("giữ nguyên khi cả đoạn chỉ có một câu", () => {
    expect(footwearClause("Cả nhà đi chân trần trên cát")).toBe("Cả nhà đi chân trần trên cát");
  });
});

describe("legibleTextRequests", () => {
  it("bắt được mẩu chữ mà mô tả ảnh đòi in trên đạo cụ", () => {
    expect(
      legibleTextRequests(
        "Medium shot of Đậu Đỏ near a fridge with a 'CẤM MỞ' sign taped to the door.",
        undefined,
      ),
    ).toEqual(["CẤM MỞ"]);
  });

  it("gộp chữ ghi trên đạo cụ và bỏ bản trùng", () => {
    expect(
      legibleTextRequests('Tấm biển "CẤM MỞ" dán trên cửa tủ.', [
        { marks: "CẤM MỞ" },
        { marks: "20.000đ" },
      ]),
    ).toEqual(["CẤM MỞ", "20.000đ"]);
  });

  it("bỏ qua câu mô tả dài nằm trong ngoặc kép", () => {
    expect(
      legibleTextRequests(
        'Khung mở "một gian bếp gia đình ấm cúng với ánh nắng buổi sáng tràn qua cửa sổ" nhìn từ xa.',
        undefined,
      ),
    ).toEqual([]);
  });

  it("không đòi đọc gì khi mô tả không có chữ nào trong ngoặc", () => {
    expect(legibleTextRequests("Bánh Bao đứng trước tủ lạnh.", [])).toEqual([]);
  });

  it("bỏ qua tên nhân vật trong ngoặc kép", () => {
    expect(
      legibleTextRequests(
        'Medium shot của “Bánh Bao” và “Đậu Đỏ” đứng cạnh tủ lạnh, không có vật gì mang chữ.',
        [],
      ),
    ).toEqual([]);
  });
});
