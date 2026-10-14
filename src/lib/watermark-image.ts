import sharp from "sharp";

export const MAX_WATERMARK_BYTES = 3 * 1024 * 1024;
export const WATERMARK_FILE_TYPES = ["image/png", "image/webp"];

/** Decode the pixels: an alpha channel alone does not mean the background is transparent. */
export async function validateWatermarkImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_WATERMARK_BYTES)
    throw new Error("Logo tối đa 3 MB.");
  const image = sharp(bytes, { limitInputPixels: 16_777_216, failOn: "error" });
  const meta = await image.metadata();
  if (!["png", "webp"].includes(meta.format || "") || (meta.pages || 1) !== 1)
    throw new Error("Chọn ảnh PNG hoặc WebP tĩnh có nền trong suốt nhé.");
  if (!meta.hasAlpha)
    throw new Error("Ảnh vẫn còn nền. Xuất PNG hoặc WebP nền trong suốt rồi thêm lại nhé.");
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, visible = 0, clearEdge = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + info.channels - 1];
      if (alpha <= 8) {
        transparent++;
        if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) clearEdge++;
      }
      if (alpha >= 32) visible++;
    }
  }
  const pixels = info.width * info.height;
  if (visible < pixels * 0.001) throw new Error("Ảnh trống, không thấy logo nào. Chọn ảnh khác nhé.");
  if (transparent < pixels * 0.01 || clearEdge < (info.width + info.height) * 0.2)
    throw new Error("Logo cần có nền trong suốt quanh hình; ảnh nền trắng hoặc nền ô caro không dùng được.");
  // Re-encode to remove metadata and preserve real alpha; never overwrite an older asset.
  const encoded = await sharp(bytes).png().toBuffer();
  if (encoded.length > MAX_WATERMARK_BYTES)
    throw new Error("Ảnh lớn quá. Thu nhỏ logo rồi thêm lại nhé.");
  return { bytes: encoded, width: info.width, height: info.height };
}
