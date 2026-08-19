import { describe, expect, it } from "vitest";
import { __watermarkAnchor as watermarkAnchor } from "./render";
import type { WatermarkPosition } from "@/types/database";

const GRID: WatermarkPosition[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

const W = 1080;
const H = 1350;
const BOX_W = 160;
const BOX_H = 60;

describe("watermark placement grid", () => {
  it.each(GRID)("keeps %s fully inside the canvas", (position) => {
    const { x, y } = watermarkAnchor(position, W, H, BOX_W, BOX_H);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + BOX_W).toBeLessThanOrEqual(W);
    expect(y + BOX_H).toBeLessThanOrEqual(H);
  });

  it("orders the columns left, centre, right", () => {
    const left = watermarkAnchor("top-left", W, H, BOX_W, BOX_H).x;
    const centre = watermarkAnchor("top-center", W, H, BOX_W, BOX_H).x;
    const right = watermarkAnchor("top-right", W, H, BOX_W, BOX_H).x;
    expect(left).toBeLessThan(centre);
    expect(centre).toBeLessThan(right);
  });

  it("orders the rows top, middle, bottom", () => {
    const top = watermarkAnchor("top-left", W, H, BOX_W, BOX_H).y;
    const middle = watermarkAnchor("center-left", W, H, BOX_W, BOX_H).y;
    const bottom = watermarkAnchor("bottom-left", W, H, BOX_W, BOX_H).y;
    expect(top).toBeLessThan(middle);
    expect(middle).toBeLessThan(bottom);
  });

  it("centres the middle cell exactly", () => {
    const { x, y } = watermarkAnchor("center", W, H, BOX_W, BOX_H);
    expect(x).toBeCloseTo((W - BOX_W) / 2);
    expect(y).toBeCloseTo((H - BOX_H) / 2);
  });

  it("gives every cell a distinct spot", () => {
    const spots = GRID.map((position) => {
      const { x, y } = watermarkAnchor(position, W, H, BOX_W, BOX_H);
      return `${Math.round(x)},${Math.round(y)}`;
    });
    expect(new Set(spots).size).toBe(GRID.length);
  });
});
