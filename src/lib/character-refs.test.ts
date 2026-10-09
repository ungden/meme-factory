import { describe, expect, it } from "vitest";
import { characterReferenceUrls, isTaggable, referencesFor } from "./character-refs";
import { parseVideoHandoff } from "./home-handoff";

describe("ảnh tham chiếu của nhân vật", () => {
  it("ưu tiên bộ ảnh chuẩn, không có thì dùng ảnh đại diện", () => {
    expect(
      characterReferenceUrls({ id: "a", name: "A", avatarUrl: "https://x/a.png", references: { identity_face: "https://x/f.png", identity_body: "https://x/b.png", look: "https://x/l.png" } }),
    ).toEqual(["https://x/f.png", "https://x/b.png"]);
    expect(characterReferenceUrls({ id: "b", name: "B", avatarUrl: "https://x/b.png" })).toEqual(["https://x/b.png"]);
    expect(isTaggable({ id: "c", name: "C", avatarUrl: null })).toBe(false);
  });

  it("gộp không trùng và cắt theo giới hạn", () => {
    const a = { id: "a", name: "A", avatarUrl: "https://x/1.png" };
    expect(referencesFor([a, a, { id: "b", name: "B", avatarUrl: "https://x/2.png" }], 1)).toEqual(["https://x/1.png"]);
  });
});

describe("chuyển video sang trang video", () => {
  it("chỉ nhận ảnh https và bỏ lượt quá cũ", () => {
    const raw = JSON.stringify({ prompt: "Bé nhảy", references: ["https://x/1.png", "javascript:x", 3], at: 1000 });
    expect(parseVideoHandoff(raw, 2000)).toEqual({ prompt: "Bé nhảy", references: ["https://x/1.png"], at: 1000 });
    expect(parseVideoHandoff(raw, 1000 + 11 * 60_000)).toBeNull();
  });
});
