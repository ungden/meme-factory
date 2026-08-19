// ============================================
// Database Types - AIDA
// ============================================

export interface Project {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  style_prompt: string | null; // AI style instructions for this fanpage
  watermark_url: string | null;
  watermark_position: WatermarkPosition;
  watermark_opacity: number;
  default_format: MemeFormat;
  creator_handle?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  project_id: string;
  continuity_asset_id?: string | null;
  name: string;
  description: string; // personality, traits for AI to understand
  personality: string; // e.g. "vui vẻ, lạc quan, hay nói đùa"
  avatar_url: string | null; // main avatar
  created_at: string;
  updated_at: string;
}

export interface CharacterPose {
  id: string;
  character_id: string;
  name: string; // e.g. "happy", "angry", "surprised"
  emotion: EmotionTag;
  image_url: string;
  description: string | null; // what this pose looks like
  is_transparent: boolean; // has transparent background
  created_at: string;
}

export interface Meme {
  id: string;
  project_id: string;
  source_meme_id?: string | null;
  generation_job_id?: string | null;
  base_image_id?: string | null;
  editor_doc?: unknown;
  composed_locally?: boolean;
  title: string | null;
  original_idea: string; // user's raw input
  generated_content: MemeContent; // AI-generated content
  selected_characters: SelectedCharacter[];
  format: MemeFormat;
  image_url: string | null; // final composed image
  canvas_data: string | null; // legacy, never populated; superseded by editor_doc
  has_watermark: boolean;
  status: MemeStatus;
  created_at: string;
  updated_at: string;
}

// ============================================
// Enums & Supporting Types
// ============================================

/** 3x3 placement grid: corners, edge midpoints and the centre. */
export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type MemeFormat = "1:1" | "9:16" | "16:9" | "4:5";

export type EmotionTag =
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "confused"
  | "cool"
  | "love"
  | "scared"
  | "thinking"
  | "laughing"
  | "crying"
  | "neutral"
  | "excited"
  | "tired"
  | "custom";

export type MemeStatus = "draft" | "generating" | "completed" | "failed";

export interface MemeContent {
  headline: string; // main text on the meme
  subtext?: string; // secondary text
  caption?: string; // social media caption
  image_prompt?: string; // visual-only brief for image generation
  text_rendering_notes?: string; // notes about text placement/treatment on image
  layout_suggestion: LayoutSuggestion;
  tone: string; // "hài hước", "châm biếm", "tình cảm"...
}

export interface LayoutSuggestion {
  text_position: "top" | "bottom" | "center" | "split";
  character_positions: CharacterPlacement[];
  background_color?: string;
  background_suggestion?: string;
}

export interface CharacterPlacement {
  character_id: string;
  pose_id: string;
  position: "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  scale: number; // 0.5 - 2.0
}

export interface SelectedCharacter {
  character_id: string;
  character_name: string;
  pose_id: string;
  pose_name: string;
  emotion: EmotionTag;
}

// ============================================
// API Request/Response Types
// ============================================

export interface ReferenceImage {
  base64: string;
  mimeType: string;
}

export interface GenerateContentRequest {
  project_id: string;
  idea: string;
  tone?: string;
  characters?: { id: string; name: string; personality: string }[];
  adHocCharacters?: string[];
  num_variations?: number; // how many content versions to generate
  referenceImages?: ReferenceImage[];
}

export interface GenerateContentResponse {
  variations: MemeContentVariation[];
}

export interface MemeContentVariation {
  content: MemeContent;
  suggested_characters: SelectedCharacter[];
  reasoning: string; // why this character/pose was chosen
}

export interface GenerateMemeImageRequest {
  project_id: string;
  content: MemeContent;
  characters: SelectedCharacter[];
  format: MemeFormat;
  add_watermark: boolean;
}

// ============================================
// AI Image Generation Types (Nano Banana 2)
// ============================================

export type ImageGenType = "meme" | "character" | "background";

export interface ImageGenMemeParams {
  project_id?: string;
  source_meme_id?: string | null;
  type: "meme";
  headline: string;
  subtext?: string;
  tone: string;
  textPosition: string;
  customPrompt?: string;
  characters: {
    name: string;
    emotion: string;
    description?: string;
    characterId?: string;
    poseId?: string;
    poseImageBase64?: string;
    poseMimeType?: string;
  }[];
  format: string;
  style?: string;
  watermark?: {
    enabled: boolean;
    text?: string;
    logoBase64?: string;
    logoMimeType?: string;
  };
  backgroundDescription?: string;
  referenceImages?: ReferenceImage[];
}

export interface ImageGenCharacterParams {
  project_id?: string;
  type: "character";
  character_id?: string;
  characterName: string;
  characterDescription: string;
  emotion?: string;
  style?: string;
  existingPoseImages?: { base64: string; mimeType: string }[];
  /** Meme-template framing: replaces the full-body rule and reserves caption space. */
  layoutGroup?: "tight_closeup" | "medium_portrait" | "offset_composition";
  subjectSide?: "left" | "right";
  aspectRatio?: MemeFormat;
}

export interface ImageGenBackgroundParams {
  project_id?: string;
  type: "background";
  description: string;
  mood?: string;
  format: string;
}

export type ImageGenRequest =
  | ImageGenMemeParams
  | ImageGenCharacterParams
  | ImageGenBackgroundParams;

