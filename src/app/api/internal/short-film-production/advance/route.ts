import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { advanceProductionRun } from "@/lib/short-film/production";

export const maxDuration = 180;
export async function POST(request: NextRequest) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  if (typeof body.runId === "string" && typeof body.leaseOwner === "string") {
    const { data: run, error } = await admin
      .from("short_film_production_runs")
      .select("*")
      .eq("id", body.runId)
      .eq("lease_owner", body.leaseOwner)
      .in("status", ["queued", "scripting", "running"])
      .gt("lease_expires_at", new Date().toISOString())
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    if (!run)
      return NextResponse.json(
        { error: "Production lease is no longer active." },
        { status: 409 },
      );
    await advanceProductionRun(admin, run);
    return NextResponse.json({ processed: 1 });
  }
  // Compatibility fallback for an older worker during a rolling deployment.
  const { error: scheduleError } = await admin.rpc(
    "schedule_due_film_automations",
  );
  if (scheduleError)
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  const { data: runs, error } = await admin.rpc("claim_film_production_runs", {
    p_limit: 1,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  for (const run of runs || []) await advanceProductionRun(admin, run);
  return NextResponse.json({ processed: runs?.length || 0 });
}
