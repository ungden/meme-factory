import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "user"; // user | project
    const type = url.searchParams.get("type"); // topup, payment, refund
    const status = url.searchParams.get("status"); // completed, pending, failed
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 30;
    const offset = (page - 1) * limit;

    if (scope === "project") {
      let projectQuery = supabaseAdmin
        .from("project_transactions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (type) projectQuery = projectQuery.eq("type", type);
      if (status) projectQuery = projectQuery.eq("status", status);

      const { data: projectTransactions, count: projectCount } = await projectQuery;

      const actorIds = [...new Set((projectTransactions ?? []).map((t) => t.actor_user_id).filter(Boolean))] as string[];
      const projectIds = [...new Set((projectTransactions ?? []).map((t) => t.project_id))];

      const actorEmails: Record<string, string> = {};
      await Promise.all(
        actorIds.map(async (uid) => {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
          if (data?.user?.email) actorEmails[uid] = data.user.email;
        })
      );

      const { data: projects } = await supabaseAdmin
        .from("projects")
        .select("id, name")
        .in("id", projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
      const projectNames = Object.fromEntries((projects || []).map((p) => [p.id, p.name]));

      const usageByMember: Record<string, { email: string; total_points: number; tx_count: number }> = {};
      for (const tx of projectTransactions || []) {
        if (tx.type !== "payment") continue;
        const key = tx.actor_user_id || "unknown";
        if (!usageByMember[key]) {
          usageByMember[key] = {
            email: tx.actor_user_id ? actorEmails[tx.actor_user_id] || "N/A" : "System",
            total_points: 0,
            tx_count: 0,
          };
        }
        usageByMember[key].total_points += Number(tx.amount || 0);
        usageByMember[key].tx_count += 1;
      }

      return NextResponse.json({
        scope: "project",
        transactions: (projectTransactions ?? []).map((t) => ({
          ...t,
          user_email: t.actor_user_id ? actorEmails[t.actor_user_id] ?? "N/A" : "System",
          project_name: projectNames[t.project_id] ?? "N/A",
        })),
        usageSummary: Object.values(usageByMember).sort((a, b) => b.total_points - a.total_points),
        total: projectCount ?? 0,
        page,
        totalPages: Math.ceil((projectCount ?? 0) / limit),
      });
    }

    let query = supabaseAdmin
      .from("transactions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);

    const { data: transactions, count } = await query;

    // Look up emails
    const userIds = [...new Set((transactions ?? []).map((t) => t.user_id))];
    const emails: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) emails[uid] = data.user.email;
      })
    );

    return NextResponse.json({
      transactions: (transactions ?? []).map((t) => ({
        ...t,
        user_email: emails[t.user_id] ?? "N/A",
      })),
      total: count ?? 0,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin transactions error:", error);
    return NextResponse.json({ error: "Có lỗi phía hệ thống. Thử lại sau nhé." }, { status: 500 });
  }
}
