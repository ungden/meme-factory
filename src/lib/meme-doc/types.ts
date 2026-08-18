import type { MemeFormat, WatermarkPosition } from "@/types/database";

/**
 * Every geometric value in a MemeDoc is normalized to 0..1 of the canvas box.
 * That keeps a document valid at preview scale, at export scale, and after a
 * format switch — the renderer multiplies by FORMAT_DIMENSIONS at draw time.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneName = "top" | "center" | "bottom" | "side" | "free";

export interface SafeZoneMap {
  zones: Partial<Record<Exclude<ZoneName, "free">, Rect>>;
  /** Where the mascot lives. Auto-placement never puts text here. */
  avoid?: Rect[];
  watermark?: Rect;
}

export type FontId = "inter";

export interface TextStyle {
  fontFamily: FontId;
  fontWeight: number;
  /** Fraction of canvas height, so text scale survives an aspect-ratio change. */
  fontSize: number;
  autoFit: boolean;
  minFontSize: number;
  maxFontSize: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  color: string;
  strokeColor: string;
  /** Fraction of fontSize, matching the legacy `fontSize * 0.12` convention. */
  strokeWidth: number;
  uppercase: boolean;
  letterSpacing: number;
}

export interface TextLayer {
  id: string;
  type: "text";
  zone: ZoneName;
  text: string;
  box: Rect;
  style: TextStyle;
}

export type Layer = TextLayer;

export interface BaseRef {
  kind: "base_image" | "raw_image";
  baseImageId?: string;
  characterId?: string;
  imageUrl: string;
  fit: "cover" | "contain";
  offset: { x: number; y: number };
  scale: number;
}

export interface WatermarkLayer {
  enabled: boolean;
  source: "project" | "custom" | "text";
  imageUrl: string | null;
  text: string | null;
  position: WatermarkPosition;
  opacity: number;
  /** Fraction of canvas width. */
  scale: number;
}

export interface MemeDoc {
  schema: "aida.meme-doc";
  version: 1;
  canvas: {
    format: MemeFormat;
    background: string;
  };
  base: BaseRef | null;
  layers: Layer[];
  watermark: WatermarkLayer | null;
  meta: {
    createdWith: string;
    safeZonesSnapshot?: SafeZoneMap;
    recommendedChars?: number;
  };
}

export const MEME_DOC_SCHEMA = "aida.meme-doc" as const;
export const MEME_DOC_VERSION = 1 as const;
