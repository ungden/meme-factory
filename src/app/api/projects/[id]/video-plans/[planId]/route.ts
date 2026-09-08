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
export async function DELETE(r: NextRequest, { params }: Context) {
  try {
    const p = await params;
    const a = await access(r, p.id);
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
