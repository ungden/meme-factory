import { describe, expect, it } from "vitest";
import {
  SEEDANCE_20_FAST_IMAGE_MODEL,
  SEEDANCE_20_FAST_TEXT_MODEL,
  SEEDANCE_25_IMAGE_MODEL,
  seedanceImageModel,
  seedanceMaxDuration,
  seedanceModel,
  seedanceVariant,
  validSeedanceDuration,
} from "./video-models";

describe("Seedance model selection", () => {
  it("keeps existing and unknown drafts on Seedance 2.5", () => {
    expect(seedanceVariant(undefined)).toBe("seedance-2.5");
    expect(seedanceImageModel(undefined)).toBe(SEEDANCE_25_IMAGE_MODEL);
  });

  it("maps Fast to the correct text and image endpoints", () => {
    expect(seedanceImageModel(SEEDANCE_20_FAST_IMAGE_MODEL)).toBe(
      SEEDANCE_20_FAST_IMAGE_MODEL,
    );
    expect(seedanceModel("seedance-2.0-fast", "text")).toBe(
      SEEDANCE_20_FAST_TEXT_MODEL,
    );
  });

  it("enforces 15 seconds for Fast and 30 seconds for 2.5", () => {
    expect(seedanceMaxDuration(SEEDANCE_20_FAST_IMAGE_MODEL)).toBe(15);
    expect(validSeedanceDuration(15, "seedance-2.0-fast")).toBe(true);
    expect(validSeedanceDuration(16, "seedance-2.0-fast")).toBe(false);
    expect(validSeedanceDuration(30, "seedance-2.5")).toBe(true);
  });
});
