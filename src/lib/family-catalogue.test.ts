import { testPilot } from "./family-test-fixture";
import { describe, it, expect } from "vitest";
import { buildFamilyPilot, familyPersonalities } from "./family-pilot";
import {
  validateStory,
  validateGeneratedFamilyStory,
  compactStory,
  fingerprint,
} from "./family-catalogue";
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
        p.scenes.every(
          (s) =>
            !s.dialogue ||
            (s.characterIds.length <= 2 &&
              !!s.speakerCharacterId &&
              s.characterIds.includes(s.speakerCharacterId)),
        ),
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
  it("allows a concise story to end on its payoff without a forced reaction", () => {
    const story = {
      ...plans[0].story,
      beats: [
        { purpose: "hook" as const, description: "Hai bé tranh lượt" },
        {
          purpose: "payoff" as const,
          description: "Cả hai quên mất trò ban đầu",
        },
      ],
      dialogue: plans[0].story.dialogue.slice(0, 4),
    };
    expect(
      validateStory(
        story,
        profile,
        cast.map((c) => c.characterId),
      ).beats.at(-1)?.purpose,
    ).toBe("payoff");
  });
  it("keeps motivated adult reasoning intact rather than censoring vocabulary", () => {
    const story = structuredClone(plans[0].story);
    story.dialogue[0].text = "Chị làm chủ thì chị chia đi. Chia xong em mới chọn phe. Mà sao chị được hai cái, em có một cái?";
    expect(validateStory(story, profile, cast.map(c => c.characterId)).dialogue[0].text).toBe(story.dialogue[0].text);
  });
  it("rejects a thirteenth reaction shot before purchasing or planning media", () => {
    const story = { ...plans[0].story, dialogue: Array.from({ length: 12 }, (_, i) => ({ ...plans[0].story.dialogue[i % 6], text: "Cho em xem nào." })) };
    expect(() => validateStory(story, profile, cast.map(c => c.characterId))).toThrow("STORY_SHOT_LIMIT");
    expect(validateStory({ ...story, beats: story.beats.filter(b => b.purpose !== "reaction") }, profile, cast.map(c => c.characterId)).dialogue).toHaveLength(12);
  });
});

it("keeps legacy plans readable but requires a concrete inversion in new AI drafts", () => {
  const ids = cast.map(c => c.characterId);
  expect(validateStory(plans[0].story, profile, ids).comicPremise).toBeUndefined();
  expect(() => validateGeneratedFamilyStory(plans[0].story, profile, ids)).toThrow("STORY_COMIC_PREMISE_REQUIRED");
  const premise = {
    normalExpectation: "Cha mẹ chuẩn bị đồ cho con đi học",
    invertedReality: "Hai bé chuẩn bị đồ cho bố đi làm",
    visibleContrast: "Bé kiểm bình nước của bố còn bố đòi nằm thêm",
  };
  const story = validateGeneratedFamilyStory({ ...plans[0].story, comicPremise: premise }, profile, ids);
  expect(compactStory(story).comicPremise).toEqual(premise);
  expect(() => validateGeneratedFamilyStory({ ...story, comicPremise: { ...premise, visibleContrast: "" } }, profile, ids)).toThrow("STORY_COMIC_PREMISE_INVALID");
});
