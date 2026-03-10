import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POINT_PACKAGES, FREE_TRIAL_POINTS } from "@/lib/point-pricing";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Buy a point package (atomic via RPC)
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Phiên đăng nhập hết hạn" }, { status: 401 });
    }

    const body = await req.json();
    const { packageId } = body;

    const pkg = POINT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: "Gói không hợp lệ" }, { status: 400 });
    }

    // Atomic: deduct balance + add points + record transaction — all in one DB call
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("atomic_buy_points", {
      _user_id: user.id,
      _price: pkg.price,
      _points_to_add: pkg.points,
      _description: `Mua gói ${pkg.name} (${pkg.points} points)`,
    });

    if (rpcError) {
      throw new Error(`RPC error: ${rpcError.message}`);
    }

    if (!result?.success) {
      const errMsg = result?.error === "Insufficient balance"
        ? `Số dư không đủ. Cần ${pkg.price.toLocaleString("vi-VN")}đ, hiện có ${Number(result?.balance ?? 0).toLocaleString("vi-VN")}đ`
        : result?.error || "Không thể mua points";

      return NextResponse.json({
        error: errMsg,
        needTopup: result?.error === "Insufficient balance",
        required: pkg.price,
        current: result?.balance ?? 0,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      balance: result.balance,
      points: result.points,
      purchased: pkg.points,
      packageName: pkg.name,
    });
  } catch (error) {
    console.error("Buy points error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi server" },
      { status: 500 }
    );
  }
}

// GET: Claim free trial points (atomic via RPC)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Phiên đăng nhập hết hạn" }, { status: 401 });
    }

    // Atomic: check free_trial_claimed flag + grant points — all in one DB call
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("claim_free_trial", {
      _user_id: user.id,
      _free_points: FREE_TRIAL_POINTS,
    });

    if (rpcError) {
      throw new Error(`RPC error: ${rpcError.message}`);
    }

    if (!result?.success) {
      return NextResponse.json({
        success: false,
        message: "Đã nhận free trial rồi",
        points: result?.points ?? 0,
      });
    }

    return NextResponse.json({
      success: true,
      points: result.points,
      message: `Đã nhận ${FREE_TRIAL_POINTS} points miễn phí!`,
    });
  } catch (error) {
    console.error("Claim free trial error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi server" },
      { status: 500 }
    );
  }
}
