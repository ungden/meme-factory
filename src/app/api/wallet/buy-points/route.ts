import { NextResponse } from "next/server";
import { formatVND, POINT_PACKAGES, FREE_TRIAL_POINTS } from "@/lib/point-pricing";
import { supabaseAdmin } from "@/lib/admin";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";

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
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
    }

    const throttle = await checkRateLimit(supabaseAdmin, RATE_LIMITS.buyPoints, user.id);
    if (!throttle.allowed)
      return NextResponse.json(
        { error: rateLimitMessage(throttle) },
        { status: 429, headers: { "retry-after": String(Math.ceil(throttle.resetIn)) } },
      );

    const body = await req.json();
    const { packageId, idempotencyKey } = body;

    const pkg = POINT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: "Gói này không còn bán. Mở lại trang Ví để chọn gói khác nhé." }, { status: 400 });
    }
    if (body.expectedPrice !== pkg.price || body.expectedPoints !== pkg.points) {
      return NextResponse.json({ error: "Bảng giá vừa đổi. Tải lại trang Ví rồi chọn lại gói nhé.", code: "PRICE_CHANGED" }, { status: 409 });
    }
    if (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return NextResponse.json({ error: "Chưa mua được. Bạn chọn lại gói nhé." }, { status: 400 });
    }

    // Atomic: deduct balance + add points + record transaction — all in one DB call
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("buy_points_idempotent", {
      p_user: user.id,
      p_key: idempotencyKey,
      p_package: pkg.id,
      p_price: pkg.price,
      p_points: pkg.points,
      p_description: `Mua gói ${pkg.name} (${pkg.points} điểm)`,
    });

    if (rpcError) {
      throw new Error(`RPC error: ${rpcError.message}`);
    }

    if (!result?.success) {
      const errMsg = result?.error === "Insufficient balance"
        ? `Tiền trong ví chưa đủ: cần ${formatVND(pkg.price)}, đang có ${formatVND(Number(result?.balance ?? 0))}.`
        : "Chưa mua được điểm. Bạn thử lại nhé.";
      if (result?.error !== "Insufficient balance") console.error("Buy points refused:", result?.error);

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
      { error: "Chưa mua được điểm. Bạn thử lại sau ít phút nhé." },
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
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
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
        message: "Bạn đã nhận điểm dùng thử rồi.",
        points: result?.points ?? 0,
      });
    }

    return NextResponse.json({
      success: true,
      points: result.points,
      message: `Đã nhận ${FREE_TRIAL_POINTS} điểm miễn phí`,
    });
  } catch (error) {
    console.error("Claim free trial error:", error);
    return NextResponse.json(
      { error: "Chưa nhận được điểm dùng thử. Bạn thử lại sau ít phút nhé." },
      { status: 500 }
    );
  }
}
