import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIELDS,
  canReuseOutput,
  fieldsFromOutput,
  fitDuration,
  insufficientPoints,
  isWorking,
  optionsSummary,
  parseDraft,
  speakerIds,
  videoView,
  type VideoStatus,
} from "./video-flow";

const status = (output: Partial<VideoStatus["output"]>, job: Partial<NonNullable<VideoStatus["job"]>> | null = null): VideoStatus => ({
  output: { id: "o1", status: "draft", ...output },
  job: job ? { id: "j1", status: "running", phase: null, reason: null, refundedPoints: null, ...job } : null,
});

describe("thẻ tiến độ video", () => {
  it("đang làm thì báo đang làm, kể cả khi bài vừa chuyển sang queued", () => {
    expect(videoView(status({ status: "queued" }))).toMatchObject({ state: "working", title: "Đang làm video" });
    expect(isWorking(status({ status: "failed" }, { status: "running" }))).toBe(true);
  });

  it("hỏng thì nói rõ và kèm số điểm đã hoàn", () => {
    const view = videoView(status({ status: "failed" }, { status: "failed", reason: "provider", refundedPoints: 120 }));
    expect(view).toMatchObject({ state: "failed", title: "Video chưa làm được", refundedPoints: 120 });
  });

  it("gửi bị đứt thì không hứa đã hoàn, chỉ hứa kiểm tra", () => {
    const view = videoView(status({ status: "failed" }, { status: "failed", reason: "submission" }));
    expect(view).toMatchObject({ state: "failed", refundedPoints: undefined });
    expect(view?.state === "failed" && view.detail).toMatch(/kiểm tra/);
  });

  it("xong mà chưa có tệp video thì chưa coi là xong", () => {
    expect(videoView(status({ status: "completed", media_url: "p1/v.mp4" }))).toMatchObject({ state: "done" });
    expect(videoView(status({ status: "completed" }))).toBeNull();
    expect(videoView(status({ status: "draft" }))).toBeNull();
    expect(videoView(null)).toBeNull();
  });
});

describe("chọn bài để làm", () => {
  it("chỉ làm lại trên bản nháp hoặc bản hỏng, không đè video đã xong", () => {
    expect(canReuseOutput({ status: "draft" })).toBe(true);
    expect(canReuseOutput({ status: "failed" })).toBe(true);
    expect(canReuseOutput({ status: "completed" })).toBe(false);
    expect(canReuseOutput({ status: "running" })).toBe(false);
    expect(canReuseOutput(null)).toBe(false);
  });
});

describe("tuỳ chọn", () => {
  it("câu tóm tắt nói đúng có lồng tiếng hay không", () => {
    const base = { mode: "text" as const, model: "seedance-2.0-fast" as const, duration: 5, resolution: "720p" as const, aspect: "9:16" as const };
    expect(optionsSummary({ ...base, audio: false })).toBe("5 giây · dọc 9:16 · 720p · tiết kiệm · không lồng tiếng");
    expect(optionsSummary({ ...base, mode: "image", audio: true })).toContain("khổ theo ảnh mở đầu");
    expect(optionsSummary({ ...base, audio: true })).toContain("có lồng tiếng");
  });

  it("đổi sang mức tiết kiệm thì 30 giây tụt về 15", () => {
    expect(fitDuration(30, "seedance-2.0-fast")).toBe(15);
    expect(fitDuration(30, "seedance-2.5")).toBe(30);
    expect(fitDuration(7, "seedance-2.5")).toBe(30);
  });

  it("chỉ nhân vật có giọng đọc đã duyệt mới lồng tiếng được", () => {
    const ids = speakerIds([
      { character_id: "a", model: "gemini-3.1-flash-tts-preview", approved_at: "x", version: 1 },
      { character_id: "b", model: "seedance-native", approved_at: "x", version: 2 },
      { character_id: "c", model: "gemini-3.1-flash-tts-preview", approved_at: null, version: 1 },
    ]);
    expect([...ids]).toEqual(["a"]);
  });

  it("đọc lỗi hết điểm cho hộp nạp", () => {
    expect(insufficientPoints(402, { code: "INSUFFICIENT_POINTS", required: 120, current: 30 })).toEqual({ required: 120, current: 30 });
    expect(insufficientPoints(500, { error: "x" })).toBeNull();
  });
});

describe("bản nháp", () => {
  it("bản của trang cũ bật lồng tiếng mà chưa có lời thì coi như tắt", () => {
    const draft = parseDraft({ mode: "image", image: "https://kho/a.png", audio: true, dialogue: "", speaker: "", duration: 30, model: "seedance-2.0-fast" });
    expect(draft).toMatchObject({ opening: { url: "https://kho/a.png", memeId: null }, audio: false, duration: 15 });
  });

  it("điền lại form từ video hỏng để thử lại", () => {
    const fields = fieldsFromOutput(
      {
        id: "o1",
        status: "failed",
        script: "Bánh Bao đi chợ",
        caption: "Sáng thứ Hai",
        duration_seconds: 10,
        source_snapshot: { model: "bytedance/seedance-2.0-fast/text-to-video", mode: "text", referenceImages: ["https://kho/a.png"], aspectRatio: "1:1" },
      },
      DEFAULT_FIELDS,
    );
    expect(fields).toMatchObject({ prompt: "Bánh Bao đi chợ", model: "seedance-2.0-fast", references: ["https://kho/a.png"], aspect: "1:1", duration: 10, opening: null });
  });
});
