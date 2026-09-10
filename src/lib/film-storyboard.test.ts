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
  it("never packs more than two spoken turns into one provider clip", () => {
    expect(storyboardGroups(story.dialogue, false)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
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
      "https://example.test/first-frame.png",
    );
    expect(Object.keys(inputs).sort()).toEqual([
      "duration",
      "generate_audio",
      "image",
      "prompt",
      "resolution",
    ]);
    expect(inputs.duration).toBe(s.storyboard.durationSeconds);
    expect(inputs.generate_audio).toBe(true);
    const prompt = inputs.prompt;
    expect(prompt).toContain(
      `clip nguồn ${s.storyboard.durationSeconds} giây 16:9`,
    );
    expect(prompt).toContain("Chỉ Bánh Bao diễn lời thoại");
    expect(prompt).toContain("Chỉ Đậu Đỏ diễn lời thoại");
    expect(prompt).not.toContain("một shot liên tục");
    expect(() => compileFilmMotion(scene, "fixed", "16:9")).toThrow(
      "không dùng đồng bộ môi một người",
    );
  });
});
