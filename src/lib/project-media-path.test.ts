import { describe, expect, it } from "vitest";
import { isProjectMediaPath } from "./project-media-path";

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
