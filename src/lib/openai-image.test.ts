import { describe, expect, it } from "vitest";
import { OPENAI_IMAGE_MODEL, calculateOpenAiActualCost, openAiSizeFor } from "./openai-image";
import { estimateImageGenerationPrice } from "./ai-pricing";
import { POINT_COSTS } from "./point-pricing";

describe("openAiSizeFor", () => {
  it("only ever asks for a size OpenAI publishes a price for", () => {
    // Quoting a size with no published price would make every cost estimate a guess.
    const priced = new Set(["1024x1024", "1024x1536", "1536x1024"]);
    for (const format of ["1:1", "4:5", "9:16", "16:9"]) {
      const mapped = openAiSizeFor(format);
      expect(priced.has(mapped.size)).toBe(true);
      expect(mapped.resolution).toBe(mapped.size);
    }
  });

  it("keeps orientation", () => {
    expect(openAiSizeFor("1:1").size).toBe("1024x1024");
    expect(openAiSizeFor("16:9").size).toBe("1536x1024");
    expect(openAiSizeFor("9:16").size).toBe("1024x1536");
  });

  it("falls back to square for an unknown format", () => {
    expect(openAiSizeFor("21:9").size).toBe("1024x1024");
  });
});

describe("cost of routing text memes to GPT Image 2", () => {
  it("is not more expensive than Gemini at medium quality", () => {
    // The whole reason text memes can move providers without repricing points.
    const openai = estimateImageGenerationPrice({
      model: "gpt-image-2",
      resolution: "1024x1024",
      quality: "medium",
      inputImageCount: 0,
      inputTextTokens: 2_500,
    });
    const gemini = estimateImageGenerationPrice({
      model: "gemini-3.1-flash-image",
      resolution: "1K",
      inputImageCount: 0,
      inputTextTokens: 2_500,
    });
    expect(openai.outputCostUsd).toBeLessThan(gemini.outputCostUsd);
    expect(openai.customerPoints).toBeLessThanOrEqual(POINT_COSTS.meme);
  });

  it("prices high quality well above the meme budget, so it stays opt-in", () => {
    const high = estimateImageGenerationPrice({
      model: "gpt-image-2",
      resolution: "1024x1024",
      quality: "high",
      inputImageCount: 0,
      inputTextTokens: 2_500,
    });
    expect(high.customerPoints).toBeGreaterThan(POINT_COSTS.meme * 2);
  });
});

describe("calculateOpenAiActualCost", () => {
  it("bills reported usage at the published per-token rates", () => {
    // text 5/1M, image input 8/1M, image output 30/1M — developers.openai.com pricing
    const usd = calculateOpenAiActualCost({
      usage: {
        input_tokens: 1_200,
        output_tokens: 1_000_000,
        input_tokens_details: { text_tokens: 1_000, image_tokens: 200 },
      },
      fallbackUsd: 99,
    });
    expect(usd).toBeCloseTo((1_000 * 5 + 200 * 8 + 1_000_000 * 30) / 1_000_000, 6);
  });

  it("falls back when the provider reports no usage", () => {
    expect(calculateOpenAiActualCost({ fallbackUsd: 0.053 })).toBe(0.053);
    expect(calculateOpenAiActualCost({ usage: {}, fallbackUsd: 0.053 })).toBe(0.053);
  });

  it("pins the model id the pricing table is keyed on", () => {
    expect(OPENAI_IMAGE_MODEL).toBe("gpt-image-2");
  });
});
