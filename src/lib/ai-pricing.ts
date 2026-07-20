// Central AI image pricing catalog.
//
// Provider prices are USD Standard API prices, effective 2026-07-21.
// Customer prices use a 50% markup (cost x 1.5), then round up to whole
// AIDA points using the cheapest point package so every paid package covers
// the target markup.

export const AI_PRICING_EFFECTIVE_DATE = "2026-07-21";
export const AI_PRICE_MARKUP_MULTIPLIER = 1.5;
export const AI_PRICE_MARKUP_PERCENT = 50;
export const AI_PRICING_USD_VND = 26_500;
export const BILLING_POINT_FLOOR_VND = 499;

export const AI_PRICING_SOURCES = {
  google: "https://ai.google.dev/gemini-api/docs/pricing",
  openai: "https://developers.openai.com/api/docs/guides/image-generation#calculating-costs",
} as const;

export type ImagePricingModel =
  | "gemini-3.1-flash-lite-image"
  | "gemini-3.1-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image"
  | "gpt-image-2";

export type ImageResolution =
  | "0.5K"
  | "1K"
  | "2K"
  | "4K"
  | "1024x1024"
  | "1024x1536"
  | "1536x1024";

export type ImageQuality = "low" | "medium" | "high";

export interface ImagePricingInput {
  model: ImagePricingModel;
  resolution: ImageResolution;
  quality?: ImageQuality;
  inputImageCount?: number;
  inputTextTokens?: number;
  prompt?: string;
  outputCount?: number;
}

export interface ImagePriceEstimate {
  provider: "google" | "openai";
  model: ImagePricingModel;
  resolution: ImageResolution;
  quality?: ImageQuality;
  inputImageCount: number;
  inputTextTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  providerCostUsd: number;
  customerPriceUsd: number;
  customerPriceVnd: number;
  customerPoints: number;
  markupMultiplier: number;
  effectiveDate: string;
  sourceUrl: string;
}

export interface GoogleImageUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
  candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
}

