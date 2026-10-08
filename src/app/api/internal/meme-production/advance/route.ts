import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { authorizeInternal } from "@/lib/internal-auth";
import { processMemeRun, type MemeRun } from "@/lib/meme-production";

export const maxDuration = 180;

/**
 * Xếp lịch meme tới hạn rồi làm các lượt đang chờ. Mỗi lượt mất 30–60 giây
 * (viết chữ + vẽ ảnh), nên dừng nhận lượt mới khi gần hết ngân sách thời gian;
 * lượt còn lại để nhịp cron sau.
 */
export async function POST(request: NextRequest) {
  if (!authorizeInternal(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId) {
    const { error } = await admin.rpc("schedule_due_meme_automations");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const deadline = Date.now() + 100_000;
  let processed = 0;
  while (Date.now() < deadline) {
    const { data: runs, error } = await admin.rpc("claim_meme_production_runs", {
      p_limit: 1,
      p_run: runId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const run = (runs || [])[0] as MemeRun | undefined;
    if (!run) break;
    await processMemeRun(admin, run);
    processed += 1;
    if (runId) break;
  }
  return NextResponse.json({ processed });
}
