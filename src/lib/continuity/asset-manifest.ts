import { hashBase64, manifestHash } from "./hashing";
import { routeReferences } from "./reference-router";
import type { InlineReferenceImage } from "./meme-manifest";
import type { ContinuityPolicy, GenerationRecipe, ReferenceEntry } from "./types";

export interface CharacterManifestInput {
  prompt: string;
  model: string;
  policy?: ContinuityPolicy;
  characterName: string;
  characterId?: string;
  existingPoseImages?: InlineReferenceImage[];
}

export interface CharacterManifestPlan {
  recipe: GenerationRecipe;
  selectedPoseIndexes: number[];
}

export interface BackgroundManifestInput {
  prompt: string;
  model: string;
  policy?: ContinuityPolicy;
  aspectRatio: string;
  description: string;
}

const CHARACTER_OUTPUT = {
  width: 1024,
  height: 1024,
  aspectRatio: "1:1",
  quality: "standard" as const,
  count: 1,
};

// gemini-image.ts renders backgrounds at imageSize "2K".
const BACKGROUND_OUTPUT_SIZE = 2048;

/**
 * Compile the reference manifest for a character pose generation. Existing poses
 * of the same character are identity references, so they go through the same
 * deterministic router and provider budget as meme generation.
 */
export function buildCharacterManifest(input: CharacterManifestInput): CharacterManifestPlan {
  const poseImageIds = new Map<string, number>();
  const candidates: ReferenceEntry[] = [];

  (input.existingPoseImages ?? []).forEach((image, index) => {
    const hash = hashBase64(image.base64);
    const subjectId = input.characterId ?? `character-draft:${hash.slice(0, 16)}`;
    const imageId = `character-existing-pose:${index}:${hash}`;
    poseImageIds.set(imageId, index);
    candidates.push({
      assetId: input.characterId ?? subjectId,
      assetVersionId: input.characterId
        ? `legacy-character:${input.characterId}:v1`
        : `${subjectId}:v1`,
      imageId,
      role: "identity_body",
      subjectId,
      hash,
      priority: 100 - index,
      reproducible: false,
    });
  });

  const routed = routeReferences({
    provider: "google",
    model: input.model,
    policy: input.policy ?? "balanced",
    references: candidates,
  });
  const selectedIds = new Set(routed.selected.map((reference) => reference.imageId));

  const recipeWithoutHash = {
    creationKind: "character_reference" as const,
    workflowVersion: "character-continuity-v1",
    provider: "google" as const,
    model: input.model,
    prompt: input.prompt,
    references: routed.selected,
    droppedReferences: routed.dropped,
    policy: input.policy ?? "balanced",
    output: CHARACTER_OUTPUT,
  };

  return {
    recipe: { ...recipeWithoutHash, manifestHash: manifestHash(recipeWithoutHash) },
    selectedPoseIndexes: [...poseImageIds.entries()]
      .filter(([imageId]) => selectedIds.has(imageId))
      .map(([, index]) => index),
  };
}

/**
 * Backgrounds carry no reference images today, but they still get a persisted
 * recipe so every billed provider call has an auditable job record.
 */
export function buildBackgroundManifest(input: BackgroundManifestInput): { recipe: GenerationRecipe } {
  const recipeWithoutHash = {
    creationKind: "background" as const,
    workflowVersion: "background-continuity-v1",
    provider: "google" as const,
    model: input.model,
    prompt: input.prompt,
    references: [],
    droppedReferences: [],
    policy: input.policy ?? "balanced",
    output: {
      width: BACKGROUND_OUTPUT_SIZE,
      height: BACKGROUND_OUTPUT_SIZE,
      aspectRatio: input.aspectRatio,
      quality: "standard" as const,
      count: 1,
    },
  };

  return { recipe: { ...recipeWithoutHash, manifestHash: manifestHash(recipeWithoutHash) } };
}
