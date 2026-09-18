import { describe, expect, it } from "vitest";
import { POINT_COSTS, FREE_TRIAL_POINTS } from "./point-pricing";
import { PRICING_EXAMPLES, pointsToVnd, trialImageCount } from "./pricing-examples";

describe("PRICING_EXAMPLES", () => {
  it("lấy giá ảnh từ đúng bảng dùng khi trừ điểm", () => {
    const meme = PRICING_EXAMPLES.find((item) => item.label.includes("bài đăng"));
    expect(meme?.points).toBe(POINT_COSTS.meme);
  });

  it("ghi phim là một khoảng, kèm ghi chú", () => {
    const film = PRICING_EXAMPLES.find((item) => item.label.includes("phim"));
    expect(typeof film?.points).toBe("object");
    expect(film?.note).toBeTruthy();
  });
});

describe("trialImageCount", () => {
  it("đếm được ít nhất 3 ảnh bằng điểm tặng", () => {
    expect(trialImageCount()).toBe(Math.floor(FREE_TRIAL_POINTS / POINT_COSTS.meme));
    expect(trialImageCount()).toBeGreaterThanOrEqual(3);
  });
});

describe("pointsToVnd", () => {
  it("quy đổi 1 điểm = 500đ", () => {
    expect(pointsToVnd(20)).toBe(10000);
  });
});

describe("suggestPackage", () => {
  it("chọn gói nhỏ nhất đủ bù phần thiếu", async () => {
    const { suggestPackage } = await import("./pricing-examples");
    expect(suggestPackage(5).points).toBe(20);
    expect(suggestPackage(20).points).toBe(20);
    expect(suggestPackage(21).points).toBe(100);
    expect(suggestPackage(350).points).toBe(400);
  });

  it("trả gói lớn nhất khi thiếu nhiều hơn mọi gói", async () => {
    const { suggestPackage } = await import("./pricing-examples");
    expect(suggestPackage(99999).points).toBe(1000);
  });
});
