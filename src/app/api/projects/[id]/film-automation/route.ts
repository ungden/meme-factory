import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { fixedVoiceEnabled } from "@/lib/short-film/features";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(request, (await params).id);
    const { data } = await a.admin
      .from("short_film_automation_settings")
      .select("*")
      .eq("project_id", a.project.id)
      .maybeSingle();
    return NextResponse.json({
      automation: data || null,
      owner: a.project.user_id === a.user.id,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(request, (await params).id);
    if (a.project.user_id !== a.user.id)
      throw new FilmError("Chỉ chủ dự án được bật tự sản xuất.", 403);
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
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.localTime))
      ? `${body.localTime}:00`
      : "09:00:00";
    const ids = Array.isArray(body.queuedPlanIds)
      ? body.queuedPlanIds
          .filter((x: unknown): x is string => typeof x === "string")
          .slice(0, 24)
      : [];
    let queuedPlans: Array<{ id: string; audio_mode: string }> = [];
    if (ids.length) {
      const { data, count } = await a.admin
        .from("video_plans")
        .select("id,audio_mode", { count: "exact" })
        .eq("project_id", a.project.id)
        .eq("workspace_version", a.project.workspace_version)
        .in("id", ids);
      if (count !== ids.length)
        throw new FilmError("Hàng đợi có kịch bản không thuộc dự án.");
      queuedPlans = data || [];
    }
    if (body.enabled) {
      if (
        queuedPlans.some((plan) => plan.audio_mode === "fixed") &&
        !fixedVoiceEnabled(a.project.id)
      )
        throw new FilmError(
          "Hàng đợi có phim lồng tiếng chưa qua canary. Chuyển phim đó sang audio native Seedance trước.",
          409,
        );
    }
    const { data, error } = await a.admin
      .from("short_film_automation_settings")
      .upsert({
        project_id: a.project.id,
        workspace_version: a.project.workspace_version,
        enabled: body.enabled === true,
        local_time: time,
        timezone: "Asia/Ho_Chi_Minh",
        films_per_day: 1,
        max_points_per_film: maxFilm,
        max_points_per_day: maxDay,
        queued_plan_ids: ids,
        created_by: a.user.id,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ automation: data });
  } catch (error) {
    return fail(error);
  }
}
