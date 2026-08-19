import { FORMAT_DIMENSIONS, type MemeFormat } from "@/types/database";

/**
 * Upload pipeline for manually added meme templates.
 *
 * Deliberately NOT `image-utils.ts`: `compressImageToBase64` flattens alpha onto
 * white and re-encodes JPEG q0.8 at 1024px for files over 400KB, and passes
 * everything smaller through untouched. Both branches are wrong here — the first
 * destroys cutouts and softens edges that then get scaled onto a 1080px export
 * canvas, the second lets a raw 4000x3000 phone photo with EXIF into a public
 * bucket. That helper stays where it belongs: preparing inline data for Gemini.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MIN_SHORT_EDGE = 400;
export const WARN_SHORT_EDGE = 640;
export const MAX_LONG_EDGE = 2048;

export const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface RejectionReason {
  code: "mime" | "animated" | "too_large" | "too_small";
  message: string;
}

export interface AcceptCheckInput {
  type: string;
  size: number;
  width?: number;
  height?: number;
  isAnimated?: boolean;
}

/** Returns null when the file is acceptable. */
export function checkAcceptable(input: AcceptCheckInput): RejectionReason | null {
  if (!ACCEPTED_MIME_TYPES.includes(input.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return { code: "mime", message: "Chỉ nhận PNG, JPG hoặc WebP." };
  }
  if (input.isAnimated) {
    return { code: "animated", message: "Ảnh động không dùng làm mẫu được." };
  }
  if (input.size > MAX_FILE_BYTES) {
    return {
      code: "too_large",
      message: `Ảnh nặng quá ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB.`,
    };
  }
  if (input.width && input.height && Math.min(input.width, input.height) < MIN_SHORT_EDGE) {
    return {
      code: "too_small",
      message: `Cạnh ngắn nhất phải từ ${MIN_SHORT_EDGE}px trở lên.`,
    };
  }
  return null;
}

export function lowResolutionWarning(width: number, height: number): string | null {
  if (Math.min(width, height) >= WARN_SHORT_EDGE) return null;
  return `Ảnh hơi nhỏ (${width}×${height}px), khi xuất ra khổ lớn có thể vỡ nét.`;
}

// ============================================
// Aspect ratio
// ============================================

export interface AspectSuggestion {
  format: MemeFormat;
  /** Fraction of the source lost when cover-cropping into this canvas, 0..1. */
  cropLoss: number;
}

const FORMATS = Object.keys(FORMAT_DIMENSIONS) as MemeFormat[];

function ratioOf(format: MemeFormat) {
  const { width, height } = FORMAT_DIMENSIONS[format];
  return width / height;
}

/**
 * Picks the canvas whose shape is closest to the real image, and reports how much
 * gets cropped. The auto-mirror assumed 1:1 for everything and never looked.
 */
export function suggestAspect(width: number, height: number): AspectSuggestion {
  const sourceRatio = width / height;
  let best: AspectSuggestion = { format: "1:1", cropLoss: 1 };

  for (const format of FORMATS) {
    const target = ratioOf(format);
    // Cover-fit keeps the smaller relative dimension and crops the other.
    const kept = sourceRatio > target ? target / sourceRatio : sourceRatio / target;
    const cropLoss = 1 - kept;
    if (cropLoss < best.cropLoss) best = { format, cropLoss };
  }

  return best;
}

// ============================================
// Frame maths
// ============================================

export interface Frame {
  fit: "cover" | "contain";
  offset: { x: number; y: number };
  scale: number;
}

export const DEFAULT_FRAME: Frame = { fit: "cover", offset: { x: 0, y: 0 }, scale: 1 };

export interface DrawRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the artwork lands on the canvas. Mirrors `drawBase` in meme-doc/render.ts
 * so the upload preview and the exported PNG agree.
 */
export function computeDrawRect(params: {
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  frame: Frame;
}): DrawRect {
  const { sourceWidth, sourceHeight, canvasWidth, canvasHeight, frame } = params;
  const imageRatio = sourceWidth / sourceHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const useWidth = frame.fit === "cover" ? imageRatio < canvasRatio : imageRatio > canvasRatio;

  const drawWidth = (useWidth ? canvasWidth : canvasHeight * imageRatio) * frame.scale;
  const drawHeight = (useWidth ? canvasWidth / imageRatio : canvasHeight) * frame.scale;

  return {
    x: (canvasWidth - drawWidth) / 2 + frame.offset.x * canvasWidth,
    y: (canvasHeight - drawHeight) / 2 + frame.offset.y * canvasHeight,
    w: drawWidth,
    h: drawHeight,
  };
}

/** True when the artwork leaves bare canvas visible — the caller must pick a pad colour. */
export function hasLetterbox(rect: DrawRect, canvasWidth: number, canvasHeight: number): boolean {
  return rect.x > 0.5 || rect.y > 0.5 || rect.x + rect.w < canvasWidth - 0.5 || rect.y + rect.h < canvasHeight - 0.5;
}

// ============================================
// Browser-side measurement, hashing and normalisation
// ============================================

export interface MeasuredImage {
  width: number;
  height: number;
  hasAlpha: boolean;
}

export async function measureImage(file: Blob): Promise<MeasuredImage> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: await detectAlpha(bitmap),
    };
  } finally {
    bitmap.close();
  }
}

/** Samples a downscaled copy; a full-size scan of a 4000px image is wasteful. */
async function detectAlpha(bitmap: ImageBitmap): Promise<boolean> {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

export async function hashBytes(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Shrinks only when the artwork is larger than any canvas needs. Never JPEG, never
 * a white fill — a template may legitimately be a transparent cutout.
 */
export async function normaliseForTemplate(file: File): Promise<File> {
  const measured = await measureImage(file);
  const longEdge = Math.max(measured.width, measured.height);
  if (longEdge <= MAX_LONG_EDGE) return file;

  const scale = MAX_LONG_EDGE / longEdge;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(measured.width * scale);
  canvas.height = Math.round(measured.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // PNG keeps alpha; WebP is only chosen for opaque photographic sources where
  // PNG would be needlessly large.
  const type = measured.hasAlpha ? "image/png" : "image/webp";
  const quality = measured.hasAlpha ? undefined : 0.92;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) return file;

  const extension = type === "image/png" ? "png" : "webp";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${extension}`, { type });
}

export function storageExtensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
