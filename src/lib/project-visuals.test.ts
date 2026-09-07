import { describe, expect, it } from "vitest";
import { getProjectCover, getProjectRouteRef } from "./project-visuals";

describe("project visuals", () => {
  it.each([
    ["360 Độ Đẹp", "Về mỹ phẩm, làm đẹp"],
    ["Sớm Thức Dậy Ở Một Nơi Xa", "Phượt, du lịch"],
    ["Tôi là người Sài Gòn", "Sài Gòn"],
    ["Cậu Vàng Finance", "Chứng khoán, đầu tư"],
    ["Dev Memes", "Lập trình"],
    ["Ưng Đen", "Blog cá nhân"],
  ])("does not fabricate a cover from %s", (name, description) => {
    expect(getProjectCover(name, description)).toBeNull();
  });

  it("uses an id when a legacy project has no slug", () => {
    expect(getProjectRouteRef({ id: "legacy-id", slug: "" })).toBe("legacy-id");
    expect(getProjectRouteRef({ id: "new-id", slug: "du-an-moi" })).toBe("du-an-moi");
  });
});
