import { describe, expect, it } from "vitest";
import {
  channelFromSuggestion,
  fallbackChannelName,
  slugifyProjectName,
  characterFromSuggestion,
  fanpageBrief,
  fieldById,
  projectDraft,
  CONTENT_FIELDS,
} from "./channel-draft";

describe("fieldById", () => {
  it("trả về lĩnh vực đúng id", () => {
    expect(fieldById("an-uong").label).toContain("Ăn uống");
  });

  it("rơi về 'Lĩnh vực khác' khi id lạ hoặc trống", () => {
    expect(fieldById("không-có").id).toBe("khac");
    expect(fieldById(null).id).toBe("khac");
  });
});

describe("projectDraft", () => {
  it("cắt khoảng trắng và ghép mô tả từ lĩnh vực + khán giả", () => {
    const draft = projectDraft({ name: "  Foxy Coffee  ", fieldId: "an-uong", audience: " dân văn phòng " });
    expect(draft.name).toBe("Foxy Coffee");
    expect(draft.description).toBe("Ăn uống · Quán xá. Nói với: dân văn phòng.");
    expect(draft.style_prompt).toContain("Thân thiện");
  });

  it("bỏ phần khán giả khi người dùng không điền", () => {
    expect(projectDraft({ name: "A", fieldId: "an-uong" }).description).toBe("Ăn uống · Quán xá.");
  });
});

describe("fanpageBrief", () => {
  it("nêu tên, lĩnh vực và giọng", () => {
    const brief = fanpageBrief({ name: "Bò & Gấu", fieldId: "giao-duc", audience: "sinh viên năm nhất" });
    expect(brief).toContain("Bò & Gấu");
    expect(brief).toContain("Giáo dục");
    expect(brief).toContain("sinh viên năm nhất");
  });
});

describe("characterFromSuggestion", () => {
  it("dùng role khi thiếu description và why_fit khi thiếu personality", () => {
    expect(characterFromSuggestion({ name: " Cáo ", role: "Chủ quán", why_fit: "Gần gũi" })).toEqual({
      name: "Cáo",
      description: "Chủ quán",
      personality: "Gần gũi",
    });
  });

  it("bỏ qua gợi ý không có tên", () => {
    expect(characterFromSuggestion({ name: "  " })).toBeNull();
  });
});

describe("CONTENT_FIELDS", () => {
  it("mỗi lĩnh vực có đúng 3 gợi ý ý tưởng", () => {
    for (const field of CONTENT_FIELDS) expect(field.ideas).toHaveLength(3);
  });
});

describe("kênh gợi ý từ ý tưởng", () => {
  it("giữ lĩnh vực hợp lệ, lĩnh vực lạ rơi về Lĩnh vực khác", () => {
    expect(channelFromSuggestion({ name: ' "Nhà  Bánh Bao" ', fieldId: "me-va-be", audience: "bố mẹ trẻ" })).toEqual({
      name: "Nhà Bánh Bao",
      fieldId: "me-va-be",
      audience: "bố mẹ trẻ",
    });
    expect(channelFromSuggestion({ name: "X", fieldId: "vu-tru" })?.fieldId).toBe("khac");
    expect(channelFromSuggestion({ name: " " })).toBeNull();
    expect(channelFromSuggestion("rác")).toBeNull();
  });

  it("đưa ý tưởng đầu tiên vào brief gợi ý nhân vật", () => {
    expect(fanpageBrief({ name: "A", fieldId: "khac", idea: "Bé than lương" })).toContain('"Bé than lương"');
    expect(fanpageBrief({ name: "A", fieldId: "khac" })).not.toContain("Nội dung đầu tiên");
  });
});

describe("tên và đường dẫn kênh", () => {
  it("bỏ dấu tiếng Việt trong slug", () => {
    expect(slugifyProjectName("Nhà Đậu Đỏ!")).toBe("nha-dau-do");
    expect(slugifyProjectName("!!!")).toBe("du-an");
  });
  it("lấy vài chữ đầu của ý tưởng khi AI không đặt được tên", () => {
    expect(fallbackChannelName("Bé than lương, của mẹ về ba ngày")).toBe("Kênh Bé than lương của");
    expect(fallbackChannelName("  ")).toBe("Kênh của tôi");
  });
});
