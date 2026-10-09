import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { reportError } from "@/lib/observability";
import {
  buildNotifications,
  MEME_FAILURE_WINDOW_MS,
  type NotificationProject,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Lượt sản xuất ở những trạng thái chỉ người dùng mới gỡ được. */
const WAITING = ["needs_review", "budget_blocked", "paused"];

/**
 * GET /api/notifications — những việc đang chờ người dùng và meme AI tự làm,
 * trên mọi dự án.
 *
 * Đọc thẳng từ lượt sản xuất và tác vụ thay vì một bảng thông báo riêng: trạng
 * thái đã nằm ở đó, và một bảng nữa là một nguồn sự thật nữa có thể lệch.
 */
export async function GET(request: NextRequest) {
  const { user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const [owned, member] = await Promise.all([
      admin.from("projects").select("id, slug, name, workspace_version").eq("user_id", user.id),
      admin.from("project_members").select("project_id").eq("user_id", user.id),
    ]);

    const projects: Record<string, NotificationProject> = {};
    const remember = (project: Record<string, unknown>) => {
      projects[String(project.id)] = {
        slug: (project.slug as string | null) ?? null,
        name: String(project.name),
        workspace_version: (project.workspace_version as number | null) ?? null,
      };
    };
    for (const project of owned.data || []) remember(project);

    const sharedIds = (member.data || [])
      .map((row) => String(row.project_id))
      .filter((id) => !projects[id]);
    if (sharedIds.length) {
      const { data: shared } = await admin
        .from("projects")
        .select("id, slug, name, workspace_version")
        .in("id", sharedIds);
      for (const project of shared || []) remember(project);
    }

    const projectIds = Object.keys(projects);
    if (!projectIds.length) return NextResponse.json({ items: [] });

    const memeSince = new Date(Date.now() - MEME_FAILURE_WINDOW_MS).toISOString();
    const [runs, films, memes] = await Promise.all([
      admin
        .from("short_film_production_runs")
        .select("id, project_id, workspace_version, plan_id, status, phase, error, updated_at")
        .in("project_id", projectIds)
        .in("status", WAITING)
        .order("updated_at", { ascending: false })
        .limit(30),
      admin
        .from("short_film_tasks")
        .select("id, project_id, workspace_version, plan_id, created_at")
        .in("project_id", projectIds)
        .eq("kind", "render")
        .eq("status", "completed")
        .is("approved_at", null)
        .order("created_at", { ascending: false })
        .limit(30),
      // Lấy cả meme đã xong (không riêng meme theo lịch): một lần làm được sau
      // lần hỏng là dấu hiệu lỗi cũ đã hết, không cần báo nữa.
      admin
        .from("meme_production_runs")
        .select("id, project_id, workspace_version, status, source, error, created_at, completed_at, memes(image_url, generated_content)")
        .in("project_id", projectIds)
        .in("status", ["failed", "completed"])
        .gte("created_at", memeSince)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    return NextResponse.json({
      items: buildNotifications({
        projects,
        runs: (runs.data || []) as never,
        films: (films.data || []) as never,
        memes: (memes.data || []) as never,
      }),
    });
  } catch (error) {
    await reportError(error, { scope: "notifications", tags: { userId: user.id } });
    return NextResponse.json({ error: "Không tải được thông báo." }, { status: 500 });
  }
}
