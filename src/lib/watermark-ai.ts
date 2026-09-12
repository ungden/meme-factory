import sharp from "sharp";
import { customerQuote } from "@/lib/ai-pricing";

// Dedicated transparent-logo model; never changes the project's image/video model.
export const WATERMARK_AI_MODEL = "gpt-image-1.5";
export const WATERMARK_JOB_COLUMNS = "id,mode,status,max_points,charged_points,output_url,error,created_at,expires_at";
export type WatermarkAiMode = "remove_background" | "generate";

export function watermarkPrompt(mode: WatermarkAiMode, description: string) {
  const base = "Create one production-ready watermark as a PNG with a genuinely transparent alpha background. No white background, no checkerboard drawing, no mockup, no border panel. Keep the mark legible at small sizes. Leave transparent padding around the artwork.";
  return mode === "remove_background"
    ? `${base} Remove only the background of the supplied logo. Preserve the original text exactly, shapes, colours, proportions and identity. Do not redesign, add elements, crop or translate the logo.`
    : `${base} Design a polished compact brand watermark. The following is the customer's design brief (not technical settings): ${description.trim()}`;
}

export async function prepareWatermarkReference(bytes: Buffer) {
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error("Ảnh tối đa 3 MB.");
  const image = sharp(bytes, { limitInputPixels: 16_777_216, failOn: "error" });
  const meta = await image.metadata();
  if (!["png", "webp", "jpeg"].includes(meta.format || "") || (meta.pages || 1) !== 1)
    throw new Error("Chọn ảnh JPG, PNG hoặc WebP tĩnh.");
  // Bound input image tokens/bytes independently of the upload filename.
  return image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

export const WATERMARK_AI_MAX_POINTS = customerQuote(0.15).customerPoints;
export const WATERMARK_AI_MAX_USD = 0.15;
export function watermarkProviderInput(mode: WatermarkAiMode, prompt: string) {
  return { model: WATERMARK_AI_MODEL, prompt: watermarkPrompt(mode, prompt), n: 1, size: "1536x1024", quality: "medium", background: "transparent", output_format: "png" };
}
type Usage = { output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };
export function watermarkUsageCost(usage?: Usage): number | null {
  const output = usage?.output_tokens;
  const text = usage?.input_tokens_details?.text_tokens;
  const image = usage?.input_tokens_details?.image_tokens;
  if (![output, text, image].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  return Number(((text! * 5 + image! * 8 + output! * 32) / 1_000_000).toFixed(6));
}
export function watermarkPoints(cost: number, cap: number) {
  return Math.min(cap, customerQuote(cost).customerPoints);
}
