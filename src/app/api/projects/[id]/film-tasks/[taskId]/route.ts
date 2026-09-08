import { NextRequest, NextResponse } from "next/server";
import { access, checkVersion, fail, FilmError } from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    const body = await r.json();
    checkVersion(a, body);
    const { data: t } = await a.admin
      .from("short_film_tasks")
      .select("*")
      .eq("id", p.taskId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .single();
    if (!t || t.status !== "completed")
      throw new FilmError("Kết quả chưa sẵn sàng để duyệt.");
    if (body.action !== "approve")
      throw new FilmError("Thao tác không hợp lệ.");
    const { error } = await a.admin.rpc("approve_film_task", {
      p_task: t.id,
      p_project: a.project.id,
      p_actor: a.user.id,
      p_workspace: a.project.workspace_version,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
