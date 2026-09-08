import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const p = await params;
    const a = await access(request, p.id);
    const { data: job, error } = await a.admin
      .from("creative_assists")
      .select("id,kind,status,result,error,created_at,completed_at")
      .eq("id", p.jobId)
      .eq("project_id", a.project.id)
      .eq("created_by", a.user.id)
      .eq("workspace_version", a.project.workspace_version)
      .maybeSingle();
    if (error || !job) throw new FilmError("Không tìm thấy lượt soạn AI.", 404);
    return NextResponse.json({ job });
  } catch (e) {
    return fail(e);
  }
}
