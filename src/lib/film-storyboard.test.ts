import { describe, it, expect } from "vitest";
import {
  storyboardGroups,
  storyboardDialogue,
  validateStoryboard,
} from "./film-storyboard";
import { compileStoryboards } from "./family-ai-contract";
import { normalizeScene } from "./multiscene-video";
import {
  compileFilmMotion,
  filmVideoInputs,
  type FilmScene,
} from "./short-film/contracts";
import type { Story } from "./family-catalogue";
const characters = [
  { id: "bao", name: "Bánh Bao" },
  { id: "do", name: "Đậu Đỏ" },
];
const story = {
  dialogue: Array.from({ length: 6 }, (_, i) => ({
    characterId: i % 2 ? "do" : "bao",
    text: `Câu ${i + 1} có mười từ để kiểm tra người nói.`,
    action: "Đưa túi",
  })),
  beats: [{ purpose: "payoff", description: "Chốt" }],
} as Story;
const panels = {
  title: "QA",
  summary: "QA",
  shots: Object.fromEntries(
    story.dialogue.map((_, i) => [
      `shot${i + 1}`,
      {
        action: "Đưa túi",
        setting: "Cửa nhà",
        camera: "Pan theo người nói",
        durationSeconds: 5,
        imagePrompt: "Hai chị em trước cửa",
        motionPrompt: "Đưa túi rồi quay nhìn người nghe",
        listenerCharacterIds: [],
      },
    ]),
  ),
};
const compiled = () => compileStoryboards(panels, story, characters);

