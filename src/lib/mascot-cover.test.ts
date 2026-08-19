import { describe, expect, it } from "vitest";
import { resolveMascotCover } from "./mascot-cover";

const ready = { image_url: "https://cdn/ready.png", status: "ready" };
const draft = { image_url: "https://cdn/draft.png", status: "draft" };
const archived = { image_url: "https://cdn/archived.png", status: "archived" };

describe("resolveMascotCover", () => {
  it("prefers the avatar", () => {
    expect(resolveMascotCover({ avatarUrl: "https://cdn/avatar.png", baseImages: [ready] })).toBe(
      "https://cdn/avatar.png"
    );
  });

  it("prefers an approved base image over a draft", () => {
    expect(resolveMascotCover({ baseImages: [draft, ready] })).toBe("https://cdn/ready.png");
  });

  it("still shows a draft when nothing is approved yet", () => {
    // The regression this guards: a fresh mascot has drafts only and rendered blank.
    expect(resolveMascotCover({ baseImages: [draft] })).toBe("https://cdn/draft.png");
  });

  it("never shows an archived image", () => {
    expect(resolveMascotCover({ baseImages: [archived] })).toBeNull();
  });

  it("falls back to a raw pose", () => {
    expect(resolveMascotCover({ baseImages: [], poses: [{ image_url: "https://cdn/pose.png" }] })).toBe(
      "https://cdn/pose.png"
    );
  });

  it("ignores mock placeholders that do not exist on disk", () => {
    expect(
      resolveMascotCover({ avatarUrl: "/mock/bull.png", poses: [{ image_url: "/mock/bull-happy.png" }] })
    ).toBeNull();
  });

  it("returns null when there is nothing to show", () => {
    expect(resolveMascotCover({})).toBeNull();
  });
});
