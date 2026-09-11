import { NextRequest, NextResponse } from "next/server";
import {
  access,
  readPlan,
  savePlan,
  tasksForPlan,
  publicTasks,
  fail,
  FilmError,
} from "@/lib/short-film/server";
type Context = { params: Promise<{ id: string; planId: string }> };
export async function GET(r: NextRequest, { params }: Context) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    const plan = await readPlan(a, p.planId);
    return NextResponse.json({
      plan,
      tasks: await publicTasks(a, await tasksForPlan(a, plan.id)),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(r: NextRequest, { params }: Context) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    return NextResponse.json({
      plan: await savePlan(a, await r.json(), await readPlan(a, p.planId)),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(r: NextRequest, { params }: Context) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    if (a.project.user_id !== a.user.id)
      throw new FilmError("Chỉ chủ dự án mới có thể ẩn kịch bản.", 403);
    const plan = await readPlan(a, p.planId);
    const body = (await r.json()) as Record<string, unknown>;
    if (body.action !== "archive")
      throw new FilmError("Thao tác quản lý kịch bản không hợp lệ.", 400);
    if (Number(body.workspaceVersion) !== a.project.workspace_version)
      throw new FilmError("Workspace đã thay đổi. Hãy tải lại bản hiện tại.", 409);
    if (Number(body.expectedVersion) !== plan.version)
      throw new FilmError("Kịch bản đã đổi ở tab khác. Hãy tải lại trước khi ẩn.", 409);
    const { count, error: countError } = await a.admin
      .from("short_film_tasks")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", p.planId);
    if (countError) throw countError;
    if (!count)
      throw new FilmError("Kịch bản chưa có lịch sử sản xuất; hãy dùng Xóa kịch bản.", 409);
    const { error } = await a.admin
      .from("video_plans")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", p.planId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .is("archived_at", null);
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(r: NextRequest, { params }: Context) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    if (a.project.user_id !== a.user.id)
      throw new FilmError("Chỉ chủ dự án mới có thể xóa kịch bản.", 403);
    await readPlan(a, p.planId);
    const { count } = await a.admin
      .from("short_film_tasks")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", p.planId);
    if (count)
      throw new FilmError(
        "Phim đã có lịch sử sản xuất; giữ lại các kết quả và bản dựng.",
        409,
      );
    const { error } = await a.admin
      .from("video_plans")
      .delete()
      .eq("id", p.planId)
      .eq("project_id", a.project.id);
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fail(e);
  }
}
