import { describe, expect, it } from "vitest";
import { checkTechnicalTask } from "./automatic-qa";
import type { FilmTask } from "./contracts";

function task(
  kind: FilmTask["kind"],
  result: Record<string, unknown>,
): FilmTask {
  return {
    id: crypto.randomUUID(),
    kind,
    scene_id: null,
    scene_version: null,
    plan_version: 1,
    status: "completed",
    input: {},
    result,
    error: null,
    approved_at: null,
    created_at: new Date().toISOString(),
  };
}

describe("automatic short-film evidence checks", () => {
  it("accepts a real timed transcript only under the speech threshold", () => {
    expect(
      checkTechnicalTask(
        task("transcribe", {
          speechError: 0.1,
          segments: [{ start: 0, end: 1, text: "Xin chào" }],
        }),
      ).status,
    ).toBe("passed");
    expect(
      checkTechnicalTask(task("transcribe", { speechError: 0.4, segments: [] }))
        .status,
    ).toBe("needs_review");
  });

  it("requires every final artifact and actual audio/video evidence", () => {
    expect(
      checkTechnicalTask(
        task("render", {
          path: "p.mp4",
          poster: "p.jpg",
          srt: "p.srt",
          duration: 31,
          video: true,
          audio: true,
        }),
      ).status,
    ).toBe("passed");
    expect(
      checkTechnicalTask(
        task("render", {
          path: "p.mp4",
          duration: 31,
          video: true,
          audio: false,
        }),
      ).status,
    ).toBe("failed");
  });

  it("never accepts a visual provider response without visual review", () => {
    expect(checkTechnicalTask(task("image", { path: "p.png" })).status).toBe(
      "needs_review",
    );
  });
});
