import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id: userId } = await params;
    const body = await req.json();
    const { amount, reason } = body as { amount: number; reason: string };

    if (!amount || amount === 0) {
      return NextResponse.json({ error: "Số points phải khác 0" }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: "Vui lòng nhập lý do" }, { status: 400 });
    }

    // Get current wallet
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("points")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) {
      return NextResponse.json({ error: "Không tìm thấy ví của người dùng" }, { status: 404 });
    }

    const newPoints = Number(wallet.points) + amount;
    if (newPoints < 0) {
      return NextResponse.json({ error: `Không thể trừ ${Math.abs(amount)} points. Số dư hiện tại: ${wallet.points} points` }, { status: 400 });
    }

    // Update wallet
    const { error: updateError } = await supabaseAdmin
      .from("wallets")
      .update({ points: newPoints })
      .eq("user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: "Cập nhật ví thất bại" }, { status: 500 });
    }

    // Record transaction
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      amount: amount,
      type: amount > 0 ? "topup" : "payment",
      status: "completed",
      description: `[Admin] ${reason} (bởi ${admin.email})`,
    });

    return NextResponse.json({
      success: true,
      newPoints,
      message: `Đã ${amount > 0 ? "cộng" : "trừ"} ${Math.abs(amount)} points`,
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin adjust points error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
