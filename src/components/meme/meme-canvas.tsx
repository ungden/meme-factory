"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ensureFontsLoaded } from "@/lib/meme-doc/fonts";
import { canvasSize, loadImage, renderMemeDoc, renderSafeZoneOverlay, type RenderAssets } from "@/lib/meme-doc/render";
import type { MemeDoc } from "@/lib/meme-doc/types";

export interface MemeCanvasHandle {
  /** Full-resolution PNG data URL, exactly FORMAT_DIMENSIONS for the doc format. */
  exportImage: () => string | null;
  getCanvas: () => HTMLCanvasElement | null;
}

interface MemeCanvasProps {
  doc: MemeDoc;
  showSafeZones?: boolean;
  className?: string;
  onImageError?: (message: string) => void;
}

/**
 * Draws a MemeDoc at full export resolution and lets CSS scale the element down,
 * so the preview and the exported PNG are the same pixels.
 */
const MemeCanvas = forwardRef<MemeCanvasHandle, MemeCanvasProps>(function MemeCanvas(
  { doc, showSafeZones = false, className, onImageError },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [assets, setAssets] = useState<RenderAssets>({});
  const [fontsReady, setFontsReady] = useState(false);

  const baseUrl = doc.base?.imageUrl ?? null;
  const watermarkUrl = doc.watermark?.enabled ? doc.watermark.imageUrl : null;

  useEffect(() => {
    let cancelled = false;
    ensureFontsLoaded().then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [base, watermark] = await Promise.all([
        baseUrl ? loadImage(baseUrl).catch((error: Error) => {
          onImageError?.(error.message);
          return null;
        }) : Promise.resolve(null),
        watermarkUrl ? loadImage(watermarkUrl).catch(() => null) : Promise.resolve(null),
      ]);
      if (!cancelled) setAssets({ base, watermark });
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, watermarkUrl, onImageError]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvasSize(doc);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    renderMemeDoc(ctx, doc, assets);
    if (showSafeZones) renderSafeZoneOverlay(ctx, doc);
  }, [doc, assets, showSafeZones]);

  useEffect(() => {
    // Waiting on fonts matters: measureText against a fallback font would size the
    // auto-fit differently from the final export.
    if (fontsReady) draw();
  }, [draw, fontsReady]);

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      // Safe zones are an editing aid and must never reach the exported file.
      if (showSafeZones) {
        const ctx = canvas.getContext("2d");
        if (ctx) renderMemeDoc(ctx, doc, assets);
      }
      const dataUrl = canvas.toDataURL("image/png");
      if (showSafeZones) draw();
      return dataUrl;
    },
    getCanvas: () => canvasRef.current,
  }), [doc, assets, showSafeZones, draw]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "auto", display: "block" }} />;
});

export default MemeCanvas;
