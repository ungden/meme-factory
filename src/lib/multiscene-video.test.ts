import { describe, expect, it } from "vitest";
import {
  buildScenePrompt,
  normalizeScene,
  sceneVideoRequest,
  totalSceneDuration,
} from "./multiscene-video";

describe("short-film continuity", () => {
  const cast = [
    {
      characterId: "bao",
      name: "Bánh Bao",
      description: "mascot 3D áo vàng",
      personality: "tinh nghịch",
      imageUrl: "https://media.example/bao.png",
      referenceImages: ["https://media.example/bao.png"],
      assetVersionId: "asset-version-7",
      assetVersion: 7,
    },
  ];

  it("pins the approved character version into every scene prompt", () => {
    const prompt = buildScenePrompt(
      {
        action: "Bánh Bao giấu chiếc bánh",
        setting: "căn bếp",
        dialogue: "Đây là của tớ!",
      },
      cast,
      "bao",
    );
    expect(prompt).toContain("phiên bản đã khoá asset-version-7");
    expect(prompt).toContain("không thay nhân vật hoặc trộn nhận diện");
  });

  it("normalizes duplicate cast and accepts provider durations from 4 to 30", () => {
    const scene = normalizeScene({
      durationSeconds: 7,
      characterIds: ["bao", "bao"],
    });
    expect(scene.durationSeconds).toBe(7);
    expect(scene.characterIds).toEqual(["bao"]);
    expect(() =>
      sceneVideoRequest(
        { prompt: "x", startImageUrl: cast[0].imageUrl, durationSeconds: 31 },
        "720p",
        true,
      ),
    ).toThrow();
  });

  it("adds actual scene durations without stretching clips", () => {
    expect(
      totalSceneDuration([{ duration_seconds: 5 }, { durationSeconds: 10 }]),
    ).toBe(15);
  });

  it("keeps image-to-video requests tied to the approved first frame", () => {
    const request = sceneVideoRequest(
      { prompt: "scene", startImageUrl: cast[0].imageUrl, durationSeconds: 5 },
      "720p",
      true,
    );
    expect(request).toMatchObject({
      mode: "image",
      image: cast[0].imageUrl,
      generateAudio: true,
    });
    expect(request).not.toHaveProperty("aspectRatio");
  });
});
