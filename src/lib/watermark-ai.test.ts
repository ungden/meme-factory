import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { prepareWatermarkReference, watermarkPoints, watermarkUsageCost, watermarkProviderInput, WATERMARK_AI_MAX_POINTS } from "./watermark-ai";

describe("paid transparent watermark contract", () => {
  it("pins transparent PNG generation without project/video settings", () => {
    const settings = watermarkProviderInput("generate", "Bánh Bao Và Đậu Đỏ");
    expect(settings).toMatchObject({ model: "gpt-image-1.5", n: 1, size: "1536x1024", background: "transparent", output_format: "png", quality: "medium" });
    expect(settings.prompt).toContain("Bánh Bao Và Đậu Đỏ");
    expect(watermarkProviderInput("remove_background", "ignored").prompt).toContain("Preserve the original text exactly");
    expect(watermarkProviderInput("remove_background", "ignored").prompt).not.toContain("ignored");
  });
  it("calculates cost plus 30%, refunds reserve difference and caps the charge", () => {
    expect(WATERMARK_AI_MAX_POINTS).toBe(11);
    const cost = watermarkUsageCost({ output_tokens: 1563, input_tokens_details: { text_tokens: 200, image_tokens: 0 } });
    expect(cost).toBe(0.051016);
    expect(watermarkPoints(cost!, 11)).toBe(4);
    expect(watermarkPoints(1, 11)).toBe(11);
    expect(watermarkUsageCost()).toBeNull();
    expect(watermarkUsageCost({ output_tokens: -1 })).toBeNull();
  });
  it("accepts opaque JPEG as AI input while bounding resolution", async () => {
    const jpg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "white" } }).jpeg().toBuffer();
    const output = await prepareWatermarkReference(jpg);
    expect(await sharp(output).metadata()).toMatchObject({ format: "png", width: 1024, height: 768 });
    await expect(prepareWatermarkReference(Buffer.from('<svg></svg>'))).rejects.toThrow();
    await expect(prepareWatermarkReference(Buffer.alloc(3 * 1024 * 1024 + 1))).rejects.toThrow("3 MB");
  });
});
