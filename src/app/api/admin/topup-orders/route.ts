import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // pending, completed, rejected
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 30;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("topup_orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);

    const { data: orders, count } = await query;

    // Look up emails
    const userIds = [...new Set((orders ?? []).map((o) => o.user_id))];
    const emails: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) emails[uid] = data.user.email;
      })
    );

    return NextResponse.json({
      orders: (orders ?? []).map((o) => ({
        ...o,
        user_email: emails[o.user_id] ?? "N/A",
      })),
      total: count ?? 0,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin topup orders error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
