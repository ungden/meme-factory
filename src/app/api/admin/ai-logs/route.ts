import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const type = url.searchParams.get("type"); // character, meme, background
    const limit = 30;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("project_transactions")
      .select("*", { count: "exact" })
      .not("ai_action", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq("ai_action", type);

    const { data: logs, count } = await query;

    const userIds = [...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean))] as string[];
    const projectIds = [...new Set((logs ?? []).map((l) => l.project_id))];

    const emails: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) emails[uid] = data.user.email;
      })
    );

    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, name")
      .in("id", projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
    const projectNames = Object.fromEntries((projects || []).map((p) => [p.id, p.name]));

    return NextResponse.json({
      logs: (logs ?? []).map((l) => {
        return {
          ...l,
          user_email: l.actor_user_id ? emails[l.actor_user_id] ?? "N/A" : "System",
          ai_type: l.ai_action || "other",
          project_name: projectNames[l.project_id] ?? "N/A",
        };
      }),
      total: count ?? 0,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin AI logs error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
