import { describe, expect, it } from "vitest";
import { DIACRITIC_HEADROOM_EM, layoutText, lineOrigins, toPixelBox, wrapText } from "./layout";
import type { Measure } from "./layout";
import { fitTextToBox } from "./autofit";
import { DEFAULT_TEXT_STYLE } from "@/lib/meme-layout-presets";

/** Deterministic stand-in for canvas metrics: every glyph is 0.5em wide. */
const measure: Measure = (text, fontSizePx) => Array.from(text).length * fontSizePx * 0.5;

const box = { x: 0, y: 0, w: 400, h: 200 };

describe("wrapText", () => {
  it("wraps on spaces", () => {
    // measure() gives every glyph 0.5em, so 100px fits exactly 10 characters at 20px.
    expect(wrapText("mot hai ba bon nam sau", 100, 20, measure)).toEqual([
      "mot hai ba",
      "bon nam",
      "sau",
    ]);
  });

  it("keeps explicit line breaks", () => {
    expect(wrapText("dong mot\ndong hai", 1000, 20, measure)).toEqual(["dong mot", "dong hai"]);
  });

  it("hard-breaks a token wider than the box instead of overflowing", () => {
    const lines = wrapText("https://mot-duong-dan-rat-dai-khong-co-dau-cach", 100, 20, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line, 20)).toBeLessThanOrEqual(100);
    }
    expect(lines.join("")).toBe("https://mot-duong-dan-rat-dai-khong-co-dau-cach");
  });

  it("does not loop forever on a degenerate box", () => {
    expect(wrapText("abc", 0, 20, measure)).toEqual(["abc"]);
    expect(wrapText("abc", 100, 0, measure)).toEqual(["abc"]);
  });

  it("handles Vietnamese diacritics as ordinary characters", () => {
    expect(wrapText("Đổi brief hả em", 100, 20, measure)).toEqual(["Đổi brief", "hả em"]);
  });
});

describe("layoutText", () => {
  it("reserves headroom for stacked tone marks", () => {
    const layout = layoutText({
      text: "Ế",
      box,
      style: { lineHeight: 1.25, uppercase: false },
      fontSizePx: 40,
      measure,
    });
    expect(layout.blockHeight).toBeCloseTo(40 * 1.25 + 40 * DIACRITIC_HEADROOM_EM);
  });

  it("uppercases with Vietnamese casing rules when asked", () => {
    const layout = layoutText({
      text: "đổi brief",
      box,
      style: { lineHeight: 1.25, uppercase: true },
      fontSizePx: 20,
      measure,
    });
    expect(layout.lines[0].text).toBe("ĐỔI BRIEF");
  });

  it("flags overflow when the block is taller than the box", () => {
    const layout = layoutText({
      text: "mot hai ba bon nam sau bay tam chin muoi",
      box: { x: 0, y: 0, w: 100, h: 40 },
      style: { lineHeight: 1.25, uppercase: false },
      fontSizePx: 30,
      measure,
    });
    expect(layout.overflows).toBe(true);
  });
});

describe("lineOrigins", () => {
  it("anchors x by alignment", () => {
    const layout = layoutText({
      text: "abc",
      box,
      style: { lineHeight: 1.25, uppercase: false },
      fontSizePx: 20,
      measure,
    });
    expect(lineOrigins(layout, box, { align: "left", verticalAlign: "middle" })[0].x).toBe(0);
    expect(lineOrigins(layout, box, { align: "center", verticalAlign: "middle" })[0].x).toBe(200);
    expect(lineOrigins(layout, box, { align: "right", verticalAlign: "middle" })[0].x).toBe(400);
  });

  it("keeps every line inside the box vertically", () => {
    const layout = layoutText({
      text: "mot hai ba bon",
      box,
      style: { lineHeight: 1.25, uppercase: false },
      fontSizePx: 20,
      measure,
    });
    for (const origin of lineOrigins(layout, box, { align: "center", verticalAlign: "middle" })) {
      expect(origin.y).toBeGreaterThanOrEqual(box.y);
      expect(origin.y).toBeLessThanOrEqual(box.y + box.h);
    }
  });
});

describe("toPixelBox", () => {
  it("scales normalized rects to canvas pixels", () => {
    expect(toPixelBox({ x: 0.05, y: 0.5, w: 0.9, h: 0.2 }, 1080, 1350)).toEqual({
      x: 54,
      y: 675,
      w: 972,
      h: 270,
    });
  });
});

describe("fitTextToBox", () => {
  const style = { ...DEFAULT_TEXT_STYLE, uppercase: false };

  const longLine = "Khach noi sua nhe thoi nhung sua het tu mau den bo cuc va them gap ngay mai";

  it("shrinks until the block fits the box", () => {
    const layout = fitTextToBox({
      text: longLine,
      box: { x: 0, y: 0, w: 400, h: 300 },
      style,
      canvasHeight: 1080,
      measure,
    });
    expect(layout.blockHeight).toBeLessThanOrEqual(300);
    expect(layout.overflows).toBe(false);
  });

  it("stops at the minimum size and reports overflow rather than truncating", () => {
    const layout = fitTextToBox({
      text: longLine,
      box: { x: 0, y: 0, w: 400, h: 120 },
      style,
      canvasHeight: 1080,
      measure,
    });
    // User text is never cut; the editor surfaces `overflows` instead.
    expect(layout.fontSizePx).toBeCloseTo(style.minFontSize * 1080, 5);
    expect(layout.overflows).toBe(true);
    expect(layout.lines.map((line) => line.text).join(" ")).toBe(longLine);
  });

  it("shrinks monotonically: longer text never gets a bigger font", () => {
    const shortText = fitTextToBox({ text: "Đổi brief?", box, style, canvasHeight: 1080, measure });
    const longText = fitTextToBox({
      text: "Đổi brief? Sửa nhẹ thôi mà sao lại thành làm lại toàn bộ dự án vậy em",
      box,
      style,
      canvasHeight: 1080,
      measure,
    });
    expect(longText.fontSizePx).toBeLessThanOrEqual(shortText.fontSizePx);
  });

  it("stops at the minimum font size rather than looping", () => {
    const layout = fitTextToBox({
      text: "x".repeat(4000),
      box: { x: 0, y: 0, w: 50, h: 30 },
      style,
      canvasHeight: 1080,
      measure,
    });
    expect(layout.fontSizePx).toBeGreaterThanOrEqual(style.minFontSize * 1080 - 0.001);
  });
});
