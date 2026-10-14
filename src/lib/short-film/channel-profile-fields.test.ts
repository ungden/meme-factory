import { describe, expect, it } from "vitest";
import { missingProfileFields, projectProfileFields, resolveProfileFields } from "./channel-profile-fields";

describe("projectProfileFields", () => {
  it("reads the three channel columns under the profile's names", () => {
    expect(projectProfileFields({ audience: " Bố mẹ trẻ ", brand_voice: "Hài", description: "Chuyện bếp" })).toEqual({
      audience: "Bố mẹ trẻ",
      tone: "Hài",
      positioning: "Chuyện bếp",
    });
    expect(projectProfileFields(null)).toEqual({ audience: "", tone: "", positioning: "" });
  });
});

describe("resolveProfileFields", () => {
  const project = { audience: "Dân văn phòng", brand_voice: "", description: "Chuyện công sở" };
  const current = { audience: "Cũ", tone: "Ấm áp", positioning: "Cũ" };

  it("prefers what the user just typed, then the channel, then the old profile", () => {
    expect(resolveProfileFields({ positioning: "Mới" }, project, current)).toEqual({
      audience: "Dân văn phòng",
      tone: "Ấm áp",
      positioning: "Mới",
    });
  });

  it("builds a whole profile from channel creation alone", () => {
    expect(
      resolveProfileFields({}, { audience: "Học sinh", brand_voice: "Nhí nhảnh", description: "Chuyện lớp" }, null),
    ).toEqual({ audience: "Học sinh", tone: "Nhí nhảnh", positioning: "Chuyện lớp" });
  });

  it("ignores blank or non-text input", () => {
    expect(resolveProfileFields({ audience: "   ", tone: 42 }, project, current).audience).toBe("Dân văn phòng");
    expect(resolveProfileFields({ tone: 42 }, project, current).tone).toBe("Ấm áp");
  });

  it("caps each field", () => {
    expect(resolveProfileFields({ audience: "x".repeat(500) }, null, null).audience).toHaveLength(240);
  });
});

describe("missingProfileFields", () => {
  it("lists only what is still empty, so the studio asks nothing twice", () => {
    expect(missingProfileFields({ audience: "A", tone: " ", positioning: "" })).toEqual(["tone", "positioning"]);
    expect(missingProfileFields({ audience: "A", tone: "B", positioning: "C" })).toEqual([]);
    expect(missingProfileFields(null)).toEqual(["audience", "tone", "positioning"]);
  });
});
