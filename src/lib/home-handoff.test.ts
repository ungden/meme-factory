import { describe, expect, it } from "vitest";
import { KIND_PATH, parseComposeKind } from "./home-handoff";

describe("parseComposeKind", () => {
  it("nhận mã ngắn", () => {
    expect(parseComposeKind("film")).toBe("film");
    expect(parseComposeKind("video")).toBe("video");
    expect(parseComposeKind("meme")).toBe("meme");
  });

  it("vẫn đọc nhãn cũ trong link và nháp đã lưu", () => {
    expect(parseComposeKind("Tạo phim ngắn")).toBe("film");
    expect(parseComposeKind("Tạo video")).toBe("video");
    expect(parseComposeKind("Tạo ảnh")).toBe("meme");
  });

  it("bỏ qua giá trị lạ", () => {
    expect(parseComposeKind("Bài fanpage")).toBeNull();
    expect(parseComposeKind(null)).toBeNull();
    expect(parseComposeKind(3)).toBeNull();
  });

  it("mỗi loại có một trang trong kênh", () => {
    expect(KIND_PATH).toEqual({ film: "short-films", video: "video", meme: "generate" });
  });
});
