import "server-only";
import { getSupabaseAdmin } from "@/lib/admin";
import {
  POINT_COSTS,
  checkMargin,
  parsePointCosts,
  type PointAction,
} from "@/lib/point-pricing";

/**
 * Server-side price table.
 *
 * Prices live in `system_settings.point_costs` so an admin can change them without
 * a deploy; the compiled constants are the fallback when nothing is configured or
 * the stored value is malformed. Reads are cached briefly because this runs on
 * every billed generation.
 */

const CACHE_TTL_MS = 60_000;

let cache: { costs: Record<PointAction, number>; readAt: number } | null = null;

export function invalidatePointCostCache() {
  cache = null;
}

export async function getPointCosts(): Promise<Record<PointAction, number>> {
  if (cache && Date.now() - cache.readAt < CACHE_TTL_MS) return cache.costs;

  try {
    const { data } = await getSupabaseAdmin()
      .from("system_settings")
      .select("value")
      .eq("key", "point_costs")
      .maybeSingle();

    const parsed = parsePointCosts(data?.value);
    const costs = parsed ?? POINT_COSTS;
    cache = { costs, readAt: Date.now() };
    return costs;
  } catch (error) {
    // Never let a settings read failure block a paid generation.
    console.error("Point price read failed, using built-in prices:", error);
    return POINT_COSTS;
  }
}

export async function getPointCost(action: PointAction): Promise<number> {
  return (await getPointCosts())[action];
}

/**
 * Refuses to sell below cost.
 *
 * The charge is taken before the route knows how many references a request will
 * carry, so this compares the price against the worst call the action can make.
 * Without it, a provider price rise or a bad admin edit sells at a loss silently.
 */
export async function assertPriceCoversCost(action: PointAction, points: number) {
  const margin = checkMargin(action, points);
  if (margin.coversCost) return margin;

  console.error(
    `Refusing ${action}: ${points} points = ${margin.revenueVnd}đ but the worst case costs ${margin.worstCostVnd}đ`
  );
  throw new Error("PRICE_BELOW_COST");
}
