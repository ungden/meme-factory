import { describe, expect, it } from "vitest";
import { getProjectCover, getProjectRouteRef } from "./project-visuals";

describe("project visuals", () => {
  it.each([
    ["360 Độ Đẹp", "Về mỹ phẩm, làm đẹp", "/media-studio/project-beauty.webp"],
    ["Sớm Thức Dậy Ở Một Nơi Xa", "Phượt, du lịch", "/media-studio/project-travel.webp"],
    ["Tôi là người Sài Gòn", "Sài Gòn", "/media-studio/project-saigon.webp"],
    ["Cậu Vàng Finance", "Chứng khoán, đầu tư", "/media-studio/project-bull-bear.png"],
    ["Dev Memes", "Lập trình", "/media-studio/project-dev-memes.png"],
    ["Ưng Đen", "Blog cá nhân", "/media-studio/project-creator-ungden.webp"],
  ])("maps %s to a relevant cover", (name, description, expected) => {
    expect(getProjectCover(name, description)).toBe(expected);
  });

  it("uses an id when a legacy project has no slug", () => {
    expect(getProjectRouteRef({ id: "legacy-id", slug: "" })).toBe("legacy-id");
    expect(getProjectRouteRef({ id: "new-id", slug: "du-an-moi" })).toBe("du-an-moi");
  });
});
