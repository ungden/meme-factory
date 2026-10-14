import { describe, expect, it } from "vitest";
import { memeRunPhaseLabel, memeRunShortfall, quickMemeCost, recentFailedRuns, similarMemeDraft } from "./meme-run-view";

describe("memeRunShortfall", () => {
  it("reads both numbers from the sentence meme-production writes", () => {
    expect(memeRunShortfall("Không đủ điểm: mỗi meme cần 46 điểm, ví đang có 10 điểm.")).toEqual({ required: 46, current: 10 });
  });

  it("reads thousands written the Vietnamese way", () => {
    expect(memeRunShortfall("Không đủ điểm: mỗi meme cần 1.200 điểm, ví đang có 0 điểm.")).toEqual({ required: 1200, current: 0 });
  });

  it("still flags a shortfall when the numbers are missing", () => {
    expect(memeRunShortfall("không đủ điểm")).toEqual({ required: null, current: null });
  });

  it("ignores other failures", () => {
    expect(memeRunShortfall("AI chưa làm được meme này sau ba lần thử.")).toBeNull();
    expect(memeRunShortfall(null)).toBeNull();
  });
});

describe("recentFailedRuns", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const run = (id: string, status: string, hoursAgo: number) => ({
    id,
    status: status as "failed",
    created_at: new Date(now - hoursAgo * 3600_000).toISOString(),
  });

  it("keeps failures from the last day that were not retried, newest three", () => {
    const runs = [run("a", "failed", 1), run("b", "completed", 1), run("c", "failed", 30), run("d", "failed", 2), run("e", "failed", 3), run("f", "failed", 4)];
    expect(recentFailedRuns(runs, new Set(["d"]), now).map((item) => item.id)).toEqual(["a", "e", "f"]);
  });
});

describe("similarMemeDraft", () => {
  it("keeps the idea and frame of the run", () => {
    expect(similarMemeDraft({ intent: "Sếp nhắn lúc 10 giờ tối", options: { format: "9:16" }, memes: null })).toEqual({
      idea: "Sếp nhắn lúc 10 giờ tối",
      format: "9:16",
    });
  });

  it("uses the headline as a model when AIDA picked the idea", () => {
    const draft = similarMemeDraft({
      intent: "",
      options: { format: "bogus" },
      memes: { id: "m", image_url: null, generated_content: { headline: "Thứ Hai lại tới" } },
    });
    expect(draft.format).toBe("");
    expect(draft.idea).toContain("Thứ Hai lại tới");
  });

  it("leaves the box empty when there is nothing to copy", () => {
    expect(similarMemeDraft({ intent: null, options: null, memes: null })).toEqual({ idea: "", format: "" });
  });
});

describe("quickMemeCost", () => {
  it("charges one drawing per meme, between one and four", () => {
    expect(quickMemeCost(46, 3)).toBe(138);
    expect(quickMemeCost(46, 0)).toBe(46);
    expect(quickMemeCost(46, 9)).toBe(184);
  });
});

describe("memeRunPhaseLabel", () => {
  it("falls back to a plain label for unknown phases", () => {
    expect(memeRunPhaseLabel("image")).toBe("Đang vẽ ảnh");
    expect(memeRunPhaseLabel("weird")).toBe("Đang làm meme");
  });
});
