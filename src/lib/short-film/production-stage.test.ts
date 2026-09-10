import { describe, expect, it, vi } from "vitest";
import type { FilmPlan, FilmScene, FilmTask } from "./contracts";

vi.mock("server-only", () => ({}));

const filmTask = (overrides: Partial<FilmTask>): FilmTask => ({
  id: "task",
  kind: "image",
  scene_id: null,
  scene_version: null,
  plan_version: 1,
  status: "completed",
  input: {},
  result: null,
  error: null,
  approved_at: null,
  created_at: "2026-09-10T00:00:00Z",
  ...overrides,
});

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
    const image = filmTask({
      id: "image-first",
      kind: "image",
      approved_at: "2026-09-10T00:00:00Z",
      scene_id: first.id,
      scene_version: 1,
    });
    const video = filmTask({
      id: "video-first",
      kind: "video",
      approved_at: "2026-09-10T00:00:00Z",
      scene_id: first.id,
      scene_version: 1,
      input: { imageTaskId: image.id },
    });

    expect(nextProductionStage(plan, [image, video])).toEqual({
      stage: "frame",
      sceneIds: [next.id],
    });

    const frame = filmTask({
      id: "frame-next",
      kind: "frame",
      approved_at: "2026-09-10T00:00:00Z",
      scene_id: next.id,
      scene_version: 1,
      input: { videoTaskId: video.id },
      result: { fromTaskId: video.id },
    });
    expect(nextProductionStage(plan, [image, video, frame])).toEqual({
      stage: "video",
      sceneIds: [next.id],
    });
  });

  it("uses the completed render task output when the frozen plan is stale", async () => {
    const { completedRenderOutputId } = await import("./production");
    const tasks = [
      filmTask({
        id: "render-current",
        kind: "render",
        plan_version: 3,
        result: { outputId: "output-current" },
      }),
      filmTask({
        id: "render-old",
        kind: "render",
        plan_version: 2,
        result: { outputId: "output-old" },
      }),
    ];

    expect(completedRenderOutputId(tasks, 3)).toBe("output-current");
    expect(completedRenderOutputId(tasks, 4)).toBeNull();
  });
});
