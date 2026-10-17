import { NextRequest, NextResponse } from "next/server";
import { authorizeInternal } from "@/lib/internal-auth";
import { advanceBattleRun, battleAdmin, checked } from "@/lib/battle-rap/server";
import type { BattleRun } from "@/lib/battle-rap/contracts";

export const maxDuration = 180;
export async function POST(request: NextRequest) {
  if (!authorizeInternal(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const admin = battleAdmin(), body = await request.json();
    const run = await checked(admin.from("battle_rap_runs").select("*").eq("id", body.runId).eq("lease_owner", body.leaseOwner).eq("status", "running").gt("lease_expires_at", new Date().toISOString()).maybeSingle()) as BattleRun | null;
    if (!run) return NextResponse.json({ error: "Không còn quyền xử lý lượt này." }, { status: 409 });
    await advanceBattleRun(admin, run);
    return NextResponse.json({ processed: 1 });
  } catch (error) {
    console.error("battle advance failed", error);
    return NextResponse.json({ error: "Không làm tiếp được bài rap." }, { status: 500 });
  }
}
