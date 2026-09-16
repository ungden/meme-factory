import { describe, expect, it } from "vitest";
import {
  compileStoryShots,
  compileStoryboards,
  storyHasReaction,
  storyShotCount,
  unpackStory,
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
