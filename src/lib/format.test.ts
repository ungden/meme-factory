import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatPoints, formatPointsRange } from "./format";

describe("format", () => {
  it("số điểm luôn có dấu chấm ngăn hàng nghìn", () => {
    expect(formatPoints(1000)).toBe("1.000 điểm");
    expect(formatPoints(6)).toBe("6 điểm");
    expect(formatPointsRange(1000, 2000)).toBe("1.000–2.000 điểm");
    expect(formatPointsRange(5, 5)).toBe("5 điểm");
  });

  it("ngày giờ theo kiểu Việt Nam, bỏ qua giá trị hỏng", () => {
    const date = new Date(2026, 9, 4, 8, 5);
    expect(formatDate(date)).toBe("04/10/2026");
    expect(formatDateTime(date)).toBe("04/10/2026 08:05");
    expect(formatDateTime("không phải ngày")).toBe("");
  });
});
