import { describe, expect, it } from "vitest";
import { buildBackgroundManifest, buildCharacterManifest } from "./asset-manifest";

const image = (value: string) => ({
  base64: Buffer.from(value).toString("base64"),
  mimeType: "image/png",
});

const characterInput = {
  prompt: "Vẽ nhân vật Foxy đang cười",
  model: "gemini-3.1-flash-image",
  characterName: "Foxy",
};

describe("character manifest", () => {
  it("routes existing poses as identity references", () => {
    const plan = buildCharacterManifest({
      ...characterInput,
      characterId: "11111111-1111-4111-8111-111111111111",
      existingPoseImages: [image("pose-a"), image("pose-b")],
    });

    expect(plan.recipe.creationKind).toBe("character_reference");
    expect(plan.recipe.references).toHaveLength(2);
    expect(plan.recipe.references.every((reference) => reference.role === "identity_body")).toBe(true);
    expect(plan.recipe.references[0].assetVersionId).toBe(
      "legacy-character:11111111-1111-4111-8111-111111111111:v1"
    );
    expect(plan.selectedPoseIndexes).toEqual([0, 1]);
  });

  it("drops duplicate poses instead of sending them twice", () => {
    const plan = buildCharacterManifest({
      ...characterInput,
      existingPoseImages: [image("pose-a"), image("pose-a"), image("pose-c")],
    });

    expect(plan.selectedPoseIndexes).toEqual([0, 2]);
    expect(plan.recipe.droppedReferences).toHaveLength(1);
    expect(plan.recipe.droppedReferences[0].reason).toContain("Duplicate");
  });

  it("applies the Nano Banana 2 identity budget", () => {
    const plan = buildCharacterManifest({
      ...characterInput,
      existingPoseImages: ["a", "b", "c", "d", "e", "f"].map(image),
    });

    expect(plan.selectedPoseIndexes).toEqual([0, 1, 2, 3]);
    expect(plan.recipe.droppedReferences).toHaveLength(2);
    expect(plan.recipe.droppedReferences[0].reason).toContain("character reference limit");
  });

  it("hashes the same input to the same manifest and reacts to prompt changes", () => {
    const first = buildCharacterManifest({ ...characterInput, existingPoseImages: [image("pose-a")] });
    const same = buildCharacterManifest({ ...characterInput, existingPoseImages: [image("pose-a")] });
    const other = buildCharacterManifest({
      ...characterInput,
      prompt: "Vẽ nhân vật Foxy đang buồn",
      existingPoseImages: [image("pose-a")],
    });

    expect(same.recipe.manifestHash).toBe(first.recipe.manifestHash);
    expect(other.recipe.manifestHash).not.toBe(first.recipe.manifestHash);
  });
});

describe("background manifest", () => {
  it("records an auditable recipe without references", () => {
    const plan = buildBackgroundManifest({
      prompt: "Background quán cà phê Sài Gòn",
      model: "gemini-3.1-flash-image",
      aspectRatio: "16:9",
      description: "Quán cà phê Sài Gòn buổi sáng",
    });

    expect(plan.recipe.creationKind).toBe("background");
    expect(plan.recipe.references).toEqual([]);
    expect(plan.recipe.droppedReferences).toEqual([]);
    expect(plan.recipe.output.aspectRatio).toBe("16:9");
    expect(plan.recipe.manifestHash).toHaveLength(64);
  });
});
