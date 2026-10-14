import { describe, expect, it } from "vitest";
import { arrangeCharacters, characterUsage, foldName, usageScore } from "./character-list";
import type { PackCharacter } from "./character-pack";

function character(id: string, name: string, locked = false): PackCharacter {
  return {
    id,
    name,
    description: "",
    avatarUrl: null,
    medium: "animated",
    ready: locked,
    packComplete: locked,
    references: {},
    drafts: {},
  };
}

// Thứ tự tạo: Bò cũ nhất, Đậu mới nhất.
const list = [character("a", "Bò"), character("b", "Mèo Mướp", true), character("c", "an"), character("d", "Đậu", true)];
const ids = (rows: PackCharacter[]) => rows.map((row) => row.id);
const none = new Map();

describe("foldName", () => {
  it("bỏ dấu và đ để gõ không dấu vẫn tìm ra", () => {
    expect(foldName("  Mèo Đậu ")).toBe("meo dau");
  });
});

describe("arrangeCharacters", () => {
  it("tìm theo tên, không phân biệt dấu và hoa thường", () => {
    expect(ids(arrangeCharacters(list, { query: "meo", filter: "all", sort: "newest", usage: none }))).toEqual(["b"]);
    expect(ids(arrangeCharacters(list, { query: "DAU", filter: "all", sort: "newest", usage: none }))).toEqual(["d"]);
  });

  it("lọc đã chốt bộ ảnh và chưa xong", () => {
    expect(ids(arrangeCharacters(list, { query: "", filter: "locked", sort: "newest", usage: none }))).toEqual(["d", "b"]);
    expect(ids(arrangeCharacters(list, { query: "", filter: "unfinished", sort: "newest", usage: none }))).toEqual(["c", "a"]);
  });

  it("mới nhất là đảo thứ tự tạo", () => {
    expect(ids(arrangeCharacters(list, { query: "", filter: "all", sort: "newest", usage: none }))).toEqual(["d", "c", "b", "a"]);
  });

  it("tên A–Z theo cách xếp tiếng Việt", () => {
    expect(ids(arrangeCharacters(list, { query: "", filter: "all", sort: "name", usage: none }))).toEqual(["c", "a", "d", "b"]);
  });

  it("dùng nhiều nhất: meme đã làm nặng hơn số biểu cảm, bằng nhau giữ thứ tự tạo", () => {
    const usage = characterUsage(
      [
        { id: "i1", character_id: "c" },
        { id: "i2", character_id: "c" },
        { id: "i3", character_id: "c" },
        { id: "i4", character_id: "d" },
        { id: "i5", character_id: null },
      ],
      [{ base_image_id: "i4" }, { base_image_id: null }, {}],
    );
    expect(usage.get("c")).toEqual({ ready: 3, memes: 0, baseId: "i1" });
    expect(usageScore(usage.get("d"))).toBe(11);
    expect(ids(arrangeCharacters(list, { query: "", filter: "all", sort: "usage", usage }))).toEqual(["d", "c", "a", "b"]);
  });

  it("không đổi danh sách gốc", () => {
    const copy = [...list];
    arrangeCharacters(list, { query: "", filter: "all", sort: "newest", usage: none });
    expect(list).toEqual(copy);
  });
});
