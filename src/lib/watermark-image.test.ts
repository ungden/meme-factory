import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MAX_WATERMARK_BYTES, validateWatermarkImage } from "./watermark-image";

async function fixture(format: "png" | "webp" | "jpeg", alpha: number, inset = false) {
  const pixels = Buffer.alloc(32 * 32 * 4, 255);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
    pixels[(y * 32 + x) * 4 + 3] = inset && x > 5 && x < 26 && y > 5 && y < 26 ? 255 : alpha;
  return sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } }).toFormat(format).toBuffer();
}
describe("watermark uploads", () => {
  it.each(["png", "webp"] as const)("accepts real transparent %s and preserves alpha", async (format) => {
    const result = await validateWatermarkImage(await fixture(format, 0, true));
    expect((await sharp(result.bytes).stats()).isOpaque).toBe(false);
    expect(result.width).toBe(32);
  });
  it("rejects opaque RGBA even with an alpha channel", async () => {
    await expect(validateWatermarkImage(await fixture("png", 255))).rejects.toThrow("nền trong suốt");
  });
  it("rejects an all-translucent rectangle", async () => {
    await expect(validateWatermarkImage(await fixture("png", 128))).rejects.toThrow("nền trong suốt");
  });
  it("rejects empty transparent images", async () => {
    await expect(validateWatermarkImage(await fixture("png", 0))).rejects.toThrow("Ảnh trống");
  });
  it("rejects JPEG, broken data and oversized input", async () => {
    await expect(validateWatermarkImage(await fixture("jpeg", 255))).rejects.toThrow("PNG");
    await expect(validateWatermarkImage(Buffer.from("invalid image"))).rejects.toThrow();
    await expect(validateWatermarkImage(Buffer.alloc(MAX_WATERMARK_BYTES + 1))).rejects.toThrow("3 MB");
  });
});