export interface ImageGenResponse {
  image: string; // base64 encoded image data
  text?: string; // optional text response from model
  generation_request_id?: string;
  generation_job_id?: string;
  reference_manifest?: {
    selected: number;
    dropped: Array<{ imageId: string; role: string; reason: string }>;
    manifestHash: string;
  };
  pointsUsed?: number;
  pricing?: {
    providerCostUsd: number;
    customerPoints: number;
    markupMultiplier: number;
    effectiveDate: string;
  };
  error?: string;
  code?: string;
}

export type ContinuityAssetKind = "character" | "look" | "item" | "environment" | "style";
export type ContinuityAssetStatus = "draft" | "locked" | "archived";

export interface ContinuityAsset {
  id: string;
  project_id: string;
  legacy_character_id: string | null;
  kind: ContinuityAssetKind;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContinuityAssetVersion {
  id: string;
  asset_id: string;
  version: number;
  status: ContinuityAssetStatus;
  identity_profile_type: "none" | "human" | "mascot" | "product";
  notes: string | null;
  invariants: Record<string, unknown> | unknown[];
  usage_rights: Record<string, unknown>;
  content_hash: string;
  created_by: string;
  created_at: string;
  locked_at: string | null;
}

export interface GenerationJobRecord {
  id: string;
  project_id: string;
  creation_kind: "meme" | "fashion_shot" | "storyboard_shot";
  workflow_version: string;
  provider: "google" | "openai";
  model: string;
  continuity_policy: "strict" | "balanced" | "creative";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  compiled_prompt: string;
  reference_manifest: unknown[];
  dropped_references: unknown[];
  manifest_hash: string;
  requested_output: Record<string, unknown>;
  estimated_points: number;
  actual_points: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProjectWallet {
  project_id: string;
  points: number;
}

export interface ProjectTransaction {
  id: string;
  project_id: string;
  actor_user_id: string | null;
  amount: number;
  type: "topup" | "payment" | "refund";
  description: string | null;
  status: "completed" | "pending" | "failed";
  created_at: string;
}

// ============================================
// Wallet & Payment Types
// ============================================

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  points: number;
  free_trial_claimed: boolean;
  created_at: string;
  updated_at: string;
}

export type TransactionType = "topup" | "payment" | "refund";
export type TransactionStatus = "completed" | "pending" | "failed";

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  status: TransactionStatus;
  reference_id: string | null;
  created_at: string;
}

export type TopupOrderStatus = "pending" | "completed" | "expired" | "failed";

export interface TopupOrder {
  id: string;
  user_id: string;
  amount: number;
  status: TopupOrderStatus;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopupInfo {
  orderId: string;
  amount: number;
  description: string;
  qrUrl: string;
  beneficiary: string;
  bankBin?: string;
  bankName?: string;
  accountName?: string;
}

// ============================================
// Mascot Meme Engine — base images & templates
// ============================================

export type LayoutPresetId = "tight_closeup" | "medium_portrait" | "offset_composition";
export type BaseImageStatus = "draft" | "ready" | "archived";
export type SafeZonesSource = "layout_default" | "authored" | "detected";

export interface ExpressionTag {
  slug: string;
  label_vi: string;
  vibe_group: "positive" | "negative" | "neutral" | "intense" | "playful";
  sort_order: number;
  is_active: boolean;
}

export interface LayoutPreset {
  id: LayoutPresetId;
  label_vi: string;
  description: string | null;
  default_safe_zones: Record<string, unknown>;
  default_text_style: Record<string, unknown>;
  recommended_chars: number;
  sort_order: number;
  is_active: boolean;
}

export interface MascotBaseImage {
  id: string;
  character_id: string;
  legacy_pose_id: string | null;
  expression_slug: string;
  expression_label: string | null;
  layout_preset_id: LayoutPresetId;
  variant_index: number;
  image_url: string;
  storage_bucket: string;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  aspect_ratio: MemeFormat;
  has_transparent_bg: boolean;
  safe_zones: Record<string, unknown>;
  safe_zones_source: SafeZonesSource;
  safe_zones_updated_at: string | null;
  default_text_style: Record<string, unknown>;
  recommended_chars: number;
  watermark_area: Record<string, unknown>;
  status: BaseImageStatus;
  sort_order: number;
  generation_job_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterDna {
  character_id: string;
  summary: string;
  palette: Array<{ name?: string; hex: string; role?: string }>;
  face_traits: string[];
  body_traits: string[];
  tone: Record<string, unknown>;
  background_style: Record<string, unknown>;
  watermark_safe_area: Record<string, unknown>;
  must_preserve: string[];
  may_change: string[];
  updated_by: string | null;
  updated_at: string;
}

export interface MemeExport {
  id: string;
  meme_id: string | null;
  project_id: string;
  base_image_id: string | null;
  format: "png" | "jpg" | "webp";
  aspect_ratio: MemeFormat;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  had_watermark: boolean;
  exported_by: string | null;
  created_at: string;
}

export interface MemeCollection {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface TextPreset {
  id: string;
  project_id: string | null;
  name: string;
  style: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
}

// ============================================
// Format Dimensions
// ============================================

export const FORMAT_DIMENSIONS: Record<MemeFormat, { width: number; height: number; label: string }> = {
  "1:1": { width: 1080, height: 1080, label: "Square (Facebook/Instagram)" },
  "9:16": { width: 1080, height: 1920, label: "Story/Reels (Instagram/TikTok)" },
  "16:9": { width: 1920, height: 1080, label: "Landscape (YouTube/Twitter)" },
  "4:5": { width: 1080, height: 1350, label: "Portrait (Instagram Feed)" },
};
