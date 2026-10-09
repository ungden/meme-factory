import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { autopilotLines, homeFeed, type FeedFilmRun, type FeedMemeRun } from "@/lib/home-feed";

/**
 * Việc AI đang làm và vừa làm xong ở mọi kênh của người dùng. Danh sách dự án
 * lấy qua RLS của chính người dùng; bảng lượt chạy chỉ đọc được bằng service
 * role nên lọc theo đúng các dự án đó.
 */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id,slug,name,workspace_version")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (projects || []).map((project) => project.id);
  if (!ids.length) return NextResponse.json({ items: [], autopilot: {} });
  const admin = getSupabaseAdmin();
  const [films, memes, filmAuto, memeAuto] = await Promise.all([
    admin
      .from("short_film_production_runs")
      .select("id,project_id,workspace_version,plan_id,intent,status,source,updated_at,video_plans(title)")
      .in("project_id", ids)
      .order("updated_at", { ascending: false })
      .limit(30),
    admin
      .from("meme_production_runs")
      .select("id,project_id,workspace_version,intent,status,source,created_at,completed_at,memes(image_url,generated_content)")
      .in("project_id", ids)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("short_film_automation_settings")
      .select("project_id,workspace_version,enabled,local_time,films_per_day")
      .in("project_id", ids),
    admin
      .from("meme_automation_settings")
      .select("project_id,workspace_version,enabled,local_time,memes_per_day")
      .in("project_id", ids),
  ]);
  const failed = [films, memes, filmAuto, memeAuto].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json({
    items: homeFeed(projects!, (films.data || []) as unknown as FeedFilmRun[], (memes.data || []) as unknown as FeedMemeRun[]),
    autopilot: autopilotLines(projects!, filmAuto.data || [], memeAuto.data || []),
  });
}
