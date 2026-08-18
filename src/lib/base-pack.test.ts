import { describe, expect, it } from "vitest";
import { BASE_PACK_RECIPES, DEFAULT_PACK_RECIPE_IDS, estimatePackCost } from "./base-pack";
import { compileCharacterPosePrompt } from "./gemini-image";
import { POINT_COSTS } from "./point-pricing";

/**
 * Mirrors the slugs seeded into public.expression_tags. mascot_base_images has a
 * foreign key onto that table, so a typo here would only surface after the points
 * for the image were already spent.
 */
const SEEDED_EXPRESSION_SLUGS = new Set([
  "neutral", "happy", "laughing", "excited", "love", "cool", "thinking", "confused",
  "surprised", "scared", "angry", "sad", "crying", "tired", "custom", "side_eye",
  "skeptical", "smug", "gossip", "awkward", "overthinking", "dead_inside", "exhausted",
  "panic", "shocked", "savage", "chill", "proud", "bored", "sarcastic",
]);

const baseParams = {
  characterName: "Foxy",
  characterDescription: "Cáo vàng mặc áo hoodie xanh",
  emotion: "vui vẻ",
};

describe("base pack recipes", () => {
  it("only uses expression slugs that exist in the taxonomy", () => {
    for (const recipe of BASE_PACK_RECIPES) {
      expect(SEEDED_EXPRESSION_SLUGS.has(recipe.expressionSlug)).toBe(true);
    }
  });

  it("has unique ids and a sensible default selection", () => {
    const ids = BASE_PACK_RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_PACK_RECIPE_IDS.length).toBeGreaterThan(0);
    expect(DEFAULT_PACK_RECIPE_IDS.length).toBeLessThan(BASE_PACK_RECIPES.length);
  });

  it("only marks a subject side on offset compositions", () => {
    for (const recipe of BASE_PACK_RECIPES) {
      if (recipe.subjectSide) expect(recipe.layoutGroup).toBe("offset_composition");
    }
  });

  it("prices a pack through the existing character action", () => {
    expect(estimatePackCost(12)).toBe(12 * POINT_COSTS.character);
    expect(estimatePackCost(0)).toBe(0);
  });
});

describe("compileCharacterPosePrompt", () => {
  it("leaves the legacy prompt untouched when no layout group is given", () => {
    const prompt = compileCharacterPosePrompt(baseParams);
    expect(prompt).toContain("1. Full body character (toàn thân), KHÔNG bị cắt, nhìn rõ từ đầu đến chân");
    expect(prompt).not.toContain("CHỪA TRỐNG");
    expect(prompt).not.toContain("BỐ CỤC");
  });

  it("replaces the full-body rule for a close-up instead of contradicting it", () => {
    const prompt = compileCharacterPosePrompt({ ...baseParams, layoutGroup: "tight_closeup" });
    expect(prompt).not.toContain("Full body character");
    expect(prompt).toContain("Cận mặt");
    expect(prompt).toContain("CHỪA TRỐNG HOÀN TOÀN 20% phía trên và 22% phía dưới khung");
  });

  it("names the empty side for offset compositions", () => {
    const left = compileCharacterPosePrompt({ ...baseParams, layoutGroup: "offset_composition", subjectSide: "left" });
    const right = compileCharacterPosePrompt({ ...baseParams, layoutGroup: "offset_composition", subjectSide: "right" });
    expect(left).toContain("vùng trống nằm bên PHẢI");
    expect(right).toContain("vùng trống nằm bên TRÁI");
  });

  it("keeps the no-text and clean-background rules for every layout group", () => {
    for (const layoutGroup of ["tight_closeup", "medium_portrait", "offset_composition"] as const) {
      const prompt = compileCharacterPosePrompt({ ...baseParams, layoutGroup });
      expect(prompt).toContain("KHÔNG có text, chữ viết, watermark, logo trên ảnh");
      expect(prompt).toContain("Background: TRẮNG TINH");
    }
  });
});
