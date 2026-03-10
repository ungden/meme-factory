import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id: orderId } = await params;

    // Update order status
    const { data: order, error } = await supabaseAdmin
      .from("topup_orders")
      .update({ status: "rejected" })
      .eq("id", orderId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Từ chối thất bại: " + error.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ error: "Đơn nạp tiền không tồn tại hoặc đã được xử lý" }, { status: 400 });
    }

    // Record rejection in transactions for audit
    await supabaseAdmin.from("transactions").insert({
      user_id: order.user_id,
      amount: 0,
      type: "topup",
      status: "failed",
      description: `Đơn nạp ${Number(order.amount).toLocaleString("vi-VN")}đ bị từ chối bởi ${admin.email}`,
      reference_id: `topup_reject_${orderId}`,
    });

    return NextResponse.json({ success: true, message: "Đã từ chối đơn nạp tiền" });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin reject topup error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
