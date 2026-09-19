import { describe, expect, it } from "vitest";
import { STORY_EVALUATION_SET, evaluationBriefsFor } from "./story-evaluation-set";

describe("fixed story evaluation set", () => {
  it("keeps ten independent briefs for each writing contract", () => {
    expect(STORY_EVALUATION_SET).toHaveLength(20);
    expect(evaluationBriefsFor("comedy")).toHaveLength(10);
    expect(evaluationBriefsFor("emotion")).toHaveLength(10);
    expect(new Set(STORY_EVALUATION_SET.map((brief) => brief.id)).size).toBe(20);
  });

  it("records observable acceptance checks instead of model self-praise", () => {
    for (const brief of STORY_EVALUATION_SET) {
      expect(brief.mustKeep.length).toBeGreaterThan(1);
      expect(brief.rejectIf.length).toBeGreaterThan(0);
    }
  });
});
