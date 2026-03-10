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
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  project_id: string;
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
  title: string | null;
  original_idea: string; // user's raw input
  generated_content: MemeContent; // AI-generated content
  selected_characters: SelectedCharacter[];
  format: MemeFormat;
  image_url: string | null; // final composed image
  canvas_data: string | null; // fabric.js JSON for re-editing
  has_watermark: boolean;
  status: MemeStatus;
  created_at: string;
  updated_at: string;
}

// ============================================
// Enums & Supporting Types
// ============================================

export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

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
    poseImageBase64?: string;
    poseMimeType?: string;
  }[];
  format: string;
  style?: string;
  backgroundDescription?: string;
  referenceImages?: ReferenceImage[];
}

export interface ImageGenCharacterParams {
  type: "character";
  characterName: string;
  characterDescription: string;
  emotion: string;
  style?: string;
  existingPoseImages?: { base64: string; mimeType: string }[];
}

export interface ImageGenBackgroundParams {
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
  error?: string;
  code?: string;
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
// Format Dimensions
// ============================================

export const FORMAT_DIMENSIONS: Record<MemeFormat, { width: number; height: number; label: string }> = {
  "1:1": { width: 1080, height: 1080, label: "Square (Facebook/Instagram)" },
  "9:16": { width: 1080, height: 1920, label: "Story/Reels (Instagram/TikTok)" },
  "16:9": { width: 1920, height: 1080, label: "Landscape (YouTube/Twitter)" },
  "4:5": { width: 1080, height: 1350, label: "Portrait (Instagram Feed)" },
};
