import { NextRequest, NextResponse } from "next/server";
import { access, savePlan, fail } from "@/lib/short-film/server";
import { fixedVoiceEnabled } from "@/lib/short-film/features";
import { normalizeFamilyFatherTerms } from "@/lib/family-terminology";
export async function GET(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(r, (await params).id);
    const offsetParam = Number(new URL(r.url).searchParams.get("offset") || 0);
    const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;
    const { data, error } = await a.admin
      .from("video_plans")
      .select(
        "*,video_plan_scenes(*),short_film_script_reviews(version,reviewed_at)",
      )
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .range(offset, offset + 23);
    if (error) throw error;
    const planIds = (data || []).map((p) => p.id);
    const [{ data: taskRows }, { data: runRows }] = await Promise.all([
      planIds.length
        ? a.admin
            .from("short_film_tasks")
            .select("plan_id,kind,status,result,error")
            .eq("project_id", a.project.id)
            .eq("workspace_version", a.project.workspace_version)
            .in("plan_id", planIds)
        : Promise.resolve({ data: [] as never[] }),
      planIds.length
        ? a.admin
            .from("short_film_production_runs")
            .select("plan_id,status")
            .eq("project_id", a.project.id)
            .eq("workspace_version", a.project.workspace_version)
            .in("plan_id", planIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const tasksByPlan = new Map<string, { kind: string; status: string; result: unknown; error: string | null }[]>();
    for (const task of taskRows || []) {
      if (!task.plan_id) continue;
      const current = tasksByPlan.get(task.plan_id) || [];
      current.push(task);
      tasksByPlan.set(task.plan_id, current);
    }
    const runsByPlan = new Map<string, string[]>();
    for (const run of runRows || []) {
      if (!run.plan_id) continue;
      const current = runsByPlan.get(run.plan_id) || [];
      current.push(run.status);
      runsByPlan.set(run.plan_id, current);
    }
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
    const { data: channel } = await a.admin
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = {
      channelProfile: channel?.profile || null,
      latestAssist: assist,
      plans: data?.map((p) => {
        const planTasks = tasksByPlan.get(p.id) || [];
        const planRuns = runsByPlan.get(p.id) || [];
        const hasVideo = Boolean(
          p.latest_content_output_id ||
            planTasks.some(
              (t) =>
                t.kind === "render" &&
                t.status === "completed" &&
                Boolean(
                  (t.result as { outputId?: string; path?: string } | null)
                    ?.outputId ||
                    (t.result as { path?: string } | null)?.path,
                ),
            ),
        );
        const failed = planTasks.some((t) => t.status === "failed") || planRuns.some((s) => s === "failed");
        const running =
          planTasks.some((t) => ["queued", "running", "reconciling"].includes(t.status)) ||
          planRuns.some((s) => ["queued", "scripting", "running", "paused"].includes(s));
        return {
        ...p,
        has_video: hasVideo,
        video_output_count: hasVideo ? 1 : 0,
        has_production_history: planTasks.length > 0 || planRuns.length > 0,
        video_status: hasVideo ? "ready" : failed ? "failed" : running ? "running" : "draft",
        script_review:
          p.short_film_script_reviews?.find(
            (r: { version: number }) => r.version === p.version,
          ) || null,
        video_plan_scenes: p.video_plan_scenes
          .filter((s: { deleted_at: string | null }) => !s.deleted_at)
          .sort(
            (a: { scene_index: number }, b: { scene_index: number }) =>
              a.scene_index - b.scene_index,
          ),
      };}),
      accountId: a.user.id,
      workspaceVersion: a.project.workspace_version,
      nextOffset: data && data.length === 24 ? offset + 24 : null,
      fixedVoiceEnabled: fixedVoiceEnabled(a.project.id),
    };
    return NextResponse.json(
      a.project.name === "Bánh Bao & Đậu Đỏ"
        ? normalizeFamilyFatherTerms(payload)
        : payload,
    );
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
