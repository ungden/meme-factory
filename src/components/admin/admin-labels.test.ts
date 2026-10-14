import { describe, expect, it } from "vitest";
import { actionLabel, aiType, roleLabel, signedTone, topupStatus, transactionStatus, transactionType } from "./admin-labels";

describe("admin-labels", () => {
  it("gọi tên giao dịch theo loại, loại lạ coi là chi", () => {
    expect(transactionType("topup")).toEqual({ label: "Nạp", tone: "success" });
    expect(transactionType("refund")).toEqual({ label: "Hoàn", tone: "accent" });
    expect(transactionType("payment").label).toBe("Chi");
    expect(transactionType("whatever").tone).toBe("danger");
  });

  it("trạng thái chưa biết coi là đang xử lý", () => {
    expect(transactionStatus("completed").label).toBe("Xong");
    expect(transactionStatus("failed").tone).toBe("danger");
    expect(transactionStatus("pending").label).toBe("Đang xử lý");
    expect(topupStatus("rejected").label).toBe("Đã từ chối");
    expect(topupStatus("pending").tone).toBe("warning");
  });

  it("loại AI và quyền lạ rơi về mặc định", () => {
    expect(aiType("background").label).toBe("Ảnh nền");
    expect(aiType("video")).toEqual({ label: "Khác", tone: "neutral" });
    expect(roleLabel("admin").label).toBe("Quản trị");
    expect(roleLabel("ghost").label).toBe("Người dùng");
  });

  it("số 0 tính là vào ví", () => {
    expect(signedTone(0)).toBe("success");
    expect(signedTone(-1)).toBe("danger");
  });

  it("hành động không có nhãn thì hiện mã gốc để còn tra", () => {
    expect(actionLabel("meme")).toBe("Ảnh meme");
    expect(actionLabel(null)).toBe("Không rõ loại");
    expect(actionLabel("film")).toBe("film");
  });
});
