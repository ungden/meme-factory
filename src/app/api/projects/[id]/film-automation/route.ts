import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import {
  defaultFilmAudioMode,
  fixedVoiceEnabled,
  nativeSpeechAllowed,
} from "@/lib/short-film/features";
import { seedanceReferenceModel } from "@/lib/video-models";
import { parseQueuedPlanIds, queryableIds, resolveQueue, type QueuePlanRow } from "./queue";

type Access = Awaited<ReturnType<typeof access>>;

/** Đọc các kịch bản trong hàng chờ, giới hạn trong kênh và workspace hiện tại. */
async function queueRows(a: Access, ids: string[]): Promise<QueuePlanRow[]> {
  const lookup = queryableIds(ids);
  if (!lookup.length) return [];
  const { data, error } = await a.admin
    .from("video_plans")
    .select("id,title,status,archived_at,audio_mode,video_model")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .in("id", lookup);
  if (error) throw error;
  return data || [];
}

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
    const saved = (data?.queued_plan_ids as string[] | undefined) || [];
    const queue = resolveQueue(saved, await queueRows(a, saved), { strict: false });
    return NextResponse.json({
      automation: data || null,
      // Chỉ những tập lịch còn làm được, theo đúng thứ tự, kèm tên để Studio
      // hiện được cả tập cũ không nằm trong danh sách tập vừa tải.
      queue: queue.ok ? queue.plans.map((plan) => ({ id: plan.id, title: plan.title || "" })) : [],
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
      throw new FilmError("Chỉ chủ kênh mới bật được Tự làm mỗi ngày.", 403);
    const body = await request.json();
    const maxFilm = Number(body.maxPointsPerFilm),
      maxDay = Number(body.maxPointsPerDay);
    if (
      !Number.isInteger(maxFilm) ||
      !Number.isInteger(maxDay) ||
      maxFilm <= 0 ||
      maxDay < maxFilm
    )
      throw new FilmError("Nhập mức chi mỗi phim và mỗi ngày bằng số dương nhé.");
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.localTime))
      ? `${body.localTime}:00`
      : "09:00:00";
    const { data: existing } = await a.admin
      .from("short_film_automation_settings")
      .select("queued_plan_ids,films_per_day")
      .eq("project_id", a.project.id)
      .maybeSingle();
    const sent = parseQueuedPlanIds(body.queuedPlanIds);
    const ids = sent ?? ((existing?.queued_plan_ids as string[] | undefined) || []);
    const filmsPerDay = Number(body.filmsPerDay ?? existing?.films_per_day ?? 1);
    if (!Number.isInteger(filmsPerDay) || filmsPerDay < 1 || filmsPerDay > 6)
      throw new FilmError("Mỗi ngày làm từ 1 đến 6 phim.");
    const resolved = resolveQueue(ids, await queueRows(a, ids), { strict: sent !== null });
    if (!resolved.ok)
      throw new FilmError("Hàng chờ có tập không thuộc kênh này. Tải lại trang nhé.");
    const queuedPlans = resolved.plans;
    if (
      queuedPlans.some(
        (plan) => plan.audio_mode === "native" && !nativeSpeechAllowed(a.project.id, plan.video_model),
      )
    )
      throw new FilmError("Đổi các tập trong hàng chờ sang lồng tiếng trước khi bật lịch nhé.", 409);
    if (body.enabled) {
      if (
        queuedPlans.some((plan) => plan.audio_mode === "fixed") &&
        !fixedVoiceEnabled(a.project.id)
      )
        throw new FilmError(
          "Hàng chờ có tập dùng kiểu một giọng đọc, kiểu này chưa mở. Đổi sang lồng tiếng theo từng nhân vật nhé.",
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
        queued_plan_ids: queuedPlans.map((plan) => plan.id),
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
