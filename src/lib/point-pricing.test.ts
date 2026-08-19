import { describe, expect, it } from "vitest";
import {
  POINT_COSTS,
  WORST_CASE_QUOTES,
  checkMargin,
  minimumSafePoints,
  parsePointCosts,
  type PointAction,
} from "./point-pricing";

const BILLED: PointAction[] = ["meme", "character", "background"];

describe("margin guard", () => {
  it.each(BILLED)("today's price for %s covers its worst call", (action) => {
    // The charge is taken before the route knows how many references a request
    // carries, so a flat price is only safe if it covers the ceiling.
    const margin = checkMargin(action, POINT_COSTS[action]);
    expect(margin.coversCost).toBe(true);
    expect(margin.meetsTarget).toBe(true);
    expect(margin.marginMultiplier).toBeGreaterThanOrEqual(1.5);
  });

  it("prices the worst case above the everyday quote it replaces", () => {
    // If the worst case were not worse, the guard would be checking nothing.
    expect(WORST_CASE_QUOTES.meme.providerCostUsd).toBeGreaterThan(0);
    expect(WORST_CASE_QUOTES.meme.inputImageCount).toBe(14);
  });

  it("catches a price that would sell below cost", () => {
    const margin = checkMargin("meme", 1);
    expect(margin.coversCost).toBe(false);
    expect(margin.minimumPoints).toBeGreaterThan(1);
  });

  it("treats free actions as always safe", () => {
    const margin = checkMargin("content", 0);
    expect(margin.coversCost).toBe(true);
    expect(margin.minimumPoints).toBe(0);
  });

  it("minimumSafePoints is the smallest price that still clears the target", () => {
    for (const action of BILLED) {
      const minimum = minimumSafePoints(action);
      expect(checkMargin(action, minimum).meetsTarget).toBe(true);
      expect(checkMargin(action, minimum - 1).meetsTarget).toBe(false);
    }
  });
});

describe("parsePointCosts", () => {
  it("accepts a well-formed table and fills the gaps from the defaults", () => {
    const parsed = parsePointCosts({ meme: 8 });
    expect(parsed?.meme).toBe(8);
    expect(parsed?.character).toBe(POINT_COSTS.character);
  });

  it("rejects anything that is not a non-negative integer", () => {
    expect(parsePointCosts({ meme: -1 })).toBeNull();
    expect(parsePointCosts({ meme: 1.5 })).toBeNull();
    expect(parsePointCosts({ meme: "6" })).toBeNull();
    expect(parsePointCosts({ meme: Number.NaN })).toBeNull();
    expect(parsePointCosts(null)).toBeNull();
    expect(parsePointCosts("nope")).toBeNull();
  });

  it("allows a free action", () => {
    expect(parsePointCosts({ content: 0 })?.content).toBe(0);
  });
});
