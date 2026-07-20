export type AssetKind = "character" | "look" | "item" | "environment" | "style";
export type AssetStatus = "draft" | "locked" | "archived";
export type CreationKind = "meme" | "fashion_shot" | "storyboard_shot";
export type ContinuityPolicy = "strict" | "balanced" | "creative";
export type Provider = "openai" | "google";

export type ReferenceRole =
  | "edit_base"
  | "previous_shot"
  | "identity_face"
  | "identity_body"
  | "look"
  | "item"
  | "environment"
  | "style";

export interface ReferenceEntry {
  assetId: string;
  assetVersionId: string;
  imageId: string;
  role: ReferenceRole;
  subjectId?: string;
  hash: string;
  priority: number;
  reproducible?: boolean;
}

export interface DroppedReference extends ReferenceEntry {
  reason: string;
}

export interface GenerationRecipe {
  creationKind: CreationKind;
  sourceEntityType?: "meme" | "shot_version";
  sourceEntityId?: string;
  workflowVersion: string;
  provider: Provider;
  model: string;
  prompt: string;
  references: ReferenceEntry[];
  droppedReferences: DroppedReference[];
  policy: ContinuityPolicy;
  output: {
    width: number;
    height: number;
    aspectRatio: string;
    quality: "draft" | "standard" | "final";
    count: number;
  };
  maskImageId?: string;
  manifestHash: string;
}

