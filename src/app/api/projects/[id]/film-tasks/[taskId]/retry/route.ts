import { NextRequest, NextResponse } from "next/server";
import { access, checkVersion, fail, FilmError } from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    checkVersion(a, await r.json());
    const { data: t } = await a.admin
      .from("short_film_tasks")
      .select("*")
      .eq("id", p.taskId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .single();
    if (
      !t ||
      t.status !== "failed" ||
      (!t.checkpoint?.providerCompleted &&
        !t.checkpoint?.generatedImage &&
        !["render", "frame", "dub"].includes(t.kind))
    )
      throw new FilmError(
        "Chỉ thử lại lưu/xử lý; lượt sinh lỗi cần báo giá mới.",
        409,
      );
    const { error } = await a.admin
      .from("short_film_tasks")
      .update({
        status: "queued",
        error: null,
        lease_owner: null,
        lease_expires_at: null,
        checkpoint: { ...t.checkpoint, failureCount: 0 },
        next_poll_at: new Date().toISOString(),
      })
      .eq("id", t.id)
      .eq("status", "failed");
    if (error) throw error;
    return NextResponse.json({ jobId: t.run_id }, { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
