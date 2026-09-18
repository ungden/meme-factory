import { describe, expect, it } from "vitest";
import { buildPostText, normalizeHashtag, suggestHashtags } from "./post-text";

describe("normalizeHashtag", () => {
  it("bỏ dấu # thừa và khoảng trắng", () => {
    expect(normalizeHashtag("  ##cà phê ")).toBe("#càphê");
    expect(normalizeHashtag("   ")).toBe("");
  });
});

describe("buildPostText", () => {
  it("ghép caption với hashtag mới, cách nhau một dòng trống", () => {
    expect(buildPostText("Cà phê sáng nay", ["#caphe", "quanxa"])).toBe(
      "Cà phê sáng nay\n\n#caphe #quanxa",
    );
  });

  it("không lặp hashtag đã có trong caption, kể cả khác hoa thường", () => {
    expect(buildPostText("Sáng nay #CaPhe ngon", ["#caphe", "#moi"])).toBe(
      "Sáng nay #CaPhe ngon\n\n#moi",
    );
  });

  it("trả đúng caption khi không có hashtag nào để thêm", () => {
    expect(buildPostText("  Chỉ một câu  ")).toBe("Chỉ một câu");
    expect(buildPostText("Chỉ một câu", ["   ", "#"])).toBe("Chỉ một câu");
  });

  it("vẫn dùng được khi chỉ có hashtag", () => {
    expect(buildPostText("", ["#caphe"])).toBe("#caphe");
  });
});

describe("suggestHashtags", () => {
  it("bỏ dấu tiếng Việt và viết liền", () => {
    expect(suggestHashtags("Bò và Gấu Finance")).toEqual(["#boVaGauFinance"]);
    expect(suggestHashtags("Ăn uống · Quán xá")).toEqual(["#anUongQuanXa"]);
  });

  it("bỏ qua nguồn rỗng và loại trùng", () => {
    expect(suggestHashtags("", null, "Foxy", "Foxy")).toEqual(["#foxy"]);
  });
});
