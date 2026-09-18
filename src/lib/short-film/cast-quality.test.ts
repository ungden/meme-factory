import { describe, expect, it } from "vitest";
import { castIdentityGaps } from "./cast-quality";
import type { FilmCast } from "./contracts";

const base = {
  characterId: "c1",
  name: "Bố",
  description: "",
  personality: "",
  imageUrl: "https://example.invalid/a.png",
  referenceImages: ["https://example.invalid/a.png"],
} satisfies FilmCast;

describe("castIdentityGaps", () => {
  it("báo nhân vật chỉ có ảnh toàn thân", () => {
    const gaps = castIdentityGaps([{ ...base, referenceRoles: ["identity_body"] }]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].name).toBe("Bố");
    expect(gaps[0].message).toContain("cận mặt");
  });

  it("im lặng khi đã có ảnh cận mặt", () => {
    expect(
      castIdentityGaps([{ ...base, referenceRoles: ["identity_face", "identity_body", "look"] }]),
    ).toEqual([]);
  });

  it("bỏ qua khách mời — một ảnh là đúng thiết kế", () => {
    expect(
      castIdentityGaps([{ ...base, isGuest: true, guestKey: "g1", referenceRoles: ["identity_body"] }]),
    ).toEqual([]);
  });

  it("im lặng với kịch bản cũ chưa lưu vai trò ảnh", () => {
    expect(castIdentityGaps([base])).toEqual([]);
    expect(castIdentityGaps([{ ...base, referenceRoles: [] }])).toEqual([]);
  });

  it("gom nhiều nhân vật thiếu ảnh cận mặt", () => {
    const gaps = castIdentityGaps([
      { ...base, referenceRoles: ["identity_body"] },
      { ...base, characterId: "c2", name: "Đậu Đỏ", referenceRoles: ["identity_body"] },
    ]);
    expect(gaps.map((gap) => gap.name)).toEqual(["Bố", "Đậu Đỏ"]);
  });
});
