import { describe, expect, it } from "vitest";
import { validateSceneReferencePlan } from "./visual-direction";

const plan = {
  version: 1 as const,
  storyMechanism: "Em tưởng nhiều tờ hơn là được phần hơn.",
  audienceMustSee: ["Năm tờ $1 đối lập một tờ $100."],
  characterKnowledge: ["Đậu Đỏ chưa nhận ra chênh lệch giá trị."],
  requirements: [
    {
      id: "six_bills",
      kind: "count" as const,
      description: "Đúng sáu tờ tiền.",
      visibleWhen: "opening" as const,
      importance: "critical" as const,
      legibility: "countable" as const,
    },
  ],
  referenceImages: [
    {
      id: "table_six_bills",
      role: "scene" as const,
      purpose: "Thiết lập đủ tiền trước khi chia.",
      framing: "top-down close-up",
      moment: "Trước khi hai bé chạm vào tiền.",
      prompt: "Đúng sáu tờ tách rời trên bàn.",
      requirementIds: ["six_bills"],
    },
  ],
};

describe("story-aware director reference plan", () => {
  it("accepts critical evidence tied to an actual provider frame", () => {
    expect(validateSceneReferencePlan(plan)).toEqual(plan);
  });

  it("accepts readable evidence in a dedicated prop reference", () => {
    expect(() =>
      validateSceneReferencePlan({
        ...plan,
        referenceImages: [
          plan.referenceImages[0],
          {
            ...plan.referenceImages[0],
            id: "money_detail",
            role: "prop",
            purpose: "Cận sáu tờ tiền",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects an uncovered story requirement", () => {
    expect(() =>
      validateSceneReferencePlan({
        ...plan,
        referenceImages: [
          { ...plan.referenceImages[0], requirementIds: [] },
        ],
      }),
    ).toThrow();
  });
});
