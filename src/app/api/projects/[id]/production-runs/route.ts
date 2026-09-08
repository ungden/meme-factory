import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, readPlan } from "@/lib/short-film/server";
import { fixedVoiceEnabled } from "@/lib/short-film/features";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(request, (await params).id);
    const { data, error } = await a.admin
      .from("short_film_production_runs")
      .select(
        "id,plan_id,plan_version,source,intent,status,phase,max_points_per_film,max_points_per_day,points_committed,error,snapshot,created_at,updated_at,completed_at",
      )
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ runs: data || [] });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(request, (await params).id);
    const body = await request.json();
    const maxFilm = Number(body.maxPointsPerFilm),
      maxDay = Number(body.maxPointsPerDay);
    if (
      !Number.isInteger(maxFilm) ||
      !Number.isInteger(maxDay) ||
      maxFilm <= 0 ||
      maxDay < maxFilm
    )
      throw new FilmError("Nhập trần điểm mỗi phim và mỗi ngày hợp lệ.");
    let plan = null;
    if (body.planId) plan = await readPlan(a, String(body.planId));
    if (!fixedVoiceEnabled(a.project.id))
      throw new FilmError(
        "Nhánh giọng cố định chưa qua canary nên chưa thể tạo phim một nút.",
        409,
      );
    if (!plan) {
      const [{ data: channel }, { data: approved }] = await Promise.all([
        a.admin
          .from("channel_profiles")
          .select("profile")
          .eq("project_id", a.project.id)
          .eq("workspace_version", a.project.workspace_version)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        a.admin
          .from("character_voice_versions")
          .select("character_id")
          .eq("project_id", a.project.id)
          .eq("workspace_version", a.project.workspace_version)
          .not("approved_at", "is", null),
      ]);
      const required = (channel?.profile?.roles || []).map(
        (r: { characterId: string }) => r.characterId,
      );
      const have = new Set((approved || []).map((v) => v.character_id));
      if (!required.length || required.some((id: string) => !have.has(id)))
        throw new FilmError(
          "Duyệt giọng của tất cả nhân vật trước khi để AI tự chọn kịch bản.",
          409,
        );
    }
    if (
      plan?.audio_mode === "fixed" &&
      plan.video_plan_scenes.some(
        (s) =>
          s.dialogue &&
          !s.cast_snapshot.find((c) => c.characterId === s.speaker_character_id)
            ?.voice,
      )
    )
      throw new FilmError(
        "Duyệt giọng của các nhân vật nói trong kịch bản trước.",
        409,
      );
    const key =
      typeof body.idempotencyKey === "string"
        ? body.idempotencyKey
        : crypto.randomUUID();
    const { data, error } = await a.admin.rpc("create_film_production_run", {
      p_project: a.project.id,
      p_actor: a.user.id,
      p_workspace: a.project.workspace_version,
      p_plan: plan?.id || null,
      p_plan_version: plan?.version || null,
      p_intent: String(body.intent || "").slice(0, 4000),
      p_max_film: maxFilm,
      p_max_day: maxDay,
      p_key: key,
      p_source: "manual",
      p_schedule_date: null,
    });
    if (error)
      throw new FilmError(
        error.message,
        error.message.includes("one_active") ? 409 : 400,
      );
    return NextResponse.json({ runId: data }, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}
