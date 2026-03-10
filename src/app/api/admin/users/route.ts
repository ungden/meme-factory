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

    // Get all wallets with pagination
    let query = supabaseAdmin
      .from("wallets")
      .select("user_id, balance, points, free_trial_claimed, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: wallets, count } = await query;

    if (!wallets) {
      return NextResponse.json({ users: [], total: 0, page, totalPages: 0 });
    }

    // Get user details + roles
    const users = await Promise.all(
      wallets.map(async (wallet) => {
        const [authRes, roleRes, projectsRes, memesRes] = await Promise.all([
          supabaseAdmin.auth.admin.getUserById(wallet.user_id),
          supabaseAdmin.from("user_roles").select("role").eq("user_id", wallet.user_id).maybeSingle(),
          supabaseAdmin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", wallet.user_id),
          supabaseAdmin.from("memes").select("id, project_id").eq("status", "completed"),
        ]);

        // Count memes belonging to user's projects
        const userProjectIds = new Set<string>();
        if (projectsRes.count) {
          const { data: pData } = await supabaseAdmin.from("projects").select("id").eq("user_id", wallet.user_id);
          pData?.forEach((p) => userProjectIds.add(p.id));
        }
        const userMemeCount = (memesRes.data ?? []).filter((m) => userProjectIds.has(m.project_id)).length;

        const email = authRes.data?.user?.email ?? "N/A";

        // Filter by search
        if (search && !email.toLowerCase().includes(search.toLowerCase())) {
          return null;
        }

        return {
          user_id: wallet.user_id,
          email,
          role: roleRes?.data?.role ?? "user",
          balance: Number(wallet.balance),
          points: Number(wallet.points),
          free_trial_claimed: wallet.free_trial_claimed,
          projects_count: projectsRes.count ?? 0,
          memes_count: userMemeCount,
          created_at: wallet.created_at,
        };
      })
    );

    const filtered = users.filter(Boolean);
    const totalPages = Math.ceil((search ? filtered.length : (count ?? 0)) / limit);

    return NextResponse.json({
      users: search ? filtered.slice(0, limit) : filtered,
      total: search ? filtered.length : (count ?? 0),
      page,
      totalPages,
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
