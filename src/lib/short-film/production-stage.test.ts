import { describe, expect, it, vi } from "vitest";
import type { FilmPlan, FilmScene, FilmTask } from "./contracts";

vi.mock("server-only", () => ({}));

describe("automatic production continuity", () => {
  it("extracts an accepted previous clip before producing a continuous scene", async () => {
    const { nextProductionStage } = await import("./production");
    const first = {
      id: "first",
      version: 1,
      scene_index: 0,
      dialogue: "",
      follows_previous: false,
    } as FilmScene;
    const next = {
      id: "next",
      version: 1,
      scene_index: 1,
      dialogue: "",
      follows_previous: true,
    } as FilmScene;
    const plan = {
      version: 1,
      audio_mode: "dubbed",
      video_plan_scenes: [first, next],
    } as FilmPlan;
    const image = {
      id: "image-first",
      kind: "image",
      status: "completed",
      approved_at: "2026-09-10T00:00:00Z",
      scene_id: first.id,
      scene_version: 1,
      input: {},
    } as FilmTask;
    const video = {
      id: "video-first",
      kind: "video",
      status: "completed",
      approved_at: "2026-09-10T00:00:00Z",
      scene_id: first.id,
      scene_version: 1,
      input: { imageTaskId: image.id },
    } as FilmTask;

    expect(nextProductionStage(plan, [image, video])).toEqual({
      stage: "frame",
      sceneIds: [next.id],
    });

    const frame = {
      id: "frame-next",
      kind: "frame",
      status: "completed",
      approved_at: "2026-09-10T00:00:00Z",
      scene_id: next.id,
      scene_version: 1,
      input: { videoTaskId: video.id },
      result: { fromTaskId: video.id },
    } as FilmTask;
    expect(nextProductionStage(plan, [image, video, frame])).toEqual({
      stage: "video",
      sceneIds: [next.id],
    });
  });
});
