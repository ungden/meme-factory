import { describe, it, expect } from "vitest";
import { castReferencePicks, MAX_CAST_REFERENCES } from "./contracts";

const character = {
  name: "Bánh Bao",
  imageUrl: "avatar.png",
  referenceImages: ["face.png", "body.png", "look.png", "extra.png"],
  referenceRoles: ["identity_face", "identity_body", "look", "identity_body"],
};

describe("castReferencePicks", () => {
  it("nói rõ từng ảnh dùng để khoá cái gì, thay vì một câu chung", () => {
    const picks = castReferencePicks(character);
    expect(picks.map((p) => p.source)).toEqual(["face.png", "body.png", "look.png"]);
    expect(picks[0].binding).toContain("KHUÔN MẶT");
    expect(picks[1].binding).toContain("VÓC DÁNG");
    expect(picks[2].binding).toContain("TẠO HÌNH");
    // Mỗi ảnh một mô tả riêng: đây chính là chỗ bản cũ gửi ba ảnh giống hệt nhau.
    expect(new Set(picks.map((p) => p.binding)).size).toBe(3);
  });

  it("không gửi quá số ảnh cho phép", () => {
    expect(castReferencePicks(character)).toHaveLength(MAX_CAST_REFERENCES);
  });

  it("giữ thứ tự cũ khi bộ ảnh chưa ghi vai trò", () => {
    const picks = castReferencePicks({ ...character, referenceRoles: undefined });
    expect(picks.map((p) => p.source)).toEqual(["face.png", "body.png", "look.png"]);
  });

  it("quay về ảnh đại diện khi chưa có ảnh chuẩn nào", () => {
    const picks = castReferencePicks({ ...character, referenceImages: [], referenceRoles: [] });
    expect(picks.map((p) => p.source)).toEqual(["avatar.png"]);
  });
});
