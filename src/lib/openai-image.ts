import { getOpenAiApiKey } from "@/lib/server-secrets";
import type { GeneratedImageResult, GenerateMemeImageParams } from "@/lib/gemini-image";
import { compileMemeImagePrompt } from "@/lib/gemini-image";
import type { ImageQuality, ImageResolution } from "@/lib/ai-pricing";

/**
 * GPT Image 2 adapter.
 *
 * Used for memes whose caption is rendered by the model. OpenAI documents
 * "improved text rendering" for this model, which is the one place in this app
 * where the provider still draws Vietnamese type. Mascot artwork carries no text,
 * so it stays on Gemini where it is cheaper.
 *
 * Docs: https://developers.openai.com/api/docs/guides/image-generation
 */

export const OPENAI_IMAGE_MODEL = "gpt-image-2";

/** Sizes OpenAI publishes a price for. Every request maps onto one of these so a
 *  cost estimate is never a guess. */
const FORMAT_TO_SIZE: Record<string, { size: string; resolution: ImageResolution }> = {
  "1:1": { size: "1024x1024", resolution: "1024x1024" },
  "16:9": { size: "1536x1024", resolution: "1536x1024" },
  "9:16": { size: "1024x1536", resolution: "1024x1536" },
  // 4:5 has no published price; the nearest priced portrait is 2:3. The extra
  // height is cropped downstream by the canvas, and the quote stays truthful.
  "4:5": { size: "1024x1536", resolution: "1024x1536" },
};

export function openAiSizeFor(format: string) {
  return FORMAT_TO_SIZE[format] ?? FORMAT_TO_SIZE["1:1"];
}

export interface OpenAiImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

export interface GenerateOpenAiMemeParams extends GenerateMemeImageParams {
  quality?: ImageQuality;
}

interface OpenAiImageResponse {
  data?: { b64_json?: string; revised_prompt?: string }[];
  usage?: OpenAiImageUsage;
  error?: { message?: string; code?: string };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Buffer.from(base64, "base64");
  return new Blob([new Uint8Array(bytes)], { type: mimeType || "image/png" });
}

async function callOpenAi(path: string, body: BodyInit, headers: Record<string, string>) {
  const apiKey = await getOpenAiApiKey();
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, ...headers },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAiImageResponse;
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI trả về ${response.status}`;
    // Surface moderation distinctly; the caller maps it to a safe user message.
    if (response.status === 400 && /moderation|safety/i.test(message)) {
      throw new Error(`SAFETY_BLOCKED: ${message}`);
    }
    if (response.status === 429) throw new Error(`rate limit: ${message}`);
    throw new Error(message);
  }

  const image = payload.data?.[0]?.b64_json;
  if (!image) throw new Error("Không nhận được kết quả từ AI. Vui lòng thử lại.");

  return { image, text: payload.data?.[0]?.revised_prompt, usage: payload.usage };
}

/**
 * Renders a whole meme, caption included. Reference images go through the edits
 * endpoint, which is how GPT Image 2 accepts more than one input image.
 */
export async function generateMemeImageWithOpenAI(
  params: GenerateOpenAiMemeParams
): Promise<GeneratedImageResult> {
  const prompt = compileMemeImagePrompt(params);
  const { size } = openAiSizeFor(params.format);
  const quality = params.quality ?? "medium";

  const references = [
    ...params.characters.filter((character) => character.poseImageBase64),
    ...(params.watermark?.enabled && params.watermark.logoBase64
      ? [{ poseImageBase64: params.watermark.logoBase64, poseMimeType: params.watermark.logoMimeType }]
      : []),
    ...(params.referenceImages ?? []).map((image) => ({
      poseImageBase64: image.base64,
      poseMimeType: image.mimeType,
    })),
  ];

  if (references.length === 0) {
    const result = await callOpenAi(
      "images/generations",
      JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size,
        quality,
        output_format: "png",
      }),
      { "Content-Type": "application/json" }
    );
    return toResult(result);
  }

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "png");
  references.forEach((reference, index) => {
    const mimeType = reference.poseMimeType || "image/png";
    const extension = mimeType.includes("webp") ? "webp" : mimeType.includes("jpeg") ? "jpg" : "png";
    form.append("image[]", base64ToBlob(reference.poseImageBase64!, mimeType), `ref-${index}.${extension}`);
  });

  const result = await callOpenAi("images/edits", form, {});
  return toResult(result);
}

function toResult(result: { image: string; text?: string; usage?: OpenAiImageUsage }): GeneratedImageResult {
  return {
    image: result.image,
    text: result.text,
    // Reuse the Gemini-shaped usage field so generation_jobs stores one format.
    usage: result.usage
      ? {
          promptTokenCount: result.usage.input_tokens,
          candidatesTokenCount: result.usage.output_tokens,
          totalTokenCount: (result.usage.input_tokens ?? 0) + (result.usage.output_tokens ?? 0),
          promptTokensDetails: [
            { modality: "TEXT", tokenCount: result.usage.input_tokens_details?.text_tokens },
            { modality: "IMAGE", tokenCount: result.usage.input_tokens_details?.image_tokens },
          ],
        }
      : undefined,
  };
}

/** Actual cost from reported usage; falls back to the pre-flight estimate. */
export function calculateOpenAiActualCost(params: {
  usage?: OpenAiImageUsage;
  fallbackUsd: number;
}): number {
  const usage = params.usage;
  if (!usage?.output_tokens) return params.fallbackUsd;

  const textTokens = usage.input_tokens_details?.text_tokens ?? 0;
  const imageTokens = usage.input_tokens_details?.image_tokens ?? 0;
  // developers.openai.com/api/docs/pricing, gpt-image-2 standard tier.
  const usd = (textTokens * 5 + imageTokens * 8 + usage.output_tokens * 30) / 1_000_000;
  return Number(usd.toFixed(6));
}
