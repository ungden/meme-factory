import path from "node:path";
import { download, ffmpeg, probe } from "./media.mjs";

export function watermarkFilters(brand, width, height) {
  const pos = brand.watermark_position || "bottom-right";
  const x = pos.includes("left") ? "24" : pos.includes("right") ? "W-w-24" : "(W-w)/2";
  const y = pos.includes("top") ? "24" : pos.includes("bottom") ? "H-h-24" : "(H-h)/2";
  const opacity = Math.max(0.05, Math.min(1, Number(brand.watermark_opacity ?? 0.8)));
  return [
    `[1:v]scale=${Math.round(width * 0.24)}:${Math.round(height * 0.16)}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacity}[wm]`,
    `[0:v][wm]overlay=${x}:${y}[branded]`,
  ];
}

/** Local overlay only. The frozen job brand is used; no provider calls or project re-reads. */
export async function applyVideoWatermark(source, brand, dir) {
  if (!brand?.watermark_url) return source;
  const logo = path.join(dir, "watermark.png"), output = path.join(dir, "branded.mp4");
  await download(brand.watermark_url, logo, 10 * 1024 * 1024);
  const before = await probe(source);
  await ffmpeg([
    "-i", source, "-i", logo,
    "-filter_complex", watermarkFilters(brand, before.width, before.height).join(";"),
    "-map", "[branded]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18",
    "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output,
  ]);
  const after = await probe(output);
  if (after.width !== before.width || after.height !== before.height ||
      after.audio !== before.audio || Math.abs(after.duration - before.duration) > 0.1)
    throw new Error("WATERMARK_OUTPUT_INVALID");
  return output;
}
