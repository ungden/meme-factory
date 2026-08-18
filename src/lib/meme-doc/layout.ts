import type { Rect, TextStyle } from "./types";

/** Measures a string at a given pixel font size. Injected so this module never needs a canvas. */
export type Measure = (text: string, fontSizePx: number) => number;

/**
 * Vietnamese stacks tone marks above the cap height (ế, ợ, ỷ), so a line box sized
 * purely on the nominal font size clips them. Reserve a little headroom.
 */
export const DIACRITIC_HEADROOM_EM = 0.18;

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidOutLine {
  text: string;
  width: number;
}

export interface TextLayout {
  lines: LaidOutLine[];
  fontSizePx: number;
  lineHeightPx: number;
  blockHeight: number;
  overflows: boolean;
}

export function toPixelBox(box: Rect, canvasWidth: number, canvasHeight: number): PixelBox {
  return {
    x: box.x * canvasWidth,
    y: box.y * canvasHeight,
    w: box.w * canvasWidth,
    h: box.h * canvasHeight,
  };
}

/**
 * Breaks a single token that is wider than the line box. The legacy wrapText split
 * on spaces only, so one long word (a URL, a hashtag, a run of caps) silently
 * overflowed the canvas.
 */
function hardBreak(word: string, maxWidth: number, fontSizePx: number, measure: Measure): string[] {
  const pieces: string[] = [];
  let current = "";

  for (const char of Array.from(word)) {
    const candidate = current + char;
    if (current && measure(candidate, fontSizePx) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) pieces.push(current);
  return pieces.length > 0 ? pieces : [word];
}

export function wrapText(
  text: string,
  maxWidth: number,
  fontSizePx: number,
  measure: Measure
): string[] {
  if (!text) return [];
  // A degenerate box would otherwise loop forever in hardBreak.
  if (!(maxWidth > 0) || !(fontSizePx > 0)) return text.split("\n");

  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;

      if (measure(candidate, fontSizePx) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
      }

      if (measure(word, fontSizePx) <= maxWidth) {
        current = word;
        continue;
      }

      const pieces = hardBreak(word, maxWidth, fontSizePx, measure);
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] ?? "";
    }

    lines.push(current);
  }

  return lines;
}

export function layoutText(params: {
  text: string;
  box: PixelBox;
  style: Pick<TextStyle, "lineHeight" | "uppercase">;
  fontSizePx: number;
  measure: Measure;
}): TextLayout {
  const { box, style, fontSizePx, measure } = params;
  const text = style.uppercase ? params.text.toLocaleUpperCase("vi-VN") : params.text;
  const wrapped = wrapText(text, box.w, fontSizePx, measure);
  const lineHeightPx = fontSizePx * style.lineHeight;
  const blockHeight = wrapped.length * lineHeightPx + fontSizePx * DIACRITIC_HEADROOM_EM;
  const lines = wrapped.map((line) => ({ text: line, width: measure(line, fontSizePx) }));

  return {
    lines,
    fontSizePx,
    lineHeightPx,
    blockHeight,
    overflows:
      blockHeight > box.h || lines.some((line) => line.width > box.w + 0.5),
  };
}

/** Baseline-independent line origins: y is the vertical centre of each line. */
export function lineOrigins(layout: TextLayout, box: PixelBox, style: Pick<TextStyle, "align" | "verticalAlign">) {
  const headroom = layout.fontSizePx * DIACRITIC_HEADROOM_EM;
  const contentHeight = layout.lines.length * layout.lineHeightPx;

  let top: number;
  if (style.verticalAlign === "top") top = box.y + headroom;
  else if (style.verticalAlign === "bottom") top = box.y + box.h - contentHeight;
  else top = box.y + (box.h - contentHeight) / 2 + headroom / 2;

  return layout.lines.map((line, index) => {
    let x: number;
    if (style.align === "left") x = box.x;
    else if (style.align === "right") x = box.x + box.w;
    else x = box.x + box.w / 2;

    return {
      text: line.text,
      x,
      y: top + index * layout.lineHeightPx + layout.lineHeightPx / 2,
    };
  });
}
