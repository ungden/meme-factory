import { describe, expect, it } from "vitest";
import { castFromSuggestion, channelFromSuggestion, lookArtDirection, projectFields, slugifyProjectName } from "./channel-draft";

describe("kênh gợi ý từ mô tả", () => {
  it("chuẩn hoá chữ, kiểu hình lạ rơi về hoạt hình, tên rỗng thì không gợi ý", () => {
    expect(
      channelFromSuggestion({ name: ' "Nhà  Bánh Bao" ', audience: "bố mẹ trẻ", tone: "hài", positioning: "chuyện nhà", look: "photoreal" }),
    ).toEqual({ name: "Nhà Bánh Bao", audience: "bố mẹ trẻ", tone: "hài", positioning: "chuyện nhà", look: "photoreal" });
    expect(channelFromSuggestion({ name: "X", look: "anime" })?.look).toBe("animated");
    expect(channelFromSuggestion({ name: " " })).toBeNull();
    expect(channelFromSuggestion("rác")).toBeNull();
  });

  it("ghép đúng cột của dự án", () => {
    expect(projectFields({ name: "A", audience: "", tone: "Ấm áp", positioning: "Chuyện bếp", look: "photoreal" })).toEqual({
      name: "A",
      description: "Chuyện bếp",
      audience: null,
      brand_voice: "Ấm áp",
      style_prompt: "Người thật. Ấm áp",
    });
    expect(lookArtDirection("photoreal")).toBe("photoreal_human");
    expect(lookArtDirection("animated")).toBe("soft_3d");
  });
});

describe("nhân vật gợi ý", () => {
  it("bỏ gợi ý thiếu ngoại hình và trùng tên với nhân vật đã có", () => {
    const cast = castFromSuggestion(
      [
        { name: "Đậu Đỏ", description: "Bé gái 5 tuổi, tóc mái ngố, má phúng phính, áo thun vàng", personality: "lém lỉnh" },
        { name: "Bố", description: "ngắn" },
        { name: "Mẹ", description: "Phụ nữ 32 tuổi, tóc buộc thấp, áo len màu kem, đeo kính gọng mảnh" },
        { name: "đậu đỏ", description: "Bé gái khác nhưng trùng tên với bé ở trên, mặc váy hồng" },
      ],
      ["mẹ"],
    );
    expect(cast.map((member) => member.name)).toEqual(["Đậu Đỏ"]);
    expect(castFromSuggestion("x")).toEqual([]);
  });
});

describe("đường dẫn kênh", () => {
  it("bỏ dấu tiếng Việt trong slug", () => {
    expect(slugifyProjectName("Nhà Đậu Đỏ!")).toBe("nha-dau-do");
    expect(slugifyProjectName("!!!")).toBe("du-an");
  });
});
