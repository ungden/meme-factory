import { describe, expect, it } from "vitest";
import { lintPerformanceDirection } from "./performance-direction";

describe("performance direction Vietnamese actions", () => {
  it("recognizes concrete verbs that end with Vietnamese diacritics", () => {
    const issues = lintPerformanceDirection({
      version: 1,
      lane: "deadpan_reversal",
      comicObjective: "Đứa trẻ bẻ tình huống bằng một quan sát đơn giản.",
      statusBefore: "Mẹ đang giữ quyền chủ động.",
      statusAfter: "Đậu Đỏ giành quyền giải thích.",
      hook: "Đậu Đỏ gỡ tay Mẹ và chỉ vào hai túi dù.",
      beats: [
        {
          physicalAction: "Đậu Đỏ gỡ tay Mẹ.",
          expressionChange: "Mặt chuyển sang tỉnh bơ.",
          gesture: "Giơ hai ngón tay.",
          reactionTarget: "Mẹ nhìn theo ngón tay con.",
          cameraMove: "Rack focus sang túi dù.",
        },
        {
          physicalAction: "Mẹ buông vai và lau nước mắt.",
          expressionChange: "Nét bi thương tắt ngay.",
          gesture: "Hất cằm về cửa.",
          reactionTarget: "Đậu Đỏ nhìn Mẹ chờ câu chốt.",
          cameraMove: "Push-in ngắn.",
        },
      ],
      revealOrCut: "Hard cut ngay sau câu chốt.",
    });
    expect(issues).toEqual([]);
  });
});
