import { describe, expect, it } from "vitest";
import {
  characterFromSuggestion,
  fanpageBrief,
  fieldById,
  projectDraft,
  CONTENT_FIELDS,
} from "./onboarding";

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

describe("suggestionError", () => {
  it("nói bằng tiếng Việt cho các mã lỗi thường gặp", async () => {
    const { suggestionError } = await import("./onboarding");
    expect(suggestionError(401)).toContain("Đăng nhập lại");
    expect(suggestionError(429)).toContain("đang bận");
    expect(suggestionError(503)).toContain("chưa sẵn sàng");
  });

  it("giữ thông điệp tiếng Việt từ server, bỏ thông điệp kỹ thuật", async () => {
    const { suggestionError } = await import("./onboarding");
    expect(suggestionError(500, "Hệ thống AI đang quá tải")).toBe("Hệ thống AI đang quá tải");
    expect(suggestionError(500, "Unauthorized")).toBe("Chưa gợi ý được nhân vật lúc này.");
    expect(suggestionError(0)).toBe("Chưa gợi ý được nhân vật lúc này.");
  });
});
