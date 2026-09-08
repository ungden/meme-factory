import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const p = await params,
      a = await access(request, p.id),
      body = await request.json();
    const { data: run } = await a.admin
      .from("short_film_production_runs")
      .select("*")
      .eq("id", p.runId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .maybeSingle();
    if (!run) throw new FilmError("Không tìm thấy lượt sản xuất.", 404);
    if (run.created_by !== a.user.id && a.project.user_id !== a.user.id)
      throw new FilmError("Không có quyền thay đổi lượt này.", 403);
    const action = String(body.action || "");
    if (
      action === "pause" &&
      ["queued", "scripting", "running"].includes(run.status)
    ) {
      await a.admin
        .from("short_film_production_runs")
        .update({ status: "paused", lease_owner: null, lease_expires_at: null })
        .eq("id", run.id);
    } else if (
      action === "resume" &&
      ["paused", "needs_review", "budget_blocked"].includes(run.status)
    ) {
      const patch: Record<string, unknown> = {
        status: run.plan_id ? "running" : "scripting",
        error: null,
        next_poll_at: new Date().toISOString(),
        completed_at: null,
      };
      if (
        Number.isInteger(body.maxPointsPerFilm) &&
        Number.isInteger(body.maxPointsPerDay)
      ) {
        if (
          body.maxPointsPerFilm <= 0 ||
          body.maxPointsPerDay < body.maxPointsPerFilm
        )
          throw new FilmError("Hạn mức không hợp lệ.");
        patch.max_points_per_film = body.maxPointsPerFilm;
        patch.max_points_per_day = body.maxPointsPerDay;
      }
      await a.admin
        .from("short_film_production_runs")
        .update(patch)
        .eq("id", run.id);
    } else if (
      action === "cancel" &&
      !["completed", "cancelled"].includes(run.status)
    ) {
      await a.admin
        .from("short_film_tasks")
        .update({
          status: "cancelled",
          error: "Người dùng hủy trước khi gửi provider.",
        })
        .eq("production_run_id", run.id)
        .eq("status", "queued");
      await a.admin
        .from("short_film_production_runs")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
        })
        .eq("id", run.id);
    } else
      throw new FilmError(
        "Không thể thực hiện thao tác ở trạng thái hiện tại.",
        409,
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
