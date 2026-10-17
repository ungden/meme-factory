import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { normalizeInput } from "@/lib/battle-rap/contracts";
import { checked } from "@/lib/battle-rap/server";
import { sunoConfigured } from "@/lib/battle-rap/suno";
import { ensureProjectPoints } from "@/lib/project-points";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(request, (await params).id);
    const runs = await checked(a.admin.from("battle_rap_runs").select("*").eq("project_id", a.project.id).eq("workspace_version", a.project.workspace_version).order("created_at", { ascending: false }).limit(20));
    return NextResponse.json({ runs, automaticMusic: sunoConfigured(), musicReady: sunoConfigured() && Number(process.env.SUNO_GENERATION_COST_USD) > 0 });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(request, (await params).id), body = await request.json();
    let input;
    try { input = normalizeInput(body); }
    catch (error) { throw new FilmError(error instanceof Error ? error.message : "Ý tưởng chưa hợp lệ."); }
    const key = String(body.idempotencyKey || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new FilmError("Mã yêu cầu chưa hợp lệ. Tải lại trang nhé.");
    const budget = Number(body.budgetPoints ?? 600);
    if (!Number.isInteger(budget) || budget < 1 || budget > 100000) throw new FilmError("Mức chi cần từ 1 đến 100.000 điểm.");
    const prior = await checked(a.admin.from("battle_rap_runs").select("id,project_id,created_by").eq("id", key).maybeSingle());
    if (prior) {
      if (prior.project_id !== a.project.id || prior.created_by !== a.user.id) throw new FilmError("Mã yêu cầu đã được dùng.", 409);
      return NextResponse.json({ runId: prior.id }, { status: 202 });
    }
    const wallet = await checked(a.admin.from("project_wallets").select("points").eq("project_id", a.project.id).maybeSingle());
    const funded = await ensureProjectPoints(async (name, args) => a.admin.rpc(name, args), {
      projectId: a.project.id, projectOwnerId: a.project.user_id, actorUserId: a.user.id,
      currentPoints: Number(wallet?.points || 0), needed: budget, projectName: a.project.name,
    });
    if (!funded.ok) return NextResponse.json({ error: "Chưa đủ điểm cho mức chi đã chọn.", required: budget, available: funded.available }, { status: 402 });
    const id = await checked(a.admin.rpc("create_battle_rap_run", { p_id: key, p_project: a.project.id, p_actor: a.user.id, p_workspace: a.project.workspace_version, p_input: input, p_budget: budget }));
    return NextResponse.json({ runId: id }, { status: 202 });
  } catch (error) { return fail(error instanceof Error && error.message === "INSUFFICIENT_POINTS" ? new FilmError("Chưa đủ điểm cho bài này.", 402) : error); }
}
