import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const p = await params, a = await access(request, p.id);
    const { data: run, error } = await a.admin
      .from("short_film_production_runs")
      .select("*")
      .eq("id", p.runId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .maybeSingle();
    if (error) throw error;
    if (!run) throw new FilmError("Không tìm thấy lượt sản xuất.", 404);
    const { data: tasks, error: taskError } = await a.admin
      .from("short_film_tasks")
      .select("id,kind,scene_id,scene_version,status,error,points,result,created_at,updated_at")
      .eq("production_run_id", run.id)
      .order("created_at");
    if (taskError) throw taskError;
    return NextResponse.json({ run, tasks: tasks || [] });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const p = await params,
      a = await access(request, p.id),
      body = await request.json();
    const { data: run, error: runError } = await a.admin
      .from("short_film_production_runs")
      .select("*")
      .eq("id", p.runId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) throw new FilmError("Không tìm thấy lượt sản xuất.", 404);
    const action = String(body.action || "");
    if (
      action === "pause" &&
      ["queued", "scripting", "running"].includes(run.status)
    ) {
      // Delegated to the guarded RPC below.
    } else if (
      action === "resume" &&
      ["paused", "needs_review", "budget_blocked"].includes(run.status)
    ) {
      if (
        Number.isInteger(body.maxPointsPerFilm) &&
        Number.isInteger(body.maxPointsPerDay)
      ) {
        if (
          body.maxPointsPerFilm <= 0 ||
          body.maxPointsPerDay < body.maxPointsPerFilm
        )
          throw new FilmError("Hạn mức không hợp lệ.");
        if (a.project.user_id !== a.user.id)
          throw new FilmError("Chỉ chủ dự án được tăng hạn mức.", 403);
      }
    } else if (
      action === "cancel" &&
      !["completed", "cancelled"].includes(run.status)
    ) {
    } else
      throw new FilmError(
        "Không thể thực hiện thao tác ở trạng thái hiện tại.",
        409,
      );
    const hasBudgetUpdate =
      Number.isInteger(body.maxPointsPerFilm) &&
      Number.isInteger(body.maxPointsPerDay);
    const { data, error } = await a.admin.rpc("control_film_production_run_v2", {
      p_id: run.id,
      p_actor: a.user.id,
      p_workspace: a.project.workspace_version,
      p_action: action,
      p_expected_updated_at: run.updated_at,
      p_max_film: action === "resume" && hasBudgetUpdate ? body.maxPointsPerFilm : null,
      p_max_day: action === "resume" && hasBudgetUpdate ? body.maxPointsPerDay : null,
    });
    if (error) throw new FilmError(error.message, error.message.includes("CONFLICT") ? 409 : 400);
    return NextResponse.json({ run: data });
  } catch (error) {
    return fail(error);
  }
}
