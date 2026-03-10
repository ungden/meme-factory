import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance, points")
      .eq("user_id", user.id)
      .maybeSingle();

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
