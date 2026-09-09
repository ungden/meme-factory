import { describe, expect, it } from "vitest";
import {
  AI_PRICE_MARKUP_MULTIPLIER,
  BILLING_POINT_FLOOR_VND,
  calculateGoogleImageActualCost,
  estimateGeminiTtsPrice,
  estimateImageGenerationPrice,
} from "./ai-pricing";
import { POINT_COSTS, POINT_PACKAGES } from "./point-pricing";

describe("AI image pricing", () => {
  it("prices Gemini TTS by text and reserved audio duration", () => {
    const latest = estimateGeminiTtsPrice({
      model: "gemini-3.1-flash-tts-preview",
      text: "Xin chào, mình là Bánh Bao.",
      requestedSeconds: 6,
    });
    const fast = estimateGeminiTtsPrice({
      model: "gemini-2.5-flash-preview-tts",
      text: "Xin chào, mình là Bánh Bao.",
      requestedSeconds: 6,
    });
    expect(latest.provider).toBe("google");
    expect(latest.audioTokens).toBe(150);
    expect(latest.customerPoints).toBeGreaterThanOrEqual(1);
    expect(fast.providerCostUsd).toBeLessThan(latest.providerCostUsd);
  });

  it("uses the current official Standard output prices", () => {
    expect(estimateImageGenerationPrice({
      model: "gemini-3.1-flash-image",
      resolution: "1K",
    }).outputCostUsd).toBe(0.067);
    expect(estimateImageGenerationPrice({
      model: "gemini-3-pro-image",
      resolution: "4K",
    }).outputCostUsd).toBe(0.24);
    expect(estimateImageGenerationPrice({
      model: "gpt-image-2",
      resolution: "1536x1024",
      quality: "high",
    }).outputCostUsd).toBe(0.165);
  });

  it("applies the agreed 30% markup before converting to whole points", () => {
    expect(AI_PRICE_MARKUP_MULTIPLIER).toBe(1.3);
    const quote = estimateImageGenerationPrice({
      model: "gemini-3.1-flash-image",
      resolution: "1K",
      inputImageCount: 4,
      inputTextTokens: 2_000,
    });
    expect(quote.customerPriceUsd).toBeCloseTo(quote.providerCostUsd * AI_PRICE_MARKUP_MULTIPLIER, 6);
    expect(quote.customerPoints * BILLING_POINT_FLOOR_VND).toBeGreaterThanOrEqual(quote.customerPriceVnd);
  });

  it("prices current actions against the cheapest paid point package", () => {
    expect(Math.min(...POINT_PACKAGES.map((item) => item.pricePerPoint))).toBe(BILLING_POINT_FLOOR_VND);
    for (const pkg of POINT_PACKAGES) {
      expect(pkg.price / pkg.points).toBe(BILLING_POINT_FLOOR_VND);
      expect(pkg.pricePerPoint).toBe(BILLING_POINT_FLOOR_VND);
      expect(pkg.bonus).toBe("");
    }
    expect(POINT_COSTS).toMatchObject({ character: 5, meme: 6, background: 8, content: 0 });
  });

  it("reconciles Gemini usage metadata when modality counts are available", () => {
    const fallback = estimateImageGenerationPrice({
      model: "gemini-3.1-flash-image",
      resolution: "1K",
    });
    const actual = calculateGoogleImageActualCost({
      model: "gemini-3.1-flash-image",
      fallback,
      usage: {
        promptTokenCount: 1_000,
        candidatesTokensDetails: [
          { modality: "IMAGE", tokenCount: 1_120 },
          { modality: "TEXT", tokenCount: 100 },
        ],
        thoughtsTokenCount: 50,
      },
    });
    expect(actual).toBe(0.06815);
  });

  it("rejects undocumented model and resolution combinations", () => {
    expect(() => estimateImageGenerationPrice({
      model: "gemini-3.1-flash-lite-image",
      resolution: "4K",
    })).toThrow("Unsupported pricing combination");
  });
});
