import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";
import {
  buildCostBreakdown,
  costPerPointUsd,
  summariseProfit,
  type SpendByAction,
} from "@/lib/admin-finance";

/**
 * One read for the whole business: money in, provider cost out, what is still
 * owed, and what the platform actually holds.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const [
      cashRes,
      jobsRes,
      spendRes,
      userWalletsRes,
      projectWalletsRes,
      refundsRes,
      countsRes,
    ] = await Promise.all([
      supabaseAdmin.from("topup_orders").select("amount, created_at").eq("status", "completed"),
      supabaseAdmin.from("generation_jobs").select("actual_cost_usd, estimated_cost_usd, status, provider, creation_kind"),
      supabaseAdmin
        .from("project_transactions")
        .select("ai_action, amount")
        .eq("type", "payment")
        .eq("status", "completed"),
      supabaseAdmin.from("wallets").select("points"),
      supabaseAdmin.from("project_wallets").select("points"),
      supabaseAdmin
        .from("project_transactions")
        .select("amount")
        .eq("type", "refund")
        .eq("status", "completed"),
      Promise.all([
        supabaseAdmin.from("projects").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("characters").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("mascot_base_images").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("mascot_base_images").select("id", { count: "exact", head: true }).eq("status", "ready"),
        supabaseAdmin.from("memes").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("memes").select("id", { count: "exact", head: true }).eq("composed_locally", true),
        supabaseAdmin.from("character_poses").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("meme_exports").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("wallets").select("id", { count: "exact", head: true }),
      ]),
    ]);

    const cashCollectedVnd = (cashRes.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

    const jobs = jobsRes.data ?? [];
    const measuredUsd = jobs.reduce((sum, job) => sum + Number(job.actual_cost_usd ?? 0), 0);
    const measuredCalls = jobs.filter((job) => job.actual_cost_usd !== null).length;

    const spendMap = new Map<string | null, SpendByAction>();
    for (const row of spendRes.data ?? []) {
      const key = (row.ai_action as string | null) ?? null;
      const entry = spendMap.get(key) ?? { action: key, calls: 0, points: 0 };
      entry.calls += 1;
      entry.points += Math.abs(Number(row.amount));
      spendMap.set(key, entry);
    }
    const spendByAction = [...spendMap.values()].sort((a, b) => b.points - a.points);

    const cost = buildCostBreakdown({ measuredUsd, measuredCalls, spendByAction });
    const outstandingPoints =
      (userWalletsRes.data ?? []).reduce((sum, row) => sum + Number(row.points), 0) +
      (projectWalletsRes.data ?? []).reduce((sum, row) => sum + Number(row.points), 0);

    const profit = summariseProfit({
      cashCollectedVnd,
      providerCostVnd: cost.totalVnd,
      outstandingPoints,
      costPerPointUsd: costPerPointUsd(spendByAction),
    });

    // Cash by day, last 30, so a trend is visible without a chart library.
    const dailyCash: Record<string, number> = {};
    for (let i = 29; i >= 0; i -= 1) {
      dailyCash[new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)] = 0;
    }
    for (const row of cashRes.data ?? []) {
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      if (key in dailyCash) dailyCash[key] += Number(row.amount);
    }

    const [
      projects, mascots, templates, templatesReady, memes, memesComposed, poses, exports, users,
    ] = countsRes;

    return NextResponse.json({
      finance: {
        ...profit,
        pointsConsumed: spendByAction.reduce((sum, row) => sum + row.points, 0),
        refundedPoints: (refundsRes.data ?? []).reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0),
        cost,
        spendByAction,
        dailyCash,
      },
      assets: {
        projects: projects.count ?? 0,
        mascots: mascots.count ?? 0,
        poses: poses.count ?? 0,
        templates: templates.count ?? 0,
        templatesReady: templatesReady.count ?? 0,
        memes: memes.count ?? 0,
        memesComposedLocally: memesComposed.count ?? 0,
        exports: exports.count ?? 0,
        users: users.count ?? 0,
      },
      health: {
        failedJobs: jobs.filter((job) => job.status === "failed").length,
        jobsByProvider: jobs.reduce<Record<string, number>>((acc, job) => {
          acc[job.provider] = (acc[job.provider] ?? 0) + 1;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin overview failed:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
