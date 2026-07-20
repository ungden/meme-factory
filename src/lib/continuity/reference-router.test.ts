import { describe, expect, it } from "vitest";
import { buildMemeManifest } from "./meme-manifest";
import { routeReferences } from "./reference-router";
import type { ReferenceEntry } from "./types";

const makeRef = (index: number, role: ReferenceEntry["role"]): ReferenceEntry => ({
  assetId: `asset_${index}`,
  assetVersionId: `version_${index}`,
  imageId: `image_${index}`,
  role,
  hash: `hash_${index}`,
  priority: 100 - index,
});

const image = (value: string) => ({
  base64: Buffer.from(value).toString("base64"),
  mimeType: "image/png",
});

describe("reference router", () => {
  it("keeps the OpenAI edit base first during mask repair", () => {
    const result = routeReferences({
      provider: "openai",
      model: "gpt-image-2",
      policy: "strict",
      isRepair: true,
      references: [
        makeRef(1, "identity_face"),
        makeRef(2, "edit_base"),
        makeRef(3, "style"),
      ],
    });
    expect(result.selected[0].role).toBe("edit_base");
  });

  it("enforces Nano Banana Pro category limits with reasons", () => {
    const references = Array.from({ length: 7 }, (_, index) => makeRef(index, "item"));
    const result = routeReferences({
      provider: "google",
      model: "gemini-3-pro-image",
      policy: "balanced",
      references,
    });
    expect(result.selected).toHaveLength(6);
    expect(result.dropped[0].reason).toContain("object reference limit");
  });

  it("enforces Nano Banana 2's four-character continuity limit", () => {
    const references = Array.from({ length: 5 }, (_, index) => makeRef(index, "identity_face"));
    const result = routeReferences({
      provider: "google",
      model: "gemini-3.1-flash-image",
      policy: "strict",
      references,
    });
    expect(result.selected).toHaveLength(4);
    expect(result.dropped[0].reason).toContain("character reference limit");
  });

  it("is deterministic regardless of reference input order", () => {
    const references = [
      makeRef(1, "style"),
      makeRef(2, "identity_face"),
      makeRef(3, "environment"),
    ];
    const a = routeReferences({
      provider: "openai",
      model: "gpt-image-2",
      policy: "strict",
      references,
    });
    const b = routeReferences({
      provider: "openai",
      model: "gpt-image-2",
      policy: "strict",
      references: [...references].reverse(),
    });
    expect(a).toEqual(b);
  });

  it("deduplicates identical image bytes", () => {
    const first = makeRef(1, "identity_face");
    const duplicate = { ...makeRef(2, "style"), hash: first.hash };
    const result = routeReferences({
      provider: "google",
      model: "gemini-3.1-flash-image-preview",
      policy: "balanced",
      references: [duplicate, first],
    });
    expect(result.selected).toHaveLength(1);
    expect(result.dropped[0].reason).toContain("Duplicate");
  });
});

describe("meme generation manifest", () => {
  it("routes a 15-reference meme request into Gemini's 14-image budget", () => {
    const characters = Array.from({ length: 4 }, (_, index) => ({
      name: `Character ${index}`,
      emotion: "neutral",
      characterId: `char-${index}`,
      poseId: `pose-${index}`,
      poseImageBase64: image(`character-${index}`).base64,
      poseMimeType: "image/png",
    }));
    const referenceImages = Array.from({ length: 10 }, (_, index) => image(`context-${index}`));
    const plan = buildMemeManifest({
      prompt: "Create a Vietnamese finance meme",
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "1:1",
      characters,
      referenceImages,
      watermark: { enabled: true, logoBase64: image("watermark").base64 },
    });

    expect(plan.recipe.references).toHaveLength(14);
    expect(plan.recipe.droppedReferences).toHaveLength(1);
    expect(plan.recipe.droppedReferences[0].reason).toContain("total reference limit");
    expect(plan.includeWatermarkLogo).toBe(true);
  });

  it("produces the same manifest hash for the same request", () => {
    const input = {
      prompt: "Same prompt",
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "4:5",
      characters: [],
      referenceImages: [image("context")],
    };
    expect(buildMemeManifest(input).recipe.manifestHash).toBe(
      buildMemeManifest(input).recipe.manifestHash
    );
  });
});
