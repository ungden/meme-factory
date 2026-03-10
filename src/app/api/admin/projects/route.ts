import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const search = url.searchParams.get("search") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("projects")
      .select("*, characters:characters(id), memes:memes(id)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data: projects, count } = await query;

    // Look up emails
    const userIds = [...new Set((projects ?? []).map((p) => p.user_id))];
    const emails: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) emails[uid] = data.user.email;
      })
    );

    return NextResponse.json({
      projects: (projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        user_id: p.user_id,
        user_email: emails[p.user_id] ?? "N/A",
        characters_count: p.characters?.length ?? 0,
        memes_count: p.memes?.length ?? 0,
        created_at: p.created_at,
      })),
      total: count ?? 0,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin projects error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
