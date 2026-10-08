import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import {
  defaultFilmAudioMode,
  fixedVoiceEnabled,
  nativeSpeechAllowed,
} from "@/lib/short-film/features";
import { seedanceReferenceModel } from "@/lib/video-models";

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
    const { data: existing } = await a.admin
      .from("short_film_automation_settings")
      .select("queued_plan_ids,films_per_day")
      .eq("project_id", a.project.id)
      .maybeSingle();
    // Studio chỉ bật/tắt và chỉnh nhịp; không gửi hàng đợi thì giữ hàng đợi đã
    // xếp ở trình chỉnh nâng cao thay vì xoá trắng.
    const ids = Array.isArray(body.queuedPlanIds)
      ? body.queuedPlanIds
          .filter((x: unknown): x is string => typeof x === "string")
          .slice(0, 24)
      : (existing?.queued_plan_ids as string[] | undefined) || [];
    const filmsPerDay = Number(body.filmsPerDay ?? existing?.films_per_day ?? 1);
    if (!Number.isInteger(filmsPerDay) || filmsPerDay < 1 || filmsPerDay > 6)
      throw new FilmError("Mỗi ngày làm từ 1 đến 6 phim.");
    let queuedPlans: Array<{ id: string; audio_mode: string; video_model: string }> = [];
    if (ids.length) {
      const { data, count } = await a.admin
        .from("video_plans")
        .select("id,audio_mode,video_model", { count: "exact" })
        .eq("project_id", a.project.id)
        .eq("workspace_version", a.project.workspace_version)
        .in("id", ids);
      if (count !== ids.length)
        throw new FilmError("Hàng đợi có kịch bản không thuộc dự án.");
      queuedPlans = data || [];
      if (
        queuedPlans.some(
          (plan) => plan.audio_mode === "native" && !nativeSpeechAllowed(a.project.id, plan.video_model),
        )
      )
        throw new FilmError(
          "Lưu các kịch bản trong hàng đợi sang lồng tiếng trước khi bật lịch.",
          409,
        );
    }
    if (body.enabled) {
      if (
        queuedPlans.some((plan) => plan.audio_mode === "fixed") &&
        !fixedVoiceEnabled(a.project.id)
      )
        throw new FilmError(
          "Hàng đợi có phim lồng tiếng chưa qua canary. Chọn lồng tiếng theo từng lượt trước.",
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
        films_per_day: filmsPerDay,
        max_points_per_film: maxFilm,
        max_points_per_day: maxDay,
        queued_plan_ids: ids,
        // Khung phim lấy từ hồ sơ kênh (mặc định 9:16); các khoá này chỉ còn để
        // hiển thị lịch, không quyết định khung của lượt chạy.
        default_config: {
          duration: 60,
          format: "9:16",
          resolution: "720p",
          audioMode: defaultFilmAudioMode(a.project.id, body.videoModel),
          subtitles: true,
          videoModel: seedanceReferenceModel(body.videoModel),
        },
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
