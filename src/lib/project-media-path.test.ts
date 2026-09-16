import { describe, expect, it } from "vitest";
import { isProjectMediaPath } from "./project-media-path";
import { isProjectMediaPath as workerIsProjectMediaPath } from "../../scripts/short-film/storage.mjs";

const VECTORS = [
  "project-a/films/run/output.mp4", "project-a/a/b/c.wav",
  "project-b/films/output.mp4", "project-a-other/output.mp4",
  "project-a/../project-b/output.mp4", "project-a/%2e%2e/project-b/output.mp4",
  "project-a/..\\project-b/output.mp4", "project-a//output.mp4",
  "project-a/./output.mp4", "project-a/", "project-a", "",
  "https://example.com/output.mp4", "project-a/output.mp4?token=x",
  "project-a/out#put.mp4", "project-a/output.mp4",
  null, undefined, 42,
];

describe("private project media signing boundary", () => {
  it("accepts nested output paths for the authorized project", () => {
    expect(isProjectMediaPath("project-a", "project-a/films/run/output.mp4")).toBe(true);
  });
  it.each([
    "project-b/films/output.mp4", "project-a-other/output.mp4",
    "project-a/../project-b/output.mp4", "project-a/%2e%2e/project-b/output.mp4",
    "project-a/..\\project-b/output.mp4", "project-a//output.mp4",
    "project-a/./output.mp4", "project-a/", "https://example.com/output.mp4",
    "project-a/output.mp4?token=x", null,
  ])("rejects foreign or ambiguous object key %s", (path) => {
    expect(isProjectMediaPath("project-a", path)).toBe(false);
  });
});

/**
 * The media worker runs as .mjs and cannot import this TypeScript module, so it
 * carries a hand-kept copy. A copy that drifts silently re-opens the traversal
 * hole on the unattended automatic pipeline — the one path nobody is watching.
 */
describe("worker copy of the boundary", () => {
  it.each(VECTORS)("agrees with the source of truth on %s", (path) => {
    expect(workerIsProjectMediaPath("project-a", path)).toBe(
      isProjectMediaPath("project-a", path),
    );
  });
});
