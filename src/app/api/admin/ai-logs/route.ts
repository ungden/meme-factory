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

    // AI logs are transactions with descriptions matching AI actions
    let query = supabaseAdmin
      .from("transactions")
      .select("*", { count: "exact" })
      .or("description.ilike.%ảnh nhân vật%,description.ilike.%ảnh meme%,description.ilike.%background%,description.ilike.%Hoàn points%")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Additional type filter
    if (type === "character") {
      query = supabaseAdmin
        .from("transactions")
        .select("*", { count: "exact" })
        .ilike("description", "%ảnh nhân vật%")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    } else if (type === "meme") {
      query = supabaseAdmin
        .from("transactions")
        .select("*", { count: "exact" })
        .ilike("description", "%ảnh meme%")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    } else if (type === "background") {
      query = supabaseAdmin
        .from("transactions")
        .select("*", { count: "exact" })
        .ilike("description", "%background%")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    }

    const { data: logs, count } = await query;

    // Look up emails
    const userIds = [...new Set((logs ?? []).map((l) => l.user_id))];
    const emails: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) emails[uid] = data.user.email;
      })
    );

    return NextResponse.json({
      logs: (logs ?? []).map((l) => {
        // Determine AI type from description
        let aiType = "other";
        const desc = (l.description ?? "").toLowerCase();
        if (desc.includes("nhân vật") || desc.includes("character")) aiType = "character";
        else if (desc.includes("meme")) aiType = "meme";
        else if (desc.includes("background")) aiType = "background";
        else if (desc.includes("hoàn points") || desc.includes("refund")) aiType = "refund";

        return {
          ...l,
          user_email: emails[l.user_id] ?? "N/A",
          ai_type: aiType,
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
