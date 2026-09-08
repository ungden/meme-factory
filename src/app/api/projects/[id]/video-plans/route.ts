import { NextRequest, NextResponse } from "next/server";
import { access, savePlan, fail } from "@/lib/short-film/server";
export async function GET(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(r, (await params).id);
    const { data, error } = await a.admin
      .from("video_plans")
      .select("*,video_plan_scenes(*)")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error) throw error;
    const { data: assist } = await a.admin
      .from("creative_assists")
      .select("id,status,created_at")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .eq("created_by", a.user.id)
      .eq("kind", "video_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      latestAssist: assist,
      plans: data?.map((p) => ({
        ...p,
        video_plan_scenes: p.video_plan_scenes
          .filter((s: { deleted_at: string | null }) => !s.deleted_at)
          .sort(
            (a: { scene_index: number }, b: { scene_index: number }) =>
              a.scene_index - b.scene_index,
          ),
      })),
      accountId: a.user.id,
      workspaceVersion: a.project.workspace_version,
      fixedVoiceEnabled: process.env.SHORT_FILM_FIXED_VOICE_ENABLED === "true",
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(r, (await params).id);
    return NextResponse.json(
      { plan: await savePlan(a, await r.json()) },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
