import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAME,
  MAX_FILE_BYTES,
  MIN_SHORT_EDGE,
  checkAcceptable,
  computeDrawRect,
  hasLetterbox,
  lowResolutionWarning,
  storageExtensionFor,
  suggestAspect,
} from "./template-upload";
import { FORMAT_DIMENSIONS } from "@/types/database";

describe("checkAcceptable", () => {
  it("accepts the three supported formats", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(checkAcceptable({ type, size: 1024, width: 1080, height: 1080 })).toBeNull();
    }
  });

  it("rejects anything else, including GIF", () => {
    expect(checkAcceptable({ type: "image/gif", size: 1024 })?.code).toBe("mime");
    expect(checkAcceptable({ type: "application/pdf", size: 1024 })?.code).toBe("mime");
  });

  it("rejects an animated source even when the mime is supported", () => {
    expect(checkAcceptable({ type: "image/webp", size: 1024, isAnimated: true })?.code).toBe("animated");
  });

  it("rejects oversized files", () => {
    expect(checkAcceptable({ type: "image/png", size: MAX_FILE_BYTES + 1 })?.code).toBe("too_large");
  });

  it("rejects artwork whose short edge is too small to export", () => {
    expect(
      checkAcceptable({ type: "image/png", size: 1024, width: 2000, height: MIN_SHORT_EDGE - 1 })?.code
    ).toBe("too_small");
    expect(checkAcceptable({ type: "image/png", size: 1024, width: 2000, height: MIN_SHORT_EDGE })).toBeNull();
  });
});

describe("lowResolutionWarning", () => {
  it("warns between the hard floor and the comfortable size", () => {
    expect(lowResolutionWarning(500, 500)).toContain("500×500");
    expect(lowResolutionWarning(1080, 1080)).toBeNull();
  });
});

describe("suggestAspect", () => {
  it("matches an exact ratio with no crop", () => {
    expect(suggestAspect(1080, 1080)).toEqual({ format: "1:1", cropLoss: 0 });
    expect(suggestAspect(1920, 1080).format).toBe("16:9");
    expect(suggestAspect(1080, 1920).format).toBe("9:16");
    expect(suggestAspect(1080, 1350).format).toBe("4:5");
  });

  it("picks the closest canvas for an off-ratio photo and reports the loss", () => {
    // A 3:2 phone photo: 16:9 is nearest, and some width is cropped.
    const suggestion = suggestAspect(3000, 2000);
    expect(suggestion.format).toBe("16:9");
    expect(suggestion.cropLoss).toBeGreaterThan(0);
    expect(suggestion.cropLoss).toBeLessThan(0.2);
  });

  it("never reports a loss outside 0..1", () => {
    for (const [w, h] of [[100, 4000], [4000, 100], [1234, 567], [800, 800]]) {
      const { cropLoss } = suggestAspect(w, h);
      expect(cropLoss).toBeGreaterThanOrEqual(0);
      expect(cropLoss).toBeLessThan(1);
    }
  });
});

describe("computeDrawRect", () => {
  const canvas = FORMAT_DIMENSIONS["1:1"];

  it("cover fills the canvas with no bare edges", () => {
    const rect = computeDrawRect({
      sourceWidth: 3000,
      sourceHeight: 2000,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frame: DEFAULT_FRAME,
    });
    expect(rect.w).toBeGreaterThanOrEqual(canvas.width - 0.5);
    expect(rect.h).toBeGreaterThanOrEqual(canvas.height - 0.5);
    expect(hasLetterbox(rect, canvas.width, canvas.height)).toBe(false);
  });

  it("contain keeps the whole artwork inside and leaves a band", () => {
    const rect = computeDrawRect({
      sourceWidth: 3000,
      sourceHeight: 2000,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frame: { ...DEFAULT_FRAME, fit: "contain" },
    });
    expect(rect.w).toBeLessThanOrEqual(canvas.width + 0.5);
    expect(rect.h).toBeLessThanOrEqual(canvas.height + 0.5);
    expect(hasLetterbox(rect, canvas.width, canvas.height)).toBe(true);
  });

  it("preserves the source aspect ratio at any scale or offset", () => {
    const rect = computeDrawRect({
      sourceWidth: 1600,
      sourceHeight: 900,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frame: { fit: "cover", offset: { x: 0.1, y: -0.2 }, scale: 1.4 },
    });
    expect(rect.w / rect.h).toBeCloseTo(1600 / 900, 5);
  });

  it("moves the artwork by the offset, measured against the canvas", () => {
    const base = computeDrawRect({
      sourceWidth: 1080,
      sourceHeight: 1080,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frame: DEFAULT_FRAME,
    });
    const shifted = computeDrawRect({
      sourceWidth: 1080,
      sourceHeight: 1080,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frame: { ...DEFAULT_FRAME, offset: { x: 0.25, y: 0 } },
    });
    expect(shifted.x - base.x).toBeCloseTo(0.25 * canvas.width);
  });
});

describe("storageExtensionFor", () => {
  it("maps mime to a truthful extension", () => {
    // The legacy pose path took the extension from the original filename, so a
    // re-encoded JPEG could be stored as .png.
    expect(storageExtensionFor("image/png")).toBe("png");
    expect(storageExtensionFor("image/webp")).toBe("webp");
    expect(storageExtensionFor("image/jpeg")).toBe("jpg");
  });
});
