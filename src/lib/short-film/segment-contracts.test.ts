import { describe, expect, it } from "vitest";
import { historicalSceneSource } from "./segment-contracts";
import type { FilmTask } from "./contracts";

const scene = { id: "scene-1", version: 3 };

function completed(
  id: string,
  kind: FilmTask["kind"],
  sceneVersion: number,
): FilmTask {
  return {
    id,
    kind,
    scene_id: scene.id,
    scene_version: sceneVersion,
    status: "completed",
    result: { path: `films/${id}.mp4` },
    plan_version: 1,
    input: {},
    error: null,
    approved_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
  } as unknown as FilmTask;
}

describe("historical segment footage", () => {
  it("uses the newest completed dubbed source when the script revision has no new media", () => {
    const source = historicalSceneSource(
      [
        completed("video-v2", "video", 2),
        completed("dub-v2", "dub", 2),
        completed("dub-v1", "dub", 1),
      ],
      scene.id,
      scene.version,
    );

    expect(source?.id).toBe("dub-v2");
  });

  it("never borrows footage from another scene or a future revision", () => {
    const otherScene = {
      ...completed("other", "dub", 3),
      scene_id: "scene-2",
    } as FilmTask;
    const future = completed("future", "dub", 4);
    const source = historicalSceneSource(
      [otherScene, future, completed("video-v1", "video", 1)],
      scene.id,
      scene.version,
    );

    expect(source?.id).toBe("video-v1");
  });
});
