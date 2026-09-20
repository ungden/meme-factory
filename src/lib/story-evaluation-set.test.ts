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

  it("covers social life beyond the family home", () => {
    const comedy = evaluationBriefsFor("comedy");
    const domains = new Set(comedy.map((brief) => brief.domain));
    expect(domains.size).toBeGreaterThanOrEqual(6);
    expect(domains.has("school")).toBe(true);
    expect(domains.has("public_space")).toBe(true);
    expect(domains.has("parents_workplace")).toBe(true);
    expect(comedy.filter((brief) => brief.domain !== "family_home")).toHaveLength(6);
  });
});
