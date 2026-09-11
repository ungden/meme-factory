import { describe, expect, it } from "vitest";
import {
  compilePerformanceDirection,
  lintPerformanceDirection,
  performanceCheck,
  validatePerformanceDirection,
  type PerformanceDirection,
} from "./performance-direction";

const direction: PerformanceDirection = {
  version: 1,
  lane: "deadpan_reversal",
  comicObjective: "Hai bé nghiêm túc lo cho bố mẹ nhưng cuối cùng tự đi học.",
  statusBefore: "Bố mẹ đang ngủ, hai bé cần được chở đi học.",
  statusAfter: "Hai bé tự quyết định rời nhà, bố mẹ vẫn ngủ.",
  hook: "Bánh Bao kéo rèm bật sáng phòng rồi nhìn đồng hồ báo thức đang rung.",
  beats: [
    {
      physicalAction: "Đậu Đỏ kéo chăn của Bố, Bánh Bao chỉ vào cặp sách.",
      expressionChange: "Bánh Bao từ sốt ruột chuyển sang tỉnh bơ.",
      gesture: "Đậu Đỏ khoanh tay thở dài như người lớn.",
      propInteraction: "Đồng hồ rung trên bàn.",
      reactionTarget: "Bố đang ôm gối và vẫn nhắm mắt.",
      cameraMove: "Máy quay slide từ đồng hồ sang hai bé.",
    },
    {
      physicalAction: "Hai bé đổi sang tự đeo cặp và kéo tay nắm cửa.",
      expressionChange: "Đậu Đỏ nhướng mày, Bánh Bao mím môi quyết định.",
      gesture: "Bánh Bao hất cằm về phía cửa.",
      propInteraction: "Cặp sách va nhẹ vào ghế.",
      reactionTarget: "Mẹ hé mắt nhưng quay mặt vào gối.",
      cameraMove: "Push-in nhanh vào tay nắm cửa rồi pan về mặt hai bé.",
    },
  ],
  revealOrCut: "Hai bé mở cửa bước ra và nói tỉnh bơ: để bố mẹ ngủ thêm một tí.",
};

describe("performance direction v2", () => {
  it("accepts concrete comic direction and compiles every beat", () => {
    expect(validatePerformanceDirection(direction)).toEqual(direction);
    expect(lintPerformanceDirection(direction)).toEqual([]);
    const prompt = compilePerformanceDirection(direction);
    expect(prompt).toContain("HOOK 0–1s");
    expect(prompt).toContain("BEAT 2");
    expect(prompt).toContain("REVEAL/CUT");
  });

  it("flags adjective-only direction without touching provider", () => {
    const weak = {
      ...direction,
      hook: "Diễn tự nhiên và đáng yêu.",
      beats: direction.beats.map((beat) => ({
        ...beat,
        physicalAction: "Nhìn ngơ ngác.",
        reactionTarget: "nghiêm túc",
      })),
    };
    const check = performanceCheck(weak);
    expect(check.status).toBe("needs_review");
    expect(check.issues.length).toBeGreaterThan(0);
  });
});
