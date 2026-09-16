import { describe, expect, it } from "vitest";
import {
  MAX_REF_IMAGES,
  MAX_REF_SIZE_MB,
  buildAutoVisualPrompt,
  isAcceptableReferenceFile,
  type ContentVariation,
} from "./visual-prompt";

const variation = (overrides: Partial<ContentVariation> = {}) =>
  ({
    content: {},
    suggested_characters: [],
    headline: "Câu chữ chính",
    tone: "hài hước",
    text_position: "bottom",
    ...overrides,
  }) as ContentVariation;

describe("buildAutoVisualPrompt", () => {
  it("returns an empty brief when there is nothing to say", () => {
    expect(buildAutoVisualPrompt(variation())).toBe("");
  });

  // The two labelled blocks exist so the model does not paint the text
  // instructions onto the picture.
  it("keeps the image brief and the text notes in separate labelled blocks", () => {
    const prompt = buildAutoVisualPrompt(
      variation({
        image_prompt: "Hai chị em bên đĩa bánh",
        text_rendering_notes: "Chữ trắng, viền đen, đặt dưới",
      }),
    );
    expect(prompt).toContain("[IMAGE BRIEF");
    expect(prompt).toContain("[TEXT RENDERING NOTES");
    expect(prompt.indexOf("[IMAGE BRIEF")).toBeLessThan(
      prompt.indexOf("[TEXT RENDERING NOTES"),
    );
  });

  it("puts the text notes last so they cannot be read as scene description", () => {
    const prompt = buildAutoVisualPrompt(
      variation({
        image_prompt: "Bối cảnh chính",
        text_rendering_notes: "Ghi chú chữ",
        visual_direction: { scene: "Bàn ăn", art_style: "photoreal" },
      }),
    );
    expect(prompt.trim().endsWith("Ghi chú chữ")).toBe(true);
  });

  it("emits the visual direction fields in a stable order", () => {
    const prompt = buildAutoVisualPrompt(
      variation({
        visual_direction: {
          art_style: "photoreal",
          lighting: "ánh sáng cửa sổ",
          camera: "35mm",
          composition: "trung tâm",
          character_styling: "áo thun",
          scene: "bàn ăn",
        },
      }),
    );
    expect(prompt.split("\n")).toEqual([
      "Bối cảnh: bàn ăn",
      "Nhân vật/Thần thái/Outfit: áo thun",
      "Bố cục: trung tâm",
      "Góc máy: 35mm",
      "Ánh sáng: ánh sáng cửa sổ",
      "Phong cách: photoreal",
    ]);
  });

  it("omits every field the variation left blank", () => {
    const prompt = buildAutoVisualPrompt(
      variation({ visual_direction: { scene: "bàn ăn", camera: "" } }),
    );
    expect(prompt).toBe("Bối cảnh: bàn ăn");
  });

  it("never emits a stray blank line between blocks", () => {
    const prompt = buildAutoVisualPrompt(
      variation({
        image_prompt: "Ảnh",
        visual_direction: { scene: "", camera: "35mm" },
        text_rendering_notes: "Chữ",
      }),
    );
    expect(prompt).not.toMatch(/\n\s*\n/);
  });
});

describe("isAcceptableReferenceFile", () => {
  it("accepts an image within the size cap", () => {
    expect(
      isAcceptableReferenceFile({ type: "image/png", size: 1024 }),
    ).toBe(true);
  });

  it("rejects a non-image", () => {
    expect(
      isAcceptableReferenceFile({ type: "application/pdf", size: 1024 }),
    ).toBe(false);
  });

  it("rejects an image over the size cap", () => {
    expect(
      isAcceptableReferenceFile({
        type: "image/png",
        size: MAX_REF_SIZE_MB * 1024 * 1024 + 1,
      }),
    ).toBe(false);
  });

  it("accepts an image exactly at the cap", () => {
    expect(
      isAcceptableReferenceFile({
        type: "image/png",
        size: MAX_REF_SIZE_MB * 1024 * 1024,
      }),
    ).toBe(true);
  });

  it("keeps the reference limit small enough for the provider", () => {
    expect(MAX_REF_IMAGES).toBeGreaterThan(0);
    expect(MAX_REF_IMAGES).toBeLessThanOrEqual(4);
  });
});
