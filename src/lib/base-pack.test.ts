import { describe, expect, it } from "vitest";
import {
  ANCHOR_RECIPE_ID,
  BASE_PACK_RECIPES,
  DEFAULT_PACK_RECIPE_IDS,
  estimatePackCost,
  missingRecipes,
} from "./base-pack";
import { compileCharacterPosePrompt, compileMemeImagePrompt } from "./gemini-image";
import { ART_DIRECTION_LIST, DEFAULT_ART_DIRECTION } from "./mascot-art-direction";
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

  it("has unique ids and one recipe per expression", () => {
    const ids = BASE_PACK_RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = BASE_PACK_RECIPES.map((recipe) => recipe.expressionSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("covers the whole reaction taxonomy except the custom placeholder", () => {
    const covered = new Set(BASE_PACK_RECIPES.map((recipe) => recipe.expressionSlug));
    for (const slug of SEEDED_EXPRESSION_SLUGS) {
      if (slug === "custom") continue;
      expect(covered.has(slug)).toBe(true);
    }
  });

  it("starts from an anchor that exists", () => {
    expect(BASE_PACK_RECIPES.some((recipe) => recipe.id === ANCHOR_RECIPE_ID)).toBe(true);
    expect(DEFAULT_PACK_RECIPE_IDS).toContain(ANCHOR_RECIPE_ID);
  });

  it("only offers what the mascot is missing, so a stopped run is never repaid", () => {
    const owned = ["neutral", "happy", "crying"];
    const missing = missingRecipes(owned);
    expect(missing.some((recipe) => owned.includes(recipe.expressionSlug))).toBe(false);
    expect(missing.length).toBe(BASE_PACK_RECIPES.length - owned.length);
    expect(missingRecipes(BASE_PACK_RECIPES.map((r) => r.expressionSlug))).toEqual([]);
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

describe("art direction", () => {
  it("defaults to the 3D house look", () => {
    const prompt = compileCharacterPosePrompt(baseParams);
    expect(DEFAULT_ART_DIRECTION).toBe("soft_3d");
    expect(prompt).toContain("Render 3D chất lượng phim hoạt hình rạp");
  });

  it("never asks for the flat outlined look the 3D set replaced", () => {
    for (const direction of ART_DIRECTION_LIST) {
      const prompt = compileCharacterPosePrompt({ ...baseParams, artDirection: direction.id });
      expect(prompt).toContain("KHÔNG viền nét");
      expect(prompt).toContain("KHÔNG cel shading");
      // The 2D vocabulary the 3D set replaced must be gone, not merely outnumbered.
      expect(prompt).not.toContain("Bold outlines");
      expect(prompt).not.toContain("Illustration");
      expect(prompt).not.toContain("tranh minh họa");
    }
  });

  it("layers a brand note on top instead of replacing the direction", () => {
    // The old prompt swapped the whole style block out for any style string, which
    // is how a project with a free-text style silently lost the house look.
    const prompt = compileCharacterPosePrompt({ ...baseParams, style: "tông kem, xanh cobalt" });
    expect(prompt).toContain("Render 3D chất lượng phim hoạt hình rạp");
    expect(prompt).toContain("tông kem, xanh cobalt");
    expect(prompt).toContain("GHI CHÚ THƯƠNG HIỆU");
  });

  it("keeps the 3D direction in meme prompts even when a project sets a style", () => {
    // Same trap as the character prompt: a project style used to replace the whole
    // style block, so branded projects silently rendered in the old 2D look.
    const prompt = compileMemeImagePrompt({
      headline: "ĐỔI BRIEF?",
      tone: "hài hước",
      textPosition: "top",
      characters: [],
      format: "1:1",
      style: "tông kem, xanh cobalt",
    });
    expect(prompt).toContain("tông kem, xanh cobalt");
    expect(prompt).toContain("không viền nét");
    expect(prompt).toContain("Ghi chú thương hiệu");
  });

  it("keeps every direction distinct", () => {
    const bodies = ART_DIRECTION_LIST.map((direction) => direction.characterStyle);
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});

describe("compileCharacterPosePrompt", () => {
  it("keeps the full-body framing rule when no layout group is given", () => {
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
