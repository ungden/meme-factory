import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { normalizeMemeOptions } from "@/lib/meme-autopilot";

export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    const { data } = await a.admin
      .from("meme_automation_settings")
      .select("enabled,local_time,memes_per_day,options")
      .eq("project_id", a.project.id)
      .maybeSingle();
    return NextResponse.json({ automation: data || null, owner: a.project.user_id === a.user.id });
  } catch (error) {
    return fail(error);
  }
}

/** Chỉ chủ kênh bật được: lịch tự trừ điểm của ví dự án mỗi ngày. */
export async function PUT(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    if (a.project.user_id !== a.user.id) throw new FilmError("Chỉ chủ kênh được bật tự làm meme.", 403);
    const body = await r.json().catch(() => ({}));
    const perDay = Number(body.memesPerDay ?? 1);
    if (!Number.isInteger(perDay) || perDay < 1 || perDay > 10) throw new FilmError("Mỗi ngày làm từ 1 đến 10 meme.");
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.localTime)) ? `${body.localTime}:00` : "09:00:00";
    const { data, error } = await a.admin
      .from("meme_automation_settings")
      .upsert({
        project_id: a.project.id,
        workspace_version: a.project.workspace_version,
        enabled: body.enabled === true,
        local_time: time,
        timezone: "Asia/Ho_Chi_Minh",
        memes_per_day: perDay,
        options: normalizeMemeOptions(body.options),
        created_by: a.user.id,
        updated_at: new Date().toISOString(),
      })
      .select("enabled,local_time,memes_per_day,options")
      .single();
    if (error) throw error;
    return NextResponse.json({ automation: data });
  } catch (error) {
    return fail(error);
  }
}
