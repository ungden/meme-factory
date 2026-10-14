import { describe, expect, it } from "vitest";
import { describeTransaction } from "./wallet-text";

describe("describeTransaction", () => {
  it("đổi mã gói do trigger nạp-mua-gói ghi thành tên gói", () => {
    expect(describeTransaction("Mua gói popular (200 điểm) sau khi nạp")).toBe("Mua gói Phổ biến (200 điểm) sau khi nạp");
  });

  it("giữ nguyên tên gói đã đúng", () => {
    expect(describeTransaction("Mua gói Cơ bản (100 điểm)")).toBe("Mua gói Cơ bản (100 điểm)");
  });

  it("gọi dự án là kênh và points là điểm", () => {
    expect(describeTransaction("Tự chuyển điểm sang dự án Nhà Đậu")).toBe("Tự chuyển điểm sang kênh Nhà Đậu");
    expect(describeTransaction("Tự chuyển điểm sang ví dự án")).toBe("Tự chuyển điểm sang kênh");
    expect(describeTransaction("Mua 100 points")).toBe("Mua 100 điểm");
  });

  it("viết số điểm lớn có dấu chấm", () => {
    expect(describeTransaction("Mua gói enterprise (1000 điểm)")).toBe("Mua gói Doanh nghiệp (1.000 điểm)");
  });

  it("mô tả trống thì trả chuỗi rỗng", () => {
    expect(describeTransaction(null)).toBe("");
    expect(describeTransaction("  ")).toBe("");
  });
});
