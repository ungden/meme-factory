import { AI_PRICING_USD_VND } from "@/lib/ai-pricing";
import { POINT_ACTION_QUOTES, type PointAction } from "@/lib/point-pricing";

/**
 * Provider cost reconstruction.
 *
 * `generation_jobs` only started recording cost on 2026-07-22, but spending goes
 * back to March, so most history has no cost row. Those calls do carry an
 * `ai_action` tag, and the estimator has proven accurate against the jobs we can
 * check (0.06757 estimated vs 0.06764 actual, a 0.1% error), so older spend is
 * reconstructed from the action rather than left out. Measured and reconstructed
 * figures are reported separately — never summed into one number that pretends to
 * be measured.
 */

export const ACTION_UNIT_COST_USD: Record<Exclude<PointAction, "content">, number> = {
  meme: POINT_ACTION_QUOTES.meme.providerCostUsd,
  character: POINT_ACTION_QUOTES.character.providerCostUsd,
  background: POINT_ACTION_QUOTES.background.providerCostUsd,
};

export interface SpendByAction {
  action: string | null;
  calls: number;
  points: number;
}

export interface CostBreakdown {
  /** Summed from generation_jobs.actual_cost_usd. */
  measuredUsd: number;
  measuredCalls: number;
  /** Reconstructed from ai_action for calls with no job record. */
  reconstructedUsd: number;
  reconstructedCalls: number;
  /** Calls whose action is unknown, so no cost can be attributed at all. */
  unattributedCalls: number;
  totalUsd: number;
  totalVnd: number;
  /** Share of billed calls whose cost is measured rather than reconstructed. */
  measuredCoverage: number;
}

export function buildCostBreakdown(params: {
  measuredUsd: number;
  measuredCalls: number;
  spendByAction: SpendByAction[];
}): CostBreakdown {
  let reconstructedUsd = 0;
  let reconstructedCalls = 0;
  let unattributedCalls = 0;

  for (const row of params.spendByAction) {
    const unit = row.action ? ACTION_UNIT_COST_USD[row.action as keyof typeof ACTION_UNIT_COST_USD] : undefined;
    if (!unit) {
      unattributedCalls += row.calls;
      continue;
    }
    reconstructedCalls += row.calls;
    reconstructedUsd += row.calls * unit;
  }

  // Calls that have a job record are also in the action tally; do not bill twice.
  reconstructedCalls = Math.max(0, reconstructedCalls - params.measuredCalls);
  reconstructedUsd = Math.max(
    0,
    reconstructedUsd - params.measuredCalls * ACTION_UNIT_COST_USD.meme
  );

  const totalUsd = params.measuredUsd + reconstructedUsd;
  const billedCalls = params.measuredCalls + reconstructedCalls;

  return {
    measuredUsd: round(params.measuredUsd),
    measuredCalls: params.measuredCalls,
    reconstructedUsd: round(reconstructedUsd),
    reconstructedCalls,
    unattributedCalls,
    totalUsd: round(totalUsd),
    totalVnd: Math.round(totalUsd * AI_PRICING_USD_VND),
    measuredCoverage: billedCalls === 0 ? 1 : params.measuredCalls / billedCalls,
  };
}

export interface ProfitSummary {
  cashCollectedVnd: number;
  providerCostVnd: number;
  grossProfitVnd: number;
  grossMarginPercent: number;
  /** Points sold or granted that have not been spent — service still owed. */
  outstandingPoints: number;
  /** What those points will cost to serve, at today's prices. */
  outstandingLiabilityVnd: number;
}

export function summariseProfit(params: {
  cashCollectedVnd: number;
  providerCostVnd: number;
  outstandingPoints: number;
  /** Average provider cost per point, from the blend of actions actually used. */
  costPerPointUsd: number;
}): ProfitSummary {
  const grossProfitVnd = params.cashCollectedVnd - params.providerCostVnd;
  return {
    cashCollectedVnd: Math.round(params.cashCollectedVnd),
    providerCostVnd: Math.round(params.providerCostVnd),
    grossProfitVnd: Math.round(grossProfitVnd),
    grossMarginPercent:
      params.cashCollectedVnd === 0 ? 0 : (grossProfitVnd / params.cashCollectedVnd) * 100,
    outstandingPoints: params.outstandingPoints,
    outstandingLiabilityVnd: Math.round(
      params.outstandingPoints * params.costPerPointUsd * AI_PRICING_USD_VND
    ),
  };
}

/** Blended provider cost of one point, from how points were actually spent. */
export function costPerPointUsd(spendByAction: SpendByAction[]): number {
  let usd = 0;
  let points = 0;
  for (const row of spendByAction) {
    const unit = row.action ? ACTION_UNIT_COST_USD[row.action as keyof typeof ACTION_UNIT_COST_USD] : undefined;
    if (!unit || row.points <= 0) continue;
    usd += row.calls * unit;
    points += row.points;
  }
  return points === 0 ? 0 : usd / points;
}

function round(value: number) {
  return Number(value.toFixed(6));
}
