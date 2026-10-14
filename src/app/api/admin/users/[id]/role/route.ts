import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id: userId } = await params;
    const body = await req.json();
    const { role } = body as { role: string };

    if (!["user", "admin", "moderator"].includes(role)) {
      return NextResponse.json({ error: "Quyền không hợp lệ." }, { status: 400 });
    }

    // Upsert role
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ error: "Chưa đổi được quyền. Thử lại nhé." }, { status: 500 });
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin role update error:", error);
    return NextResponse.json({ error: "Có lỗi phía hệ thống. Thử lại sau nhé." }, { status: 500 });
  }
}
