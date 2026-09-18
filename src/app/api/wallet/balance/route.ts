import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin";
import { FREE_TRIAL_POINTS } from "@/lib/point-pricing";
import { reportError } from "@/lib/observability";

export async function GET(req: Request) {
  try {
    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Phiên đăng nhập hết hạn" }, { status: 401 });
    }

    // Get wallet (maybeSingle to handle missing wallet gracefully)
    let { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance, points, free_trial_claimed")
      .eq("user_id", user.id)
      .maybeSingle();

    // Tặng điểm dùng thử cho ai chưa nhận. Luồng đăng ký mới đã tặng ngay khi
    // xác nhận email; đây là lưới vét cho những tài khoản tạo trước đó — và cho
    // trường hợp callback xác nhận bị lỗi. RPC tự chặn lần thứ hai.
    if (!wallet?.free_trial_claimed && user.email_confirmed_at) {
      try {
        const { error } = await supabaseAdmin.rpc("claim_free_trial", {
          _user_id: user.id,
          _free_points: FREE_TRIAL_POINTS,
        });
        if (error) throw new Error(error.message);
        const { data: refreshed } = await supabaseAdmin
          .from("wallets")
          .select("balance, points, free_trial_claimed")
          .eq("user_id", user.id)
          .maybeSingle();
        wallet = refreshed ?? wallet;
      } catch (error) {
        await reportError(error, { scope: "wallet.free-trial", tags: { userId: user.id } });
      }
    }

    // Get recent transactions
    const { data: transactions } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get pending topup orders
    const { data: pendingOrders } = await supabaseAdmin
      .from("topup_orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      balance: wallet?.balance ?? 0,
      points: wallet?.points ?? 0,
      transactions: transactions ?? [],
      pendingOrders: pendingOrders ?? [],
    });
  } catch (error) {
    console.error("Wallet balance error:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
