import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { authorizeCron } from "@/lib/internal-auth";
import { reportError } from "@/lib/observability";
import { buildAlerts, dueAlerts, REVIEW_WAIT_MINUTES, type Alert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HOUR_MS = 60 * 60 * 1000;

async function notify(alerts: Alert[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  const text = alerts
    .map((alert) => `${alert.level === "error" ? "🔴" : "🟡"} ${alert.message}`)
    .join("\n");
  // Log luôn có, kể cả khi chưa nối Telegram: cảnh báo không được phép biến mất.
  console.error(JSON.stringify({ level: "warning", scope: "alerts", message: text }));
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `AIDA — cảnh báo vận hành\n${text}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Telegram ${response.status}`);
  return true;
}

/**
 * GET /api/cron/alerts — quét vài chỉ số vận hành mỗi 5 phút và báo khi lệch.
 *
 * Giữ ở mức "đủ để biết trước khách": worker im lặng, lượt phim kẹt chờ người,
 * tác vụ provider hỏng hàng loạt, hoàn điểm bất thường.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const sinceHour = new Date(now - HOUR_MS).toISOString();
  const admin = getSupabaseAdmin();

  try {
    const [settings, runs, jobs, transactions] = await Promise.all([
      admin.from("system_settings").select("key, value").in("key", ["worker_heartbeat", "alert_state"]),
      admin
        .from("short_film_production_runs")
        .select("id, updated_at")
        .in("status", ["needs_review", "paused", "budget_blocked"])
        .lt("updated_at", new Date(now - REVIEW_WAIT_MINUTES * 60000).toISOString())
        .limit(50),
      admin.from("generation_jobs").select("status").gte("created_at", sinceHour).limit(500),
      admin.from("project_transactions").select("type").gte("created_at", sinceHour).limit(500),
    ]);

    const byKey = Object.fromEntries((settings.data || []).map((row) => [row.key, row.value as Record<string, string>]));
    const jobRows = jobs.data || [];
    const txRows = transactions.data || [];

    const alerts = buildAlerts({
      now,
      workerSeenAt: byKey.worker_heartbeat?.wavespeed ?? null,
      waitingRuns: (runs.data || []).map((run) => ({
        id: run.id as string,
        minutes: Math.round((now - Date.parse(run.updated_at as string)) / 60000),
      })),
      jobs: {
        failed: jobRows.filter((job) => job.status === "failed").length,
        total: jobRows.length,
      },
      transactions: {
        refunds: txRows.filter((tx) => tx.type === "refund").length,
        payments: txRows.filter((tx) => tx.type === "payment").length,
      },
    });

    const sentAt = byKey.alert_state || {};
    const due = dueAlerts(alerts, sentAt, now);
    // Một sự cố đã hết thì quên luôn lần gửi trước: nếu không, sự cố kế tiếp
    // cùng loại xảy ra trong vòng một giờ sẽ bị nín, và im lặng lúc đó nhìn
    // giống hệt "mọi thứ vẫn ổn".
    const value = Object.fromEntries(
      Object.entries(sentAt).filter(([key]) => alerts.some((alert) => alert.key === key)),
    );
    for (const alert of due) value[alert.key] = new Date(now).toISOString();
    if (due.length) await notify(due);
    if (due.length || Object.keys(value).length !== Object.keys(sentAt).length)
      await admin
        .from("system_settings")
        .upsert({ key: "alert_state", value, updated_at: new Date(now).toISOString() }, { onConflict: "key" });

    return NextResponse.json({ ok: true, alerts: alerts.map((a) => a.key), notified: due.map((a) => a.key) });
  } catch (error) {
    await reportError(error, { scope: "cron.alerts" });
    return NextResponse.json({ error: "Không quét được cảnh báo." }, { status: 500 });
  }
}
