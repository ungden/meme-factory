import { describe, expect, it } from "vitest";
import { validateCreativeAssist } from "./creative-assist";

const context = { projectName: "Bánh Bao", characters: [{ id: "a", name: "Bánh Bao" }, { id: "b", name: "Đậu Đỏ" }], recentContent: [] };

describe("creative assist validator", () => {
  it("keeps only project characters and validates a paced three-scene plan", () => {
    const result = validateCreativeAssist("video_plan", { title: "Buổi sáng", summary: "...", scenes: [
      { characterIds: ["a", "other"], speakerCharacterId: "a", dialogue: "Đi thôi nào!", action: "Bánh Bao chạy vào bếp", setting: "Căn bếp sáng", camera: "medium", durationSeconds: 5, imagePrompt: "Bánh Bao trong bếp", motionPrompt: "chạy vào bếp", followsPrevious: false },
      { characterIds: ["a", "b"], speakerCharacterId: "b", dialogue: "Chờ tớ với!", action: "Đậu Đỏ gọi với", setting: "Căn bếp sáng", camera: "wide", durationSeconds: 5, imagePrompt: "Hai bạn trong bếp", motionPrompt: "Đậu Đỏ chạy tới", followsPrevious: false },
      { characterIds: ["a", "b"], speakerCharacterId: null, dialogue: "", action: "Cả hai cười", setting: "Căn bếp sáng", camera: "close", durationSeconds: 5, imagePrompt: "Hai bạn cười", motionPrompt: "cùng cười", followsPrevious: false },
    ] }, context, 15);
    expect(result.kind).toBe("video_plan");
    if (result.kind === "video_plan") expect(result.scenes[0].characterIds).toEqual(["a"]);
  });

  it("rejects dialogue that cannot fit in its scene", () => {
    expect(() => validateCreativeAssist("video_plan", { title: "", scenes: [{ characterIds: ["a"], speakerCharacterId: "a", dialogue: "một hai ba bốn năm sáu bảy tám chín mười mười một mười hai mười ba mười bốn mười lăm", action: "nói", setting: "nhà", durationSeconds: 5, imagePrompt: "x", motionPrompt: "x" }] }, context, 15)).toThrow();
  });
});
