import { FORMAT_DIMENSIONS } from "@/types/database";
import { cssFont } from "./fonts";
import { lineOrigins, toPixelBox, type Measure } from "./layout";
import { resolveTextLayout } from "./autofit";
import type { MemeDoc, TextLayer, WatermarkLayer } from "./types";

export interface RenderAssets {
  base?: HTMLImageElement | null;
  watermark?: HTMLImageElement | null;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Supabase storage answers with access-control-allow-origin: *, so the canvas
    // stays untainted and toDataURL() keeps working.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Không tải được ảnh: ${url}`));
    img.src = url;
  });
}

export function canvasSize(doc: MemeDoc) {
  return FORMAT_DIMENSIONS[doc.canvas.format];
}

function drawBase(ctx: CanvasRenderingContext2D, doc: MemeDoc, image: HTMLImageElement, width: number, height: number) {
  const base = doc.base;
  if (!base) return;

  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  const useWidth = base.fit === "cover" ? imageRatio < canvasRatio : imageRatio > canvasRatio;

  let drawWidth = useWidth ? width : height * imageRatio;
  let drawHeight = useWidth ? width / imageRatio : height;
  drawWidth *= base.scale;
  drawHeight *= base.scale;

  const x = (width - drawWidth) / 2 + base.offset.x * width;
  const y = (height - drawHeight) / 2 + base.offset.y * height;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, width: number, height: number) {
  if (!layer.text.trim()) return;

  const box = toPixelBox(layer.box, width, height);
  const measure: Measure = (text, fontSizePx) => {
    ctx.font = cssFont(layer.style, fontSizePx);
    return ctx.measureText(text).width;
  };

  const layout = resolveTextLayout({
    text: layer.text,
    box,
    style: layer.style,
    canvasHeight: height,
    measure,
  });

  ctx.save();
  ctx.font = cssFont(layer.style, layout.fontSizePx);
  ctx.textAlign = layer.style.align === "left" ? "left" : layer.style.align === "right" ? "right" : "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if ("letterSpacing" in ctx && layer.style.letterSpacing) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${layer.style.letterSpacing * layout.fontSizePx}px`;
  }

  const strokePx = layout.fontSizePx * layer.style.strokeWidth;
  for (const line of lineOrigins(layout, box, layer.style)) {
    if (strokePx > 0) {
      ctx.strokeStyle = layer.style.strokeColor;
      ctx.lineWidth = strokePx;
      ctx.strokeText(line.text, line.x, line.y);
    }
    ctx.fillStyle = layer.style.color;
    ctx.fillText(line.text, line.x, line.y);
  }
  ctx.restore();
}

function watermarkAnchor(position: WatermarkLayer["position"], width: number, height: number, boxWidth: number, boxHeight: number) {
  const padX = width * 0.03;
  const padY = height * 0.03;

  const left = padX;
  const centerX = (width - boxWidth) / 2;
  const right = width - boxWidth - padX;
  const top = padY;
  const middleY = (height - boxHeight) / 2;
  const bottom = height - boxHeight - padY;

  switch (position) {
    case "top-left":
      return { x: left, y: top };
    case "top-center":
      return { x: centerX, y: top };
    case "top-right":
      return { x: right, y: top };
    case "center-left":
      return { x: left, y: middleY };
    case "center":
      return { x: centerX, y: middleY };
    case "center-right":
      return { x: right, y: middleY };
    case "bottom-left":
      return { x: left, y: bottom };
    case "bottom-center":
      return { x: centerX, y: bottom };
    case "bottom-right":
    default:
      return { x: right, y: bottom };
  }
}

/** Exported for tests: the grid must never place a watermark outside the canvas. */
export const __watermarkAnchor = watermarkAnchor;

function drawWatermark(ctx: CanvasRenderingContext2D, doc: MemeDoc, assets: RenderAssets, width: number, height: number) {
  const watermark = doc.watermark;
  if (!watermark?.enabled) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, watermark.opacity));

  if (assets.watermark) {
    const maxSize = width * watermark.scale;
    const ratio = assets.watermark.naturalWidth / assets.watermark.naturalHeight || 1;
    const boxWidth = ratio >= 1 ? maxSize : maxSize * ratio;
    const boxHeight = ratio >= 1 ? maxSize / ratio : maxSize;
    const { x, y } = watermarkAnchor(watermark.position, width, height, boxWidth, boxHeight);
    ctx.drawImage(assets.watermark, x, y, boxWidth, boxHeight);
  } else if (watermark.text) {
    const fontSizePx = height * 0.028;
    ctx.font = cssFont({ fontWeight: 600, fontFamily: "inter" }, fontSizePx);
    ctx.textBaseline = "top";
    const textWidth = ctx.measureText(watermark.text).width;
    const { x, y } = watermarkAnchor(watermark.position, width, height, textWidth, fontSizePx * 1.4);
    ctx.textAlign = "left";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = fontSizePx * 0.16;
    ctx.strokeText(watermark.text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(watermark.text, x, y);
  }

  ctx.restore();
}

/** Draws the whole document. The only module in meme-doc that touches a canvas. */
export function renderMemeDoc(ctx: CanvasRenderingContext2D, doc: MemeDoc, assets: RenderAssets) {
  const { width, height } = canvasSize(doc);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = doc.canvas.background;
  ctx.fillRect(0, 0, width, height);

  if (assets.base) drawBase(ctx, doc, assets.base, width, height);
  for (const layer of doc.layers) drawTextLayer(ctx, layer, width, height);
  drawWatermark(ctx, doc, assets, width, height);
}

/** Debug overlay: shows where text is allowed to go. Never part of the export. */
export function renderSafeZoneOverlay(ctx: CanvasRenderingContext2D, doc: MemeDoc) {
  const { width, height } = canvasSize(doc);
  const zones = doc.meta.safeZonesSnapshot;
  if (!zones) return;

  ctx.save();
  ctx.setLineDash([width * 0.012, width * 0.012]);
  ctx.lineWidth = Math.max(2, width * 0.003);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
  for (const rect of Object.values(zones.zones)) {
    if (!rect) continue;
    ctx.strokeRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height);
  }

  ctx.strokeStyle = "rgba(244, 114, 182, 0.75)";
  for (const rect of zones.avoid ?? []) {
    ctx.strokeRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height);
  }
  ctx.restore();
}
