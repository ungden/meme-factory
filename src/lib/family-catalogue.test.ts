import { testPilot } from "./family-test-fixture";
import { describe, it, expect } from "vitest";
import { buildFamilyPilot, familyPersonalities } from "./family-pilot";
import { validateStory, fingerprint } from "./family-catalogue";
import type { FilmCast } from "./short-film/contracts";
const cast = Object.keys(familyPersonalities).map((name, i) => ({
  name,
  characterId: String(i),
  description: "ref",
  personality: "",
  imageUrl: "ref",
  referenceImages: ["ref"],
  assetVersionId: String(i),
  assetVersion: 2,
})) satisfies FilmCast[];
const { profile, plans } = buildFamilyPilot(cast, testPilot);
describe("family catalogue", () => {
  it("creates twelve distinct complete drafts with the approved cast distribution", () => {
    expect(plans).toHaveLength(12);
    expect(plans.filter((p) => p.group === "siblings")).toHaveLength(8);
    expect(plans.filter((p) => p.group === "child_parent")).toHaveLength(3);
    expect(plans.filter((p) => p.group === "family")).toHaveLength(1);
    expect(new Set(plans.map((p) => fingerprint(p.story))).size).toBe(12);
    for (const p of plans) {
      expect(p.scenes.filter((s) => s.dialogue)).toHaveLength(6);
      expect(
        p.scenes.every((s) => !s.dialogue || s.characterIds.length === 1),
      ).toBe(true);
      expect(p.scenes.at(-1)?.dialogue).toBe("");
    }
  });
  it("rejects foreign cast and repeated situation-mechanism-outcome", () => {
    expect(() => validateStory(plans[0].story, profile, ["other"])).toThrow(
      "WANTS",
    );
    expect(() =>
      validateStory(
        plans[0].story,
        profile,
        cast.map((c) => c.characterId),
        [plans[0].story],
      ),
    ).toThrow("REPEATED");
  });
  it("allows same topic with a different mechanism and outcome", () => {
    expect(
      validateStory(
        {
          ...plans[0].story,
          mechanism: "đổi phe",
          outcome: "cùng nhận phần thưởng",
        },
        profile,
        cast.map((c) => c.characterId),
        [plans[0].story],
      ),
    ).toBeTruthy();
  });
  it("requires setup and meaningful turns before payoff, not filler", () => {
    expect(() =>
      validateStory(
        { ...plans[0].story, beats: [] },
        profile,
        cast.map((c) => c.characterId),
      ),
    ).toThrow("BEATS");
  });
});
