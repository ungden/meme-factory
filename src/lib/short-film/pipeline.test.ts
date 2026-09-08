import { describe, it, expect } from "vitest";
import { shotDuration, compileFilmMotion, type FilmScene } from "./contracts";
import {
  dimensions,
  parseTranscript,
  speechError,
  subtitles,
  captionSegments,
  checkVideo,
} from "../../../scripts/short-film/media.mjs";
describe("film production invariants", () => {
  it("measures speech before allocating a shot and never cuts a long line", () => {
    expect(shotDuration(6.2, 5)).toBe(7);
    expect(() => shotDuration(30, 5)).toThrow();
    expect(() => shotDuration(NaN, 5)).toThrow();
  });
  it("keeps motion, camera, cast and explicit speech routing", () => {
    const scene = {
      motion_prompt: "đưa chiếc bánh",
      action: "mỉm cười",
      setting: "bếp",
      camera: "cận cảnh",
      dialogue: "Bánh của con!",
      speaker_character_id: "bao",
      cast_snapshot: [
        { characterId: "bao", name: "Bánh Bao", description: "áo vàng" },
      ],
    } as FilmScene;
    const fixed = compileFilmMotion(scene, "fixed", "16:9");
    expect(fixed).toContain("cận cảnh");
    expect(fixed).toContain("đưa chiếc bánh");
    expect(fixed).toContain("16:9");
    expect(fixed).not.toContain("Nói nguyên văn");
    expect(compileFilmMotion(scene, "native", "9:16")).toContain(
      "Bánh của con!",
    );
  });
  it("validates resolution and actual output dimensions instead of build settings", () => {
    expect(dimensions("9:16", "1080p")).toEqual([1080, 1920]);
    expect(() =>
      checkVideo(
        { video: true, audio: true, width: 720, height: 1280, duration: 5 },
        { resolution: "1080p", format: "9:16" },
      ),
    ).toThrow();
  });
  it("rejects missing, reversed or out-of-range ASR timestamps", () => {
    expect(() => parseTranscript({ text: "kịch bản dự kiến" }, 5)).toThrow();
    expect(() =>
      parseTranscript({ segments: [{ text: "Sai", start: 4, end: 2 }] }, 5),
    ).toThrow();
    expect(() =>
      parseTranscript({ segments: [{ text: "Sai", start: 1, end: 9 }] }, 5),
    ).toThrow();
  });
  it("uses actual transcript and detects missing/repeated dialogue", () => {
    expect(speechError("Bánh của con!", "Bánh của con.")).toBe(0);
    expect(
      speechError("Bánh của con", "Bánh của con Bánh của con"),
    ).toBeGreaterThan(0.2);
    const j = parseTranscript(
      {
        words: [
          { word: "Bánh", start: 0.2, end: 0.7 },
          { word: "bao", start: 0.8, end: 1.1 },
        ],
      },
      5,
    );
    expect(subtitles(captionSegments(j.segments))).toContain(
      "00:00:00,200 --> 00:00:01,100",
    );
  });
  it("sanitizes subtitle markup and keeps Vietnamese accents", () => {
    const out = subtitles([{ text: "<Bánh Bao> và Đậu Đỏ", start: 1, end: 2 }]);
    expect(out).toContain("Bánh Bao");
    expect(out).not.toContain("<");
  });
});

describe("stale media dependency handling", () => {
  it("does not reuse a video after its reference image is regenerated", async () => {
    const { currentSceneTask } = await import("./contracts");
    const s = { id: "scene", version: 1, dialogue: "" } as FilmScene;
    const rows = [
      {
        id: "new-image",
        kind: "image",
        status: "completed",
        scene_id: "scene",
        scene_version: 1,
        input: {},
      },
      {
        id: "video",
        kind: "video",
        status: "completed",
        scene_id: "scene",
        scene_version: 1,
        input: { imageTaskId: "old-image" },
      },
      {
        id: "old-image",
        kind: "image",
        status: "completed",
        scene_id: "scene",
        scene_version: 1,
        input: {},
      },
    ] as import("./contracts").FilmTask[];
    expect(currentSceneTask(rows, s, "video", "fixed")).toBeUndefined();
    expect(currentSceneTask(rows, s, "image", "fixed")?.id).toBe("new-image");
  });
});
