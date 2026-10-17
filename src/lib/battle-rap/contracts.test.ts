import { describe, expect, it } from "vitest";
import { makeBlocks, normalizeInput, validateBrief, validateStoryboard } from "./contracts";
import { briefFixture, cuesFixture, input, shotsFixture } from "./test-fixtures";
import { alignCues, cuesToSrt, parseSrt } from "./timing";
import { briefPrompt, referencePlan, videoPrompt } from "./prompts";

describe("free battle rap contracts", () => {
  it("requires an idea and bounds the optional runtime", () => {
    expect(() => normalizeInput({ idea: " " })).toThrow();
    expect(() => normalizeInput({ idea: "a", targetSeconds: 999 })).toThrow();
    expect(input.overrides.MC).toBe("");
    expect(input.videoModel).toBe("seedance-2.0-fast");
  });
  it("derives Suno lyrics from immutable speaker lines and English tags", () => {
    const brief = briefFixture();
    expect(brief.suno.lyrics).toContain("[Verse 2: A, spoken]\nĐỏ ra sân rồi");
    expect(brief.cast.map(c => c.role)).toEqual(["A", "B", "MC", "DJ"]);
    const raw = structuredClone(brief); raw.sections[1].tag = "Đoạn rap A";
    expect(() => validateBrief(raw)).toThrow(/tiếng Anh/);
  });
  it("rejects missing DJs, duplicate lines and one-sided battle", () => {
    const missing = briefFixture(); missing.cast.pop();
    expect(() => validateBrief(missing)).toThrow();
    const duplicate = briefFixture(); duplicate.sections[1].lines[0].id = "line-1";
    expect(() => validateBrief(duplicate)).toThrow(/trùng/);
    const oneSided = briefFixture(); oneSided.sections[4].lines[0].speaker = "A";
    expect(() => validateBrief(oneSided)).toThrow(/hai lượt/);
  });
  it("covers fractional final music duration without overshooting provider limits", () => {
    for (const model of ["seedance-2.0-fast", "seedance-2.5"] as const) {
      const blocks = makeBlocks(92.367, model, []);
      expect(blocks[0].start).toBe(0);
      expect(blocks.at(-1)!.end).toBe(92.367);
      for (const [index, block] of blocks.entries()) {
        expect(block.generateSeconds).toBeLessThanOrEqual(model.endsWith("fast") ? 15 : 30);
        expect(block.generateSeconds).toBeGreaterThanOrEqual(4);
        if (index) expect(block.start).toBe(blocks[index - 1].end);
      }
    }
  });
  it("prefers a lyric ending near a block boundary", () => {
    const blocks = makeBlocks(30, "seedance-2.0-fast", [{ start: 12, end: 14.4, text: "x", speaker: "A", lineId: "x" }]);
    expect(blocks[0].end).toBe(14.4);
  });
  it("enforces complete storyboard coverage and the battle ecosystem", () => {
    const blocks = makeBlocks(18, "seedance-2.0-fast", []), shots = shotsFixture();
    expect(validateStoryboard({ shots }, blocks, cuesFixture()).shots).toHaveLength(6);
    expect(() => validateStoryboard({ shots: shots.slice(1) }, blocks, cuesFixture())).toThrow(/khoảng trống/);
    expect(() => validateStoryboard({ shots: shots.map(s => ({ ...s, type: "wide" })) }, blocks, cuesFixture())).toThrow(/Cần đủ/);
  });
  it("rejects a closeup crossing a speaker change", () => {
    const shots = shotsFixture();
    shots[1] = { ...shots[1], type: "performance", performer: "B" };
    expect(() => validateStoryboard({ shots }, makeBlocks(18, "seedance-2.0-fast", []), cuesFixture())).toThrow(/đổi người/);
  });
  it("binds the same four identities and arena into all shot references", () => {
    const brief = briefFixture(), blocks = makeBlocks(18, input.videoModel, []), refs = referencePlan(brief, blocks, shotsFixture());
    expect(refs.find(r => r.id === "stage")!.dependsOn).toEqual(["cast-A", "cast-B", "cast-MC", "cast-DJ"]);
    expect(refs.find(r => r.id === "scene-block-2")!.dependsOn).toContain("stage");
    expect(videoPrompt(brief, blocks[1], shotsFixture(), cuesFixture())).toContain("0.000–3.000s");
    expect(briefPrompt(input)).toContain("Each later turn explicitly answers");
  });
});

describe("actual audio lyric alignment", () => {
  it("roundtrips Vietnamese SRT and assigns the real speaker", () => {
    const cues = cuesFixture(), srt = cuesToSrt(cues);
    expect(parseSrt(srt).map(c => c.text)).toEqual(cues.map(c => c.text));
    const aligned = alignCues(briefFixture(), srt, 18);
    expect(aligned.map(c => c.speaker)).toEqual(cues.map(c => c.speaker));
    expect(aligned[2].start).toBe(6);
  });
  it("accepts provider word timing while stripping non-sung tags", () => {
    const cues = cuesFixture();
    const words = cues.flatMap(c => c.text.split(" ").map((word, i, all) => ({ word: i === 0 ? `[Verse]\n${word}` : word, startS: c.start + i * 2 / all.length, endS: c.start + (i + 1) * 2 / all.length, success: true })));
    expect(alignCues(briefFixture(), words, 18).map(c => c.text)).toEqual(cues.map(c => c.text));
  });
  it("never guesses timing or speaker for unrelated audio", () => {
    expect(() => alignCues(briefFixture(), [], 18)).toThrow(/Chưa có lời/);
    expect(() => alignCues(briefFixture(), [{ text: "unrelated words", start: 0, end: 2 }], 18)).toThrow();
    expect(() => alignCues(briefFixture(), [{ text: "Sẵn sàng chưa", start: -1, end: 2 }], 18)).toThrow(/thời gian/i);
  });
});