const GOOGLE_OUTPUT_USD: Record<string, Partial<Record<ImageResolution, number>>> = {
  "gemini-3.1-flash-lite-image": { "1K": 0.0336 },
  "gemini-3.1-flash-image": { "0.5K": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini-3.1-flash-image-preview": { "0.5K": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini-3-pro-image": { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
};

const OPENAI_GPT_IMAGE_2_OUTPUT_USD: Record<ImageQuality, Partial<Record<ImageResolution, number>>> = {
  low: { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
  medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
  high: { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 },
};

function roundUsd(value: number) {
  return Number(value.toFixed(6));
}

function estimatePromptTokens(prompt?: string, explicitTokens?: number) {
  if (typeof explicitTokens === "number" && Number.isFinite(explicitTokens)) {
    return Math.max(0, Math.ceil(explicitTokens));
  }
  // Vietnamese and structured prompts commonly use more tokens per character
  // than plain English. Dividing by 3 is deliberately conservative.
  return prompt ? Math.ceil(prompt.length / 3) : 0;
}

function providerFor(model: ImagePricingModel) {
  return model === "gpt-image-2" ? "openai" as const : "google" as const;
}

function customerQuote(providerCostUsd: number) {
  const customerPriceUsd = providerCostUsd * AI_PRICE_MARKUP_MULTIPLIER;
  const customerPriceVnd = customerPriceUsd * AI_PRICING_USD_VND;
  return {
    customerPriceUsd: roundUsd(customerPriceUsd),
    customerPriceVnd: Math.ceil(customerPriceVnd),
    customerPoints: Math.max(1, Math.ceil(customerPriceVnd / BILLING_POINT_FLOOR_VND)),
  };
}

export function estimateImageGenerationPrice(input: ImagePricingInput): ImagePriceEstimate {
  const provider = providerFor(input.model);
  const inputImageCount = Math.max(0, Math.floor(input.inputImageCount ?? 0));
  const inputTextTokens = estimatePromptTokens(input.prompt, input.inputTextTokens);
  const outputCount = Math.max(1, Math.floor(input.outputCount ?? 1));
  let inputCostUsd = 0;
  let outputCostUsd = 0;

  if (provider === "google") {
    const outputUnitCost = GOOGLE_OUTPUT_USD[input.model]?.[input.resolution];
    if (typeof outputUnitCost !== "number") {
      throw new Error(`Unsupported pricing combination: ${input.model}/${input.resolution}`);
    }

    if (input.model === "gemini-3-pro-image") {
      inputCostUsd = (inputTextTokens * 2) / 1_000_000 + inputImageCount * 0.00112;
    } else {
      const inputRate = input.model === "gemini-3.1-flash-lite-image" ? 0.25 : 0.5;
      // Gemini media-resolution guidance uses 560 tokens for a medium image.
      // Current image generation calls do not expose per-image token counts
      // before execution, so use 560/reference for the preflight quote.
      inputCostUsd = ((inputTextTokens + inputImageCount * 560) * inputRate) / 1_000_000;
    }
    outputCostUsd = outputUnitCost * outputCount;
  } else {
    const quality = input.quality ?? "medium";
    const outputUnitCost = OPENAI_GPT_IMAGE_2_OUTPUT_USD[quality]?.[input.resolution];
    if (typeof outputUnitCost !== "number") {
      throw new Error(`Unsupported pricing combination: ${input.model}/${quality}/${input.resolution}`);
    }
    // GPT Image 2 processes every reference at high fidelity. OpenAI does not
    // publish one fixed input cost because it depends on dimensions; 6,240
    // tokens/reference is the conservative non-square high-fidelity allowance
    // documented in the vision cost guide. Actual usage replaces this estimate.
    inputCostUsd = (inputTextTokens * 5 + inputImageCount * 6_240 * 8) / 1_000_000;
    outputCostUsd = outputUnitCost * outputCount;
  }

  const providerCostUsd = roundUsd(inputCostUsd + outputCostUsd);
  return {
    provider,
    model: input.model,
    resolution: input.resolution,
    quality: provider === "openai" ? input.quality ?? "medium" : undefined,
    inputImageCount,
    inputTextTokens,
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    providerCostUsd,
    ...customerQuote(providerCostUsd),
    markupMultiplier: AI_PRICE_MARKUP_MULTIPLIER,
    effectiveDate: AI_PRICING_EFFECTIVE_DATE,
    sourceUrl: AI_PRICING_SOURCES[provider],
  };
}

export function calculateGoogleImageActualCost(params: {
  model: Exclude<ImagePricingModel, "gpt-image-2">;
  usage?: GoogleImageUsage;
  fallback: ImagePriceEstimate;
}) {
  const usage = params.usage;
  if (!usage) return params.fallback.providerCostUsd;

  const promptTokens = usage.promptTokenCount ?? 0;
  const imageOutputTokens = usage.candidatesTokensDetails
    ?.filter((item) => item.modality === "IMAGE")
    .reduce((total, item) => total + (item.tokenCount ?? 0), 0) ?? 0;
  const textOutputTokens = usage.candidatesTokensDetails
    ?.filter((item) => item.modality !== "IMAGE")
    .reduce((total, item) => total + (item.tokenCount ?? 0), 0) ?? 0;

  if (promptTokens === 0 && imageOutputTokens === 0 && textOutputTokens === 0) {
    return params.fallback.providerCostUsd;
  }

  if (params.model === "gemini-3-pro-image") {
    return roundUsd(
      (promptTokens * 2 + imageOutputTokens * 120 + (textOutputTokens + (usage.thoughtsTokenCount ?? 0)) * 12) / 1_000_000
    );
  }

  const isLite = params.model === "gemini-3.1-flash-lite-image";
  const inputRate = isLite ? 0.25 : 0.5;
  const imageOutputRate = isLite ? 30 : 60;
  const textOutputRate = isLite ? 1.5 : 3;
  return roundUsd(
    (promptTokens * inputRate + imageOutputTokens * imageOutputRate + (textOutputTokens + (usage.thoughtsTokenCount ?? 0)) * textOutputRate) / 1_000_000
  );
}

export const AI_PRICING_CATALOG: ReadonlyArray<{
  label: string;
  model: ImagePricingModel;
  resolution: ImageResolution;
  quality?: ImageQuality;
}> = [
  { label: "Nano Banana 2 Lite · 1K", model: "gemini-3.1-flash-lite-image", resolution: "1K" },
  { label: "Nano Banana 2 · 1K", model: "gemini-3.1-flash-image", resolution: "1K" },
  { label: "Nano Banana 2 · 2K", model: "gemini-3.1-flash-image", resolution: "2K" },
  { label: "Nano Banana 2 · 4K", model: "gemini-3.1-flash-image", resolution: "4K" },
  { label: "Nano Banana Pro · 1K/2K", model: "gemini-3-pro-image", resolution: "2K" },
  { label: "Nano Banana Pro · 4K", model: "gemini-3-pro-image", resolution: "4K" },
  { label: "GPT Image 2 · Medium vuông", model: "gpt-image-2", resolution: "1024x1024", quality: "medium" },
  { label: "GPT Image 2 · High ngang/dọc", model: "gpt-image-2", resolution: "1536x1024", quality: "high" },
];
