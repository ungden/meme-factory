import { describe, expect, it } from "vitest";
import {
  ACTION_UNIT_COST_USD,
  buildCostBreakdown,
  costPerPointUsd,
  summariseProfit,
} from "./admin-finance";
import { AI_PRICING_USD_VND } from "./ai-pricing";

// Shape of the real production tally at the time this was written.
const SPEND = [
  { action: "meme", calls: 533, points: 2677 },
  { action: "character", calls: 125, points: 390 },
  { action: null, calls: 4, points: 12 },
];

describe("buildCostBreakdown", () => {
  it("keeps measured and reconstructed cost apart", () => {
    const breakdown = buildCostBreakdown({
      measuredUsd: 0.811709,
      measuredCalls: 12,
      spendByAction: SPEND,
    });
    expect(breakdown.measuredUsd).toBeCloseTo(0.811709, 6);
    expect(breakdown.measuredCalls).toBe(12);
    expect(breakdown.reconstructedUsd).toBeGreaterThan(0);
    // Anything summed must equal the two parts; no third source sneaks in.
    expect(breakdown.totalUsd).toBeCloseTo(breakdown.measuredUsd + breakdown.reconstructedUsd, 6);
  });

  it("does not bill a call twice when it has both a job record and an action tag", () => {
    const withJobs = buildCostBreakdown({ measuredUsd: 0.8, measuredCalls: 12, spendByAction: SPEND });
    const withoutJobs = buildCostBreakdown({ measuredUsd: 0, measuredCalls: 0, spendByAction: SPEND });
    expect(withJobs.reconstructedCalls).toBe(withoutJobs.reconstructedCalls - 12);
  });

  it("counts calls with no action as unattributed rather than free", () => {
    const breakdown = buildCostBreakdown({ measuredUsd: 0, measuredCalls: 0, spendByAction: SPEND });
    expect(breakdown.unattributedCalls).toBe(4);
  });

  it("reports how much of the cost is actually measured", () => {
    const mostlyReconstructed = buildCostBreakdown({ measuredUsd: 0.8, measuredCalls: 12, spendByAction: SPEND });
    expect(mostlyReconstructed.measuredCoverage).toBeLessThan(0.05);

    const fullyMeasured = buildCostBreakdown({ measuredUsd: 1, measuredCalls: 658, spendByAction: SPEND });
    expect(fullyMeasured.measuredCoverage).toBe(1);
  });

  it("never returns a negative reconstruction", () => {
    const breakdown = buildCostBreakdown({ measuredUsd: 99, measuredCalls: 9999, spendByAction: SPEND });
    expect(breakdown.reconstructedUsd).toBeGreaterThanOrEqual(0);
    expect(breakdown.reconstructedCalls).toBeGreaterThanOrEqual(0);
  });
});

describe("costPerPointUsd", () => {
  it("blends by how points were really spent", () => {
    const blended = costPerPointUsd(SPEND);
    expect(blended).toBeGreaterThan(0);
    // A point must cost less than a whole meme, since a meme costs several points.
    expect(blended).toBeLessThan(ACTION_UNIT_COST_USD.meme);
  });

  it("is zero when nothing attributable was spent", () => {
    expect(costPerPointUsd([{ action: null, calls: 4, points: 12 }])).toBe(0);
  });
});

describe("summariseProfit", () => {
  it("computes gross profit and margin from cash and cost", () => {
    const summary = summariseProfit({
      cashCollectedVnd: 5_573_000,
      providerCostVnd: 1_000_000,
      outstandingPoints: 6252,
      costPerPointUsd: 0.01,
    });
    expect(summary.grossProfitVnd).toBe(4_573_000);
    expect(summary.grossMarginPercent).toBeCloseTo((4_573_000 / 5_573_000) * 100, 6);
  });

  it("prices unspent points as a liability still owed", () => {
    const summary = summariseProfit({
      cashCollectedVnd: 0,
      providerCostVnd: 0,
      outstandingPoints: 100,
      costPerPointUsd: 0.01,
    });
    expect(summary.outstandingLiabilityVnd).toBe(Math.round(100 * 0.01 * AI_PRICING_USD_VND));
  });

  it("does not divide by zero before the first sale", () => {
    const summary = summariseProfit({
      cashCollectedVnd: 0,
      providerCostVnd: 0,
      outstandingPoints: 0,
      costPerPointUsd: 0,
    });
    expect(summary.grossMarginPercent).toBe(0);
  });
});
