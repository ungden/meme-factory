import { describe, expect, it } from "vitest";
import { buildScenePrompt, normalizeScene, sceneVideoRequest, totalSceneDuration } from "./multiscene-video";

describe("multi-scene video", () => {
  it("creates a single-speaker native-audio prompt from a frozen cast", () => {
    const prompt = buildScenePrompt({ dialogue: "Chào mọi người!", action: "vẫy tay", setting: "quán cà phê" }, [{ characterId: "a", name: "AIDA", description: "mascot 3D xanh", personality: "vui", imageUrl: "https://example.com/a.png" }], "a");
    expect(prompt).toContain("AIDA là người nói duy nhất");
    expect(prompt).toContain("Không thêm chữ");
  });

  it("keeps only supported provider durations", () => {
    const scene = normalizeScene({ durationSeconds: 7, characterIds: ["a", "a"] });
    expect(scene.durationSeconds).toBe(5);
    expect(scene.characterIds).toEqual(["a"]);
    expect(() => sceneVideoRequest({ prompt: "x", startImageUrl: "https://example.com/x.jpg", durationSeconds: 7 }, "720p", true)).toThrow();
  });

  it("adds actual scene durations without stretching clips", () => {
    expect(totalSceneDuration([{ duration_seconds: 5 }, { durationSeconds: 10 }])).toBe(15);
  });
});
