import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_STYLE, FALLBACK_SAFE_ZONES, parseSafeZones, parseTextStyle } from "./meme-layout-presets";
import type { MemeFormat } from "@/types/database";

const FORMATS: MemeFormat[] = ["1:1", "9:16", "16:9", "4:5"];

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("fallback safe zones", () => {
  it.each(FORMATS)("stays inside the 0..1 canvas for %s", (format) => {
    const map = FALLBACK_SAFE_ZONES[format];
    for (const rect of Object.values(map.zones)) {
      expect(rect).toBeDefined();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.w).toBeGreaterThan(0);
      expect(rect!.h).toBeGreaterThan(0);
      expect(rect!.x + rect!.w).toBeLessThanOrEqual(1);
      expect(rect!.y + rect!.h).toBeLessThanOrEqual(1);
    }
  });

  it.each(FORMATS)("never places text over the mascot for %s", (format) => {
    const map = FALLBACK_SAFE_ZONES[format];
    for (const zone of Object.values(map.zones)) {
      for (const avoid of map.avoid ?? []) {
        expect(overlaps(zone!, avoid)).toBe(false);
      }
    }
  });
});

describe("parseSafeZones", () => {
  it("falls back when the row has no zones", () => {
    expect(parseSafeZones({}, "1:1")).toEqual(FALLBACK_SAFE_ZONES["1:1"]);
    expect(parseSafeZones(null, "9:16")).toEqual(FALLBACK_SAFE_ZONES["9:16"]);
  });

  it("keeps authored zones from the database", () => {
    const authored = { zones: { bottom: { x: 0.1, y: 0.6, w: 0.8, h: 0.3 } } };
    expect(parseSafeZones(authored, "1:1").zones.bottom).toEqual({ x: 0.1, y: 0.6, w: 0.8, h: 0.3 });
  });

  it("drops malformed rects instead of rendering NaN geometry", () => {
    const broken = { zones: { top: { x: "a", y: 0, w: 1, h: 1 }, bottom: { x: 0.1, y: 0.7, w: 0.8, h: 0.2 } } };
    const parsed = parseSafeZones(broken, "1:1");
    expect(parsed.zones.top).toBeUndefined();
    expect(parsed.zones.bottom).toBeDefined();
  });
});

describe("parseTextStyle", () => {
  it("returns the default style for junk input", () => {
    expect(parseTextStyle(undefined)).toEqual(DEFAULT_TEXT_STYLE);
    expect(parseTextStyle("nope")).toEqual(DEFAULT_TEXT_STYLE);
  });

  it("merges only recognised fields", () => {
    const style = parseTextStyle({ fontSize: 0.2, align: "left", uppercase: false, bogus: "x" });
    expect(style.fontSize).toBe(0.2);
    expect(style.align).toBe("left");
    expect(style.uppercase).toBe(false);
    expect(style.color).toBe(DEFAULT_TEXT_STYLE.color);
  });
});
