import { describe, expect, it } from "vitest";
import { decideExtraDrawReplay, extraDrawPath } from "./replay";

const now = Date.parse("2026-10-14T10:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("decideExtraDrawReplay", () => {
  it("ảnh đã lưu thì trả lại ảnh đó", () => {
    expect(decideExtraDrawReplay({ pose: { id: "x" }, job: { status: "completed" }, payment: { created_at: ago(0) } }, now)).toBe("replay");
  });

  it("job còn chạy thì báo đang vẽ", () => {
    expect(decideExtraDrawReplay({ pose: null, job: { status: "running" }, payment: { created_at: ago(0) } }, now)).toBe("busy");
    expect(decideExtraDrawReplay({ pose: null, job: { status: "queued" }, payment: null }, now)).toBe("busy");
  });

  it("vừa trừ điểm mà chưa kịp ghi job vẫn là đang vẽ, không cho bấm lại", () => {
    expect(decideExtraDrawReplay({ pose: null, job: null, payment: { created_at: ago(5_000) } }, now)).toBe("busy");
  });

  it("lần trước đã kết thúc không có ảnh thì không dùng lại mã", () => {
    expect(decideExtraDrawReplay({ pose: null, job: { status: "failed" }, payment: { created_at: ago(0) } }, now)).toBe("used");
    expect(decideExtraDrawReplay({ pose: null, job: null, payment: { created_at: ago(10 * 60_000) } }, now)).toBe("used");
  });

  it("mã mới thì vẽ", () => {
    expect(decideExtraDrawReplay({ pose: null, job: null, payment: null }, now)).toBe("fresh");
  });

  it("đường dẫn ảnh cố định theo mã", () => {
    expect(extraDrawPath("p", "c", "r")).toBe("p/c/extra-r.png");
  });
});
