import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, latestChannelProfile } from "@/lib/short-film/server";
import { usesFatherTerminology } from "@/lib/channel-behaviour";
import { normalizeFamilyFatherTerms } from "@/lib/family-terminology";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const p = await params;
    const a = await access(request, p.id);
    const { data: job, error } = await a.admin
      .from("creative_assists")
      .select(
        "id,kind,status,result,error,created_at,completed_at,input_snapshot",
      )
      .eq("id", p.jobId)
      .eq("project_id", a.project.id)
      .eq("created_by", a.user.id)
      .eq("workspace_version", a.project.workspace_version)
      .maybeSingle();
    if (error || !job) throw new FilmError("Không tìm thấy lượt soạn AI.", 404);
    const { input_snapshot, ...safeJob } = job;
    const publicJob = { ...safeJob, intent: input_snapshot?.intent || "" };
    const profile = await latestChannelProfile(a);
    return NextResponse.json({
      job: usesFatherTerminology(profile) ? normalizeFamilyFatherTerms(publicJob) : publicJob,
    });
  } catch (e) {
    return fail(e);
  }
}
