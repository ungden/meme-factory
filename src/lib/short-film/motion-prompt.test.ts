import { describe, it, expect } from "vitest";
import { beatHeading, sanitizeProviderPrompt } from "./contracts";

describe("beatHeading", () => {
  it("chỉ ghi số hiệu shot cho Seedance 2.0 — model này không đọc mốc giây", () => {
    expect(beatHeading(0, 0, 2.4, "bytedance/seedance-2.0-fast/text-to-video")).toBe("Shot 1");
    expect(beatHeading(2, 4.8, 7.2, "bytedance/seedance-2.0-fast/text-to-video")).toBe("Shot 3");
  });

  it("ghi thêm mốc GIÂY NGUYÊN cho 2.5, không lấy lẻ tới phần trăm giây", () => {
    expect(beatHeading(1, 2.15, 4.37, "bytedance/seedance-2.5/text-to-video")).toBe(
      "Shot 2 | 2-4 giây",
    );
  });
});

describe("sanitizeProviderPrompt", () => {
  it("bỏ gạch ngang đôi vì provider nuốt nó như tham số dòng lệnh", () => {
    expect(sanitizeProviderPrompt("Bánh Bao --- Đậu Đỏ đứng cạnh --rs 720p")).toBe(
      "Bánh Bao — Đậu Đỏ đứng cạnh —rs 720p",
    );
  });

  it("giữ nguyên gạch ngang đơn của tiếng Việt", () => {
    expect(sanitizeProviderPrompt("năm xăng-ti-mét")).toBe("năm xăng-ti-mét");
  });
});
