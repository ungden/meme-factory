export type AssetKind = "character" | "look" | "item" | "environment" | "style";
export type AssetStatus = "draft" | "locked" | "archived";
export type ShotStatus = "draft" | "queued" | "generating" | "needs_review" | "approved" | "failed";
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

export interface Asset {
  id: string;
  versionId: string;
  name: string;
  kind: AssetKind;
  status: AssetStatus;
  thumbnail: string;
  coverage: number;
  referenceCount: number;
  notes: string;
  isSample?: boolean;
}

export interface ReferenceEntry {
  assetId: string;
  assetVersionId: string;
  imageId: string;
  role: ReferenceRole;
  subjectId?: string;
  hash: string;
  priority: number;
}

export interface DroppedReference extends ReferenceEntry {
  reason: string;
}

export interface GenerationRecipe {
  shotVersionId: string;
  provider: Provider;
  model: string;
  prompt: string;
  references: ReferenceEntry[];
  droppedReferences: DroppedReference[];
  policy: ContinuityPolicy;
  output: {
    width: number;
    height: number;
    quality: "draft" | "standard" | "final";
    count: number;
  };
  maskImageId?: string;
}

export interface Shot {
  id: string;
  versionId: string;
  code: string;
  title: string;
  status: ShotStatus;
  thumbnail: string;
  parentShotId?: string;
  camera: string;
  lens: string;
}

export interface ContinuityFinding {
  id: string;
  category: "identity" | "look" | "item" | "environment" | "composition";
  status: "pass" | "review" | "fail";
  title: string;
  detail: string;
  evidence?: string;
}

export interface GenerationJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  recipe: GenerationRecipe;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  createdAt: string;
}
