import { describe, expect, it } from "vitest";
import { dressCast, normalizeWardrobe, wardrobeFaceSource, wardrobeStoragePath } from "./wardrobe";
import type { FilmCast } from "./contracts";

const doDo: FilmCast = {
  characterId: "do",
  name: "Đậu Đỏ",
  description: "Em trai tuổi chập chững",
  personality: "",
  imageUrl: "https://x/face.png",
  referenceImages: ["https://x/face.png", "https://x/body.png", "https://x/back.png"],
  referenceRoles: ["identity_face", "identity_body", "look"],
};

describe("trang phục riêng của tập", () => {
  it("nhận mỗi người một bộ, bỏ mục rỗng model hay trả về", () => {
    expect(
      normalizeWardrobe(
        [{ characterId: "do", outfit: "  vest xanh than,  cà vạt sọc " }, { characterId: "", outfit: "" }],
        ["do", "bao"],
      ),
    ).toEqual([{ characterId: "do", outfit: "vest xanh than, cà vạt sọc" }]);
    expect(normalizeWardrobe(undefined, ["do"])).toEqual([]);
  });

  it("từ chối người ngoài cast, khai trùng và mô tả mơ hồ", () => {
    expect(() => normalizeWardrobe([{ characterId: "x", outfit: "vest xanh than" }], ["do"])).toThrow("STORY_WARDROBE_INVALID");
    expect(() =>
      normalizeWardrobe(
        [
          { characterId: "do", outfit: "vest xanh than" },
          { characterId: "do", outfit: "đồ gấu nâu" },
        ],
        ["do"],
      ),
    ).toThrow("STORY_WARDROBE_INVALID");
    expect(() => normalizeWardrobe([{ characterId: "do", outfit: "vest" }], ["do"])).toThrow("STORY_WARDROBE_INVALID");
  });

  // Ảnh lưng vẫn mặc tạp dề: giữ nó thì Seedance trả bé về đồ mặc định.
  it("giữ cận mặt, thay ảnh thân bằng ảnh mặc đồ mới và bỏ ảnh lưng", () => {
    const dressed = dressCast(doDo, "vest xanh than", "p/film-wardrobe/plan/do-1.png");
    expect(dressed.referenceImages).toEqual(["https://x/face.png", "p/film-wardrobe/plan/do-1.png"]);
    expect(dressed.referenceRoles).toEqual(["identity_face", "identity_body"]);
    expect(dressed.episodeOutfit).toBe("vest xanh than");
  });

  it("vẽ đồ mới từ ảnh cận mặt, không từ ảnh toàn thân", () => {
    expect(wardrobeFaceSource({ ...doDo, imageUrl: "https://x/body.png" })).toBe("https://x/face.png");
    expect(wardrobeFaceSource({ ...doDo, referenceRoles: [] })).toBe("https://x/face.png");
  });

  it("cùng bộ đồ trong cùng tập ra cùng một file", () => {
    const digest = (value: string) => `h${value.length}`.padEnd(20, "0");
    expect(wardrobeStoragePath("p", "plan", "do", "vest xanh", digest)).toBe(
      wardrobeStoragePath("p", "plan", "do", "vest xanh", digest),
    );
  });
});
