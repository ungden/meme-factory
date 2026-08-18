import { layoutText, type Measure, type PixelBox, type TextLayout } from "./layout";
import type { TextStyle } from "./types";

const SHRINK_STEP = 0.94;
const MAX_ITERATIONS = 60;

/**
 * Picks the largest font size at which the wrapped text still fits the box.
 * Shrinking (rather than binary search) keeps the result stable as the user types:
 * one more character never jumps the size by more than one step.
 */
export function fitTextToBox(params: {
  text: string;
  box: PixelBox;
  style: TextStyle;
  canvasHeight: number;
  measure: Measure;
}): TextLayout {
  const { text, box, style, canvasHeight, measure } = params;
  const maxFontPx = Math.max(1, style.maxFontSize * canvasHeight);
  const minFontPx = Math.max(1, style.minFontSize * canvasHeight);

  let fontSizePx = maxFontPx;
  let layout = layoutText({ text, box, style, fontSizePx, measure });

  for (let i = 0; i < MAX_ITERATIONS && layout.overflows && fontSizePx > minFontPx; i += 1) {
    fontSizePx = Math.max(minFontPx, fontSizePx * SHRINK_STEP);
    layout = layoutText({ text, box, style, fontSizePx, measure });
  }

  return layout;
}

export function resolveTextLayout(params: {
  text: string;
  box: PixelBox;
  style: TextStyle;
  canvasHeight: number;
  measure: Measure;
}): TextLayout {
  if (params.style.autoFit) return fitTextToBox(params);

  return layoutText({
    text: params.text,
    box: params.box,
    style: params.style,
    fontSizePx: Math.max(1, params.style.fontSize * params.canvasHeight),
    measure: params.measure,
  });
}
