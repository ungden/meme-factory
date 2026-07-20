import { createHash } from "node:crypto";
import { routeReferences } from "./reference-router";
import type {
  ContinuityPolicy,
  GenerationRecipe,
  ReferenceEntry,
} from "./types";

export interface InlineReferenceImage {
  base64: string;
  mimeType: string;
}

export interface MemeReferenceCharacter {
  name: string;
  emotion: string;
  description?: string;
  characterId?: string;
  poseId?: string;
  poseImageBase64?: string;
  poseMimeType?: string;
}

export interface MemeManifestInput {
  prompt: string;
  model: string;
  policy?: ContinuityPolicy;
  aspectRatio: string;
  characters: MemeReferenceCharacter[];
  referenceImages?: InlineReferenceImage[];
  watermark?: {
    enabled: boolean;
    logoBase64?: string;
    logoMimeType?: string;
  };
  sourceMemeId?: string;
}

export interface MemeManifestPlan {
  recipe: GenerationRecipe;
  selectedCharacterIndexes: number[];
  selectedContextIndexes: number[];
  includeWatermarkLogo: boolean;
}

function hashBase64(value: string) {
  return createHash("sha256").update(Buffer.from(value, "base64")).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function manifestHash(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function buildMemeManifest(input: MemeManifestInput): MemeManifestPlan {
  const candidates: ReferenceEntry[] = [];
  const characterImageIds = new Map<string, number>();
  const contextImageIds = new Map<string, number>();

  input.characters.forEach((character, index) => {
    if (!character.poseImageBase64) return;
    const hash = hashBase64(character.poseImageBase64);
    const subjectId = character.characterId ?? `adhoc-character:${hash.slice(0, 16)}`;
    const imageId = character.poseId
      ? `character-pose:${character.poseId}`
      : `character-inline:${hash}`;
    characterImageIds.set(imageId, index);
    candidates.push({
      assetId: character.characterId ?? subjectId,
      assetVersionId: character.characterId
        ? `legacy-character:${character.characterId}:v1`
        : `${subjectId}:v1`,
      imageId,
      role: "identity_body",
      subjectId,
      hash,
      priority: 100 - index,
      reproducible: false,
    });
  });

  (input.referenceImages ?? []).forEach((reference, index) => {
    const hash = hashBase64(reference.base64);
    const imageId = `context-inline:${index}:${hash}`;
    contextImageIds.set(imageId, index);
    candidates.push({
      assetId: `adhoc-reference:${hash.slice(0, 16)}`,
      assetVersionId: `adhoc-reference:${hash.slice(0, 16)}:v1`,
      imageId,
      role: "style",
      hash,
      priority: 60 - index,
      reproducible: false,
    });
  });

  let watermarkImageId: string | null = null;
  if (input.watermark?.enabled && input.watermark.logoBase64) {
    const hash = hashBase64(input.watermark.logoBase64);
    watermarkImageId = `watermark-inline:${hash}`;
    candidates.push({
      assetId: `brand-watermark:${hash.slice(0, 16)}`,
      assetVersionId: `brand-watermark:${hash.slice(0, 16)}:v1`,
      imageId: watermarkImageId,
      role: "item",
      hash,
      priority: 80,
      reproducible: false,
    });
  }

  const routed = routeReferences({
    provider: "google",
    model: input.model,
    policy: input.policy ?? "balanced",
    references: candidates,
  });
  const selectedIds = new Set(routed.selected.map((reference) => reference.imageId));
  const recipeWithoutHash = {
    creationKind: "meme" as const,
    sourceEntityType: input.sourceMemeId ? ("meme" as const) : undefined,
    sourceEntityId: input.sourceMemeId,
    workflowVersion: "meme-continuity-v1",
    provider: "google" as const,
    model: input.model,
    prompt: input.prompt,
    references: routed.selected,
    droppedReferences: routed.dropped,
    policy: input.policy ?? "balanced",
    output: {
      width: 1024,
      height: 1024,
      aspectRatio: input.aspectRatio,
      quality: "standard" as const,
      count: 1,
    },
  };

  return {
    recipe: {
      ...recipeWithoutHash,
      manifestHash: manifestHash(recipeWithoutHash),
    },
    selectedCharacterIndexes: [...characterImageIds.entries()]
      .filter(([imageId]) => selectedIds.has(imageId))
      .map(([, index]) => index),
    selectedContextIndexes: [...contextImageIds.entries()]
      .filter(([imageId]) => selectedIds.has(imageId))
      .map(([, index]) => index),
    includeWatermarkLogo: watermarkImageId ? selectedIds.has(watermarkImageId) : false,
  };
}

