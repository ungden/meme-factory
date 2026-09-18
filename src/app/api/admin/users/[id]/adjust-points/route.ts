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

    // Một RPC làm cả ba việc trong một giao dịch: khoá ví, đổi số dư, ghi sổ.
    // Đọc rồi ghi từ đây khiến hai admin bấm cùng lúc mất một lần chỉnh.
    const { data: result, error } = await supabaseAdmin.rpc("admin_adjust_points", {
      _user_id: userId,
      _amount: Math.trunc(amount),
      _reason: reason,
      _admin_email: admin.email ?? null,
    });
    if (error) {
      return NextResponse.json({ error: "Cập nhật ví thất bại" }, { status: 500 });
    }
    if (!result?.success) {
      const messages: Record<string, string> = {
        WALLET_NOT_FOUND: "Không tìm thấy ví của người dùng",
        INSUFFICIENT_POINTS: `Không thể trừ ${Math.abs(amount)} points. Số dư hiện tại: ${result?.points ?? 0} points`,
        AMOUNT_REQUIRED: "Số points phải khác 0",
        REASON_REQUIRED: "Vui lòng nhập lý do",
      };
      const code = String(result?.error || "");
      return NextResponse.json(
        { error: messages[code] || "Cập nhật ví thất bại" },
        { status: code === "WALLET_NOT_FOUND" ? 404 : 400 },
      );
    }
    const newPoints = Number(result.points);

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
