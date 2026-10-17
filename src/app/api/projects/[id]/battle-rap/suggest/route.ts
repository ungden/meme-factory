import { NextRequest, NextResponse } from "next/server";
import { access, fail } from "@/lib/short-film/server";
import { checkRateLimit, RATE_LIMITS, rateLimitMessage } from "@/lib/rate-limit";
import { BattleAssistError, normalizeAssistRequest, suggestBattleChanges } from "@/lib/battle-rap/assist";
import type { BattleRun } from "@/lib/battle-rap/contracts";

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(request, (await params).id);
    const body = normalizeAssistRequest(await request.json());
    let run: BattleRun | null = null;
    if (body.runId) {
      const result = await a.admin.from("battle_rap_runs").select("*").eq("id", body.runId).eq("project_id", a.project.id).eq("workspace_version", a.project.workspace_version).maybeSingle();
      if (result.error || !result.data) throw new BattleAssistError("Không tìm thấy bài rap trong kênh.", 404);
      run = result.data as BattleRun;
    }
    const limits = await Promise.all([
      checkRateLimit(a.admin, { ...RATE_LIMITS.promptAssistMinute, action: "battle-rap-assist" }, a.user.id),
      checkRateLimit(a.admin, { ...RATE_LIMITS.promptAssistDay, action: "battle-rap-assist-day" }, a.user.id),
    ]);
    const limited = limits.find(item => !item.allowed);
    if (limited) return NextResponse.json({ error: rateLimitMessage(limited), code: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(Math.ceil(limited.resetIn)) } });
    return NextResponse.json(await suggestBattleChanges(a.admin, a.project.id, run, body));
  } catch (error) {
    if (error instanceof BattleAssistError) return NextResponse.json({ error: error.message }, { status: error.status });
    return fail(error);
  }
}