describe("content-sized Seedance storyboard production", () => {
  it("preserves distinct panel choreography and pauses instead of a generic segment action", () => {
    const source = structuredClone(panels);
    Object.assign(source.shots.shot1, { pauseAfterSeconds: 0.4, motionPrompt: "Đẩy túi về phía em trong lúc nói; em đưa tay đỡ." });
    Object.assign(source.shots.shot2, { pauseAfterSeconds: 0.1, motionPrompt: "Em bắt quai túi, chị buông tay sau tiếp xúc." });
    const first = compileStoryboards(source, story, characters).scenes[0];
    expect(first.storyboard.timingPolicy).toBe("audio_driven_v1");
    expect(first.storyboard.beats.map((beat) => beat.pauseAfterSeconds)).toEqual([0.4, 0.1]);
    expect(first.motionPrompt).toContain(source.shots.shot1.motionPrompt);
    expect(first.motionPrompt).toContain(source.shots.shot2.motionPrompt);
    expect(first.motionPrompt).not.toContain("Thực hiện lần lượt các nhịp storyboard");
    Object.assign(source.shots.shot1, { pauseAfterSeconds: -1 });
    expect(() => compileStoryboards(source, story, characters)).toThrow();
  });
  it("packs contiguous full turns once, with balanced groups and no invented dialogue", () => {
    const result = compiled();
    expect(result.scenes.length).toBeLessThan(story.dialogue.length);
    expect(result.scenes.every((s) => s.durationSeconds >= 4)).toBe(true);
    expect(result.scenes.every((s) => s.durationSeconds <= 30)).toBe(true);
    expect(result.scenes.some((s) => s.durationSeconds !== 15)).toBe(true);
    expect(
      result.scenes.flatMap((s) =>
        s.storyboard.beats.map((b) => [b.speakerCharacterId, b.dialogue]),
      ),
    ).toEqual(story.dialogue.map((l) => [l.characterId, l.text]));
    for (const s of result.scenes) {
      expect(s.imagePrompt).toContain("Bánh Bao");
      expect(s.imagePrompt).toContain("Đậu Đỏ");
      expect(s.speakerCharacterId).toBeNull();
      expect(s.dialogue).toBe(storyboardDialogue(s.storyboard));
      expect(normalizeScene(s).storyboard).toEqual(s.storyboard);
    }
  });
  // Tập "Cát bay vào mắt" mất đoạn cõng con và hồi tưởng vì mọi lượt bắt buộc
  // có lời. Nhịp không lời phải có thời lượng hình riêng và không có người nói.
  it("gives a silent beat screen time and no speaker", () => {
    const silentStory = structuredClone(story);
    silentStory.dialogue[2] = {
      characterId: "bao",
      text: "",
      action: "Hồi tưởng: ông nội cõng Bố hồi bé đi dọc bãi biển",
    };
    const result = compileStoryboards(panels, silentStory, characters);
    const beats = result.scenes.flatMap((scene) => scene.storyboard.beats);
    expect(beats[2]).toMatchObject({ speakerCharacterId: null, dialogue: "" });
    expect(beats[2].endSeconds - beats[2].startSeconds).toBeCloseTo(3.15, 2);
    expect(beats.filter((beat) => beat.dialogue).map((beat) => beat.dialogue)).toEqual(
      silentStory.dialogue.filter((line) => line.text).map((line) => line.text),
    );
    expect(storyboardGroups([{ text: "" }, { text: "Một câu ngắn." }], false).flat()).toEqual([0, 1]);
    const cinematic = compileStoryboards(panels, { ...silentStory, performanceLane: "cinematic_emotion" }, characters);
    const slow = cinematic.scenes.flatMap((scene) => scene.storyboard.beats)[2];
    expect(slow.endSeconds - slow.startSeconds).toBeCloseTo(4.65, 2);
  });

  it("adds a critical footwear requirement when a panel states footwear", () => {
    const source = structuredClone(panels);
    Object.assign(source.shots.shot1, { openingState: "Bố chân trần cầm dép; Đậu Đỏ chân trần." });
    const plan = compileStoryboards(source, story, characters).scenes[0].storyboard.referencePlan!;
    const footwear = plan.requirements.find((item) => item.id === "shot1_footwear");
    expect(footwear).toMatchObject({ importance: "critical" });
    expect(plan.referenceImages.some((image) => image.requirementIds.includes("shot1_footwear"))).toBe(true);
    expect(plan.requirements.some((item) => item.id === "shot2_footwear")).toBe(false);
  });

  it("never packs more than two spoken turns into one provider clip", () => {
    expect(storyboardGroups(story.dialogue, false)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });
  it("keeps readable story evidence as a dedicated provider reference", () => {
    const source = structuredClone(panels);
    Object.assign(source.shots.shot2, {
      requiresOwnSource: false,
      visualRequirements: [
        {
          id: "five_small_bills",
          kind: "count",
          description: "Đậu Đỏ cầm đúng năm tờ một đô.",
          visibleWhen: "reveal",
          importance: "critical",
          legibility: "countable",
        },
        {
          id: "one_dollar_marks",
          kind: "text",
          description: "Cả năm tờ đều đọc được số 1.",
          visibleWhen: "reveal",
          importance: "critical",
          legibility: "readable",
        },
      ],
      referenceImages: [
        {
          id: "red_bean_money_closeup",
          role: "prop",
          purpose: "Cận phần tiền Đậu Đỏ nhận",
          framing: "top-down close-up",
          moment: "Ngay sau khi chia",
          prompt: "Hai bàn tay Đậu Đỏ xòe đúng năm tờ một đô, từng số 1 rõ nét.",
          requirementIds: ["five_small_bills", "one_dollar_marks"],
        },
      ],
    });
    const result = compileStoryboards(source, story, characters);
    expect(result.scenes.length).toBe(3);
    const detailScene = result.scenes[0];
    expect(detailScene.storyboard.beats).toHaveLength(2);
    expect(detailScene.storyboard.referencePlan!.referenceImages[1]).toMatchObject({
      role: "prop",
      purpose: "Cận phần tiền Đậu Đỏ nhận",
    });
    expect(
      detailScene.storyboard.referencePlan!.requirements.map((item) => item.kind),
    ).toEqual(["cast", "count", "text"]);
  });
  it("splits the same complete story into shorter source clips for Seedance 2.0 Fast", () => {
    const longStory = {
      ...story,
      dialogue: story.dialogue.map((line) => ({
        ...line,
        text: `${line.text} thêm nhiều từ để mỗi lượt thoại cần thời gian diễn tự nhiên`,
      })),
    } as Story;
    const longPanels = {
      ...panels,
      shots: Object.fromEntries(
        longStory.dialogue.map((_, i) => [
          `shot${i + 1}`,
          panels.shots[`shot${i + 1}`],
        ]),
      ),
    };
    const standard = compileStoryboards(longPanels, longStory, characters, 30);
    const fast = compileStoryboards(longPanels, longStory, characters, 15);
    expect(fast.scenes.length).toBeGreaterThan(standard.scenes.length);
    expect(fast.scenes.every((scene) => scene.durationSeconds <= 15)).toBe(
      true,
    );
    expect(
      fast.scenes.flatMap((scene) =>
        scene.storyboard.beats.map((beat) => beat.dialogue),
      ),
    ).toEqual(longStory.dialogue.map((line) => line.text));
  });
  it("keeps a planned silent ending inside the final clip and rejects a sentence that cannot fit", () => {
    const groups = storyboardGroups(story.dialogue, true);
    expect(groups.flat()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(groups.at(-1)!.length).toBeGreaterThan(1);
    expect(() =>
      storyboardGroups([{ text: "word ".repeat(80) }], true),
    ).toThrow();
    expect(() =>
      storyboardGroups([{ text: "word ".repeat(90) }], false),
    ).toThrow("TOO_LONG");
  });
  it("rejects foreign speakers, overlap, truncated timeline, stale text and overlong edited speech", () => {
    const s = compiled().scenes[0];
    for (const patch of [
      { speakerCharacterId: "foreign" },
      { startSeconds: 1 },
      { endSeconds: 16 },
      { dialogue: "word ".repeat(80) },
      { dialogue: 123 },
      { pauseAfterSeconds: 3 },
    ])
      expect(() =>
        validateStoryboard(
          {
            ...s.storyboard,
            beats: s.storyboard.beats.map((b, i) =>
              i ? b : { ...b, ...patch },
            ),
          },
          s.characterIds,
        ),
      ).toThrow();
    expect(() => normalizeScene({ ...s, dialogue: "old text" })).toThrow(
      "CONFLICT",
    );
    expect(() => normalizeScene({ ...s, durationSeconds: 5 })).toThrow(
      "CONFLICT",
    );
  });
  it("keeps prop identity stable across editable segments and validates cast continuity", () => {
    const scene = compiled().scenes[0];
    const prop = {
      id: "school_bag_red",
      label: "cặp học sinh",
      color: "đỏ",
      size: "nhỏ",
      marks: "huy hiệu hình bánh bao",
      count: 1,
      holderCharacterId: "bao",
      position: "trên vai Bánh Bao",
    };
    const board = {
      ...scene.storyboard,
      beats: scene.storyboard.beats.map((beat, index) => ({
        ...beat,
        segmentId: `00000000-0000-5000-8000-00000000000${index}`,
        openingState: {
          cast: [
            {
              characterId: beat.speakerCharacterId!,
              presence: "present" as const,
              position: "giữa khung",
            },
          ],
        },
        closingState: { note: "Kết thúc đúng hành động của đoạn." },
        props: [{ ...prop, holderCharacterId: beat.speakerCharacterId }],
      })),
    };
    expect(validateStoryboard(board, scene.characterIds)).toEqual(board);
    expect(() =>
      validateStoryboard(
        {
          ...board,
          beats: board.beats.map((beat, index) =>
            index === 1
              ? {
                  ...beat,
                  props: [{ ...beat.props[0], color: "xanh" }],
                }
              : beat,
          ),
        },
        scene.characterIds,
      ),
    ).toThrow("PROP_IDENTITY_CHANGED");
    expect(() =>
      validateStoryboard(
        {
          ...board,
          beats: board.beats.map((beat, index) =>
            index === 0
              ? {
                  ...beat,
                  openingState: {
                    cast: [{ characterId: "foreign", presence: "present" }],
                  },
                }
              : beat,
          ),
        },
        scene.characterIds,
      ),
    ).toThrow("SEGMENT_STATE_INVALID");
  });
  it("routes each timed line to its own speaker in the native request and blocks single-voice dubbing", () => {
    const s = compiled().scenes[0];
    const scene = {
      storyboard: s.storyboard,
      setting: s.setting,
      cast_snapshot: characters.map((c) => ({
        characterId: c.id,
        name: c.name,
        description: "ref",
      })),
    } as FilmScene;
    const inputs = filmVideoInputs(
      scene,
      "native",
      "16:9",
      "720p",
      {
        urls: ["https://example.test/scene.png", "https://example.test/bao.png"],
        bindings: [
          "@image1 = scene: bố cục cảnh.",
          "@image2 = character: Bánh Bao.",
        ],
      },
    );
    expect(Object.keys(inputs).sort()).toEqual([
      "aspect_ratio",
      "duration",
      "generate_audio",
      "prompt",
      "reference_images",
      "resolution",
    ]);
    expect(inputs.duration).toBe(s.storyboard.durationSeconds);
    expect(inputs.generate_audio).toBe(true);
    expect(inputs.reference_images).toHaveLength(2);
    expect(inputs).not.toHaveProperty("image");
    expect(inputs).not.toHaveProperty("last_image");
    const prompt = inputs.prompt;
    expect(prompt).toContain(
      `clip nguồn ${s.storyboard.durationSeconds} giây 16:9`,
    );
    expect(prompt).toContain("Chỉ Bánh Bao diễn lời thoại");
    expect(prompt).toContain("Chỉ Đậu Đỏ diễn lời thoại");
    expect(prompt).toContain("@image1 = scene");
    expect(prompt).not.toContain("một shot liên tục");
    expect(() => compileFilmMotion(scene, "fixed", "16:9")).toThrow(
      "không dùng đồng bộ môi một người",
    );
  });
});
