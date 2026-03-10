import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id: orderId } = await params;

    // Use atomic_confirm_topup RPC
    const { data, error } = await supabaseAdmin.rpc("atomic_confirm_topup", {
      _order_id: orderId,
    });

    if (error) {
      return NextResponse.json({ error: "Xác nhận thất bại: " + error.message }, { status: 500 });
    }

    const result = data as { success?: boolean; error?: string; already_confirmed?: boolean };

    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (result?.already_confirmed) {
      return NextResponse.json({ message: "Đơn nạp tiền đã được xác nhận trước đó" });
    }

    // Add admin note to the transaction
    await supabaseAdmin
      .from("transactions")
      .update({ description: `Nạp tiền (xác nhận thủ công bởi ${admin.email})` })
      .eq("reference_id", `topup_${orderId}`);

    return NextResponse.json({ success: true, message: "Đã xác nhận đơn nạp tiền thành công" });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin confirm topup error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
