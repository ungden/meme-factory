import type { MemeFormat } from "@/types/database";
import type { LayoutPresetId } from "@/types/database";
import type { Rect, SafeZoneMap, TextStyle } from "@/lib/meme-doc/types";

/**
 * Client-side fallback only. The authoritative safe zones live on
 * `mascot_base_images.safe_zones` (seeded from `layout_presets` per aspect ratio);
 * this is what renders when a row predates the seed or was written with `{}`.
 */
export const FALLBACK_SAFE_ZONES: Record<MemeFormat, SafeZoneMap> = {
  "1:1": {
    zones: {
      top: { x: 0.05, y: 0.05, w: 0.9, h: 0.24 },
      bottom: { x: 0.05, y: 0.79, w: 0.9, h: 0.16 },
    },
    avoid: [{ x: 0.14, y: 0.31, w: 0.72, h: 0.46 }],
    watermark: { x: 0.7, y: 0.9, w: 0.27, h: 0.07 },
  },
  "4:5": {
    zones: {
      top: { x: 0.05, y: 0.05, w: 0.9, h: 0.22 },
      bottom: { x: 0.05, y: 0.8, w: 0.9, h: 0.15 },
    },
    avoid: [{ x: 0.14, y: 0.29, w: 0.72, h: 0.49 }],
    watermark: { x: 0.7, y: 0.91, w: 0.27, h: 0.06 },
  },
  "9:16": {
    zones: {
      top: { x: 0.05, y: 0.07, w: 0.9, h: 0.19 },
      bottom: { x: 0.05, y: 0.8, w: 0.9, h: 0.14 },
    },
    avoid: [{ x: 0.1, y: 0.28, w: 0.8, h: 0.5 }],
    watermark: { x: 0.7, y: 0.93, w: 0.27, h: 0.05 },
  },
  "16:9": {
    zones: {
      top: { x: 0.05, y: 0.06, w: 0.9, h: 0.22 },
      bottom: { x: 0.05, y: 0.74, w: 0.9, h: 0.2 },
    },
    avoid: [{ x: 0.3, y: 0.3, w: 0.4, h: 0.42 }],
    watermark: { x: 0.76, y: 0.87, w: 0.21, h: 0.09 },
  },
};

export const LAYOUT_PRESET_LABELS: Record<LayoutPresetId, string> = {
  tight_closeup: "Cận mặt",
  medium_portrait: "Trung cảnh",
  offset_composition: "Lệch một bên",
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "inter",
  fontWeight: 800,
  fontSize: 0.085,
  autoFit: true,
  minFontSize: 0.028,
  maxFontSize: 0.12,
  lineHeight: 1.25,
  align: "center",
  verticalAlign: "middle",
  color: "#FFFFFF",
  strokeColor: "#000000",
  strokeWidth: 0.12,
  uppercase: true,
  letterSpacing: 0,
};

function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((key) => typeof rect[key] === "number");
}

/** Reads a persisted `safe_zones` jsonb blob, falling back to the format default. */
export function parseSafeZones(raw: unknown, format: MemeFormat): SafeZoneMap {
  const fallback = FALLBACK_SAFE_ZONES[format];
  if (!raw || typeof raw !== "object") return fallback;

  const source = raw as Record<string, unknown>;
  const zonesRaw = (source.zones ?? {}) as Record<string, unknown>;
  const zones: SafeZoneMap["zones"] = {};
  for (const name of ["top", "center", "bottom", "side"] as const) {
    if (isRect(zonesRaw[name])) zones[name] = zonesRaw[name] as Rect;
  }
  if (Object.keys(zones).length === 0) return fallback;

  return {
    zones,
    avoid: Array.isArray(source.avoid) ? source.avoid.filter(isRect) : fallback.avoid,
    watermark: isRect(source.watermark) ? source.watermark : fallback.watermark,
  };
}

export function parseTextStyle(raw: unknown): TextStyle {
  if (!raw || typeof raw !== "object") return DEFAULT_TEXT_STYLE;
  const source = raw as Record<string, unknown>;
  const merged: TextStyle = { ...DEFAULT_TEXT_STYLE };

  for (const key of ["fontWeight", "fontSize", "lineHeight", "strokeWidth", "letterSpacing", "minFontSize", "maxFontSize"] as const) {
    if (typeof source[key] === "number") merged[key] = source[key] as number;
  }
  for (const key of ["color", "strokeColor"] as const) {
    if (typeof source[key] === "string") merged[key] = source[key] as string;
  }
  if (source.align === "left" || source.align === "center" || source.align === "right") {
    merged.align = source.align;
  }
  if (source.verticalAlign === "top" || source.verticalAlign === "middle" || source.verticalAlign === "bottom") {
    merged.verticalAlign = source.verticalAlign;
  }
  if (typeof source.uppercase === "boolean") merged.uppercase = source.uppercase;
  if (typeof source.autoFit === "boolean") merged.autoFit = source.autoFit;

  return merged;
}
