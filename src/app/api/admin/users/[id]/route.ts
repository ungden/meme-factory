import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id: userId } = await params;

    const [authRes, roleRes, walletRes, txRes, projectsRes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("projects").select("id, name, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);

    if (!authRes.data?.user) {
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: userId,
        email: authRes.data.user.email,
        created_at: authRes.data.user.created_at,
        last_sign_in_at: authRes.data.user.last_sign_in_at,
      },
      role: roleRes?.data?.role ?? "user",
      wallet: walletRes?.data ?? { balance: 0, points: 0, free_trial_claimed: false },
      transactions: txRes.data ?? [],
      projects: projectsRes.data ?? [],
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin user detail error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
