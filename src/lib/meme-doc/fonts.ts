import type { FontId, TextStyle } from "./types";

const FALLBACK_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * next/font hashes the real family name, so read it from the CSS variable the root
 * layout sets (`--font-inter`, subsets latin + vietnamese) instead of hardcoding it.
 */
export function resolveFontFamily(fontId: FontId = "inter"): string {
  if (typeof window === "undefined") return FALLBACK_STACK;
  const variable = fontId === "inter" ? "--font-inter" : "--font-inter";
  const fromBody = getComputedStyle(document.body).getPropertyValue(variable).trim();
  const fromRoot = fromBody || getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return fromRoot ? `${fromRoot}, ${FALLBACK_STACK}` : FALLBACK_STACK;
}

export function cssFont(style: Pick<TextStyle, "fontWeight" | "fontFamily">, fontSizePx: number): string {
  return `${style.fontWeight} ${fontSizePx}px ${resolveFontFamily(style.fontFamily)}`;
}

/**
 * measureText against an unloaded font silently falls back to a different metric,
 * which makes auto-fit wrong and the export disagree with the preview. Always await
 * this before the first draw.
 */
export async function ensureFontsLoaded(weights: number[] = [400, 700, 800]): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const family = resolveFontFamily("inter");
  try {
    await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 64px ${family}`)));
    await document.fonts.ready;
  } catch {
    // A font failure must not block rendering; the fallback stack still draws.
  }
}
