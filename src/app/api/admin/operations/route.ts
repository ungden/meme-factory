import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";
import { buildAlerts, REVIEW_WAIT_MINUTES } from "@/lib/alerts";
import { workerCheck } from "@/lib/health";

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;

/**
 * GET /api/admin/operations — tình trạng vận hành ngay lúc này.
 *
 * Cùng bộ luật với cảnh báo tự động (`src/lib/alerts.ts`), nhưng hiện trên màn
 * quản trị thay vì gửi đi. Telegram cần một tài khoản bên ngoài; màn này thì
 * không, nên vẫn có một chỗ nhìn được kể cả khi chưa nối kênh cảnh báo nào.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const now = Date.now();
    const sinceHour = new Date(now - HOUR_MS).toISOString();

    const [settings, runs, jobs, transactions] = await Promise.all([
      supabaseAdmin.from("system_settings").select("value").eq("key", "worker_heartbeat").maybeSingle(),
      supabaseAdmin
        .from("short_film_production_runs")
        .select("id, project_id, status, updated_at")
        .in("status", ["needs_review", "paused", "budget_blocked"])
        .limit(50),
      supabaseAdmin.from("generation_jobs").select("status").gte("created_at", sinceHour).limit(500),
      supabaseAdmin.from("project_transactions").select("type").gte("created_at", sinceHour).limit(500),
    ]);

    const heartbeat = (settings.data?.value as Record<string, string> | null)?.wavespeed ?? null;
    const jobRows = jobs.data || [];
    const txRows = transactions.data || [];
    const waitingRuns = (runs.data || []).map((run) => ({
      id: String(run.id),
      minutes: Math.round((now - Date.parse(String(run.updated_at))) / 60000),
    }));

    return NextResponse.json({
      worker: workerCheck(heartbeat, now),
      alerts: buildAlerts({
        now,
        workerSeenAt: heartbeat,
        waitingRuns,
        jobs: { failed: jobRows.filter((job) => job.status === "failed").length, total: jobRows.length },
        transactions: {
          refunds: txRows.filter((tx) => tx.type === "refund").length,
          payments: txRows.filter((tx) => tx.type === "payment").length,
        },
      }),
      waiting: waitingRuns.filter((run) => run.minutes > REVIEW_WAIT_MINUTES).length,
      jobs: { failed: jobRows.filter((job) => job.status === "failed").length, total: jobRows.length },
    });
  } catch (error) {
    if (error instanceof AdminError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
