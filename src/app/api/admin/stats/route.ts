import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const [
      usersRes,
      walletsRes,
      completedTopupsRes,
      projectsRes,
      memesRes,
      recentTxRes,
      recentWalletsRes,
      last7dTopupsRes,
      paymentTxRes,
    ] = await Promise.all([
      supabaseAdmin.from("wallets").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("wallets").select("balance, points"),
      supabaseAdmin.from("topup_orders").select("amount").eq("status", "completed"),
      supabaseAdmin.from("projects").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("memes").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("transactions").select("*").order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("wallets").select("user_id, balance, points, created_at").order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("topup_orders").select("amount, created_at").eq("status", "completed").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      supabaseAdmin.from("transactions").select("amount").eq("type", "payment").eq("status", "completed"),
    ]);

    const totalRevenue = (completedTopupsRes.data ?? []).reduce((s, o) => s + Number(o.amount), 0);
    const totalPointsSpent = (paymentTxRes.data ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const totalWalletBalance = (walletsRes.data ?? []).reduce((s, w) => s + Number(w.balance), 0);
    const totalWalletPoints = (walletsRes.data ?? []).reduce((s, w) => s + Number(w.points), 0);

    // Group daily revenue (last 7 days)
    const dailyRevenue: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      dailyRevenue[new Date(Date.now() - i * 86400000).toISOString().split("T")[0]] = 0;
    }
    for (const order of last7dTopupsRes.data ?? []) {
      const key = new Date(order.created_at).toISOString().split("T")[0];
      if (key in dailyRevenue) dailyRevenue[key] += Number(order.amount);
    }

    // Look up emails
    const allUserIds = new Set<string>();
    for (const t of recentTxRes.data ?? []) allUserIds.add(t.user_id);
    for (const w of recentWalletsRes.data ?? []) allUserIds.add(w.user_id);

    const userEmails: Record<string, string> = {};
    await Promise.all(
      [...allUserIds].map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) userEmails[uid] = data.user.email;
      })
    );

    return NextResponse.json({
      totalUsers: usersRes.count ?? 0,
      totalRevenue,
      totalPointsSpent,
      totalWalletBalance,
      totalWalletPoints,
      totalProjects: projectsRes.count ?? 0,
      totalMemes: memesRes.count ?? 0,
      dailyRevenue,
      recentTransactions: (recentTxRes.data ?? []).map((t) => ({
        ...t,
        user_email: userEmails[t.user_id] ?? "N/A",
      })),
      recentUsers: (recentWalletsRes.data ?? []).map((w) => ({
        ...w,
        email: userEmails[w.user_id] ?? "N/A",
      })),
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
