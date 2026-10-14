import { describe, expect, it } from "vitest";
import { drawCost, drawFailureKind, isInsufficientPoints, needsDrawing, packState, planDraw, type PackCharacter } from "./character-pack";

const draft = (view: string) => ({ path: `p/film-pack/c/${view}-x.png`, url: `https://x/${view}.png` });

function character(patch: Partial<PackCharacter> = {}): PackCharacter {
  return {
    id: "c",
    name: "Bò",
    description: "Bò vàng",
    avatarUrl: null,
    medium: "animated",
    ready: false,
    packComplete: false,
    references: {},
    drafts: {},
    ...patch,
  };
}

describe("packState", () => {
  it("đã chốt khi có bộ khoá, kể cả bộ chưa đủ ba góc", () => {
    expect(packState(character({ ready: true }))).toBe("locked");
    expect(packState(character({ packComplete: true }))).toBe("locked");
  });

  it("chỉ chờ chốt khi có cả cận mặt và toàn thân", () => {
    expect(packState(character({ avatarUrl: "a", drafts: { face: draft("face"), body: draft("body") } }))).toBe("review");
    expect(packState(character({ avatarUrl: "a", drafts: { face: draft("face") } }))).toBe("partial");
  });

  it("phân biệt có ảnh và chưa có ảnh", () => {
    expect(packState(character({ avatarUrl: "a" }))).toBe("hasImage");
    expect(packState(character())).toBe("empty");
  });
});

describe("planDraw", () => {
  it("chưa có ảnh đại diện thì vẽ ảnh đại diện và đủ ba góc", () => {
    expect(planDraw(character(), "continue")).toEqual({ origin: true, views: ["face", "body", "back"], facePath: "" });
  });

  it("vẽ tiếp sau khi đóng tab thì không trả tiền lại góc đã có", () => {
    const plan = planDraw(character({ avatarUrl: "a", drafts: { face: draft("face") } }), "continue");
    expect(plan).toEqual({ origin: false, views: ["body", "back"], facePath: draft("face").path });
  });

  it("thiếu ảnh mặt thì vẽ lại cả ba góc, vì thân và lưng theo ảnh mặt", () => {
    expect(planDraw(character({ avatarUrl: "a", drafts: { body: draft("body") } }), "continue").views).toEqual(["face", "body", "back"]);
  });

  it("vẽ lại thì làm lại tất cả", () => {
    const plan = planDraw(character({ avatarUrl: "a", drafts: { face: draft("face"), body: draft("body") } }), "redraw");
    expect(plan).toEqual({ origin: true, views: ["face", "body", "back"], facePath: "" });
  });

  it("thay ảnh đại diện thì vẽ lại ba góc theo ảnh mới, không vẽ ảnh đại diện", () => {
    const plan = planDraw(character({ avatarUrl: "a", drafts: { face: draft("face") } }), "fromImage");
    expect(plan).toEqual({ origin: false, views: ["face", "body", "back"], facePath: "" });
  });
});

describe("drawCost", () => {
  it("tính theo số ảnh thật sự phải vẽ", () => {
    expect(drawCost(character(), "continue", 5)).toBe(20);
    expect(drawCost(character({ avatarUrl: "a" }), "continue", 5)).toBe(15);
    expect(drawCost(character({ avatarUrl: "a", drafts: { face: draft("face"), body: draft("body") } }), "continue", 5)).toBe(5);
  });
});

describe("needsDrawing", () => {
  it("bỏ qua nhân vật đã chốt hoặc đang chờ chốt", () => {
    expect(needsDrawing(character({ ready: true }))).toBe(false);
    expect(needsDrawing(character({ avatarUrl: "a", drafts: { face: draft("face"), body: draft("body") } }))).toBe(false);
    expect(needsDrawing(character({ avatarUrl: "a", drafts: { face: draft("face") } }))).toBe(true);
    expect(needsDrawing(character())).toBe(true);
  });
});

describe("isInsufficientPoints", () => {
  it("nhận mã máy và câu báo thiếu điểm", () => {
    expect(isInsufficientPoints({ code: "INSUFFICIENT_POINTS" })).toBe(true);
    expect(isInsufficientPoints({ error: "Không đủ điểm. Mỗi ảnh cần 5 điểm" })).toBe(true);
    expect(isInsufficientPoints({ error: "Lỗi khác" })).toBe(false);
    expect(isInsufficientPoints(null)).toBe(false);
  });
});

describe("drawFailureKind", () => {
  it("mạng rớt hoặc máy chủ không trả lời rõ: chưa biết đã vẽ chưa", () => {
    expect(drawFailureKind(null)).toBe("unknown");
    expect(drawFailureKind({})).toBe("unknown");
  });

  it("cùng mã đang vẽ ở lần gọi khác", () => {
    expect(drawFailureKind({ code: "DRAW_IN_PROGRESS", error: "Ảnh này vẫn đang vẽ." })).toBe("busy");
  });

  it("máy chủ báo hỏng rõ ràng thì lần sau là lần vẽ mới", () => {
    expect(drawFailureKind({ error: "Chưa vẽ được." })).toBe("failed");
    expect(drawFailureKind({ code: "REQUEST_USED", error: "Lần vẽ trước đã dừng." })).toBe("failed");
  });
});
