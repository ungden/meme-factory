import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { POINT_PACKAGES } from "@/lib/point-pricing";

export async function POST(req: Request) {
  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
    }

    const throttle = await checkRateLimit(supabaseAdmin, RATE_LIMITS.createTopup, user.id);
    if (!throttle.allowed)
      return NextResponse.json(
        { error: rateLimitMessage(throttle) },
        { status: 429, headers: { "retry-after": String(Math.ceil(throttle.resetIn)) } },
      );

    const body = await req.json();
    // Nạp từ hộp "Cần thêm điểm" là mua một gói: số tiền là giá gói, và khi
    // ngân hàng báo có thì database mua gói luôn (trigger trên topup_orders).
    const pkg = body?.packageId ? POINT_PACKAGES.find((item) => item.id === body.packageId) : null;
    if (body?.packageId && !pkg) {
      return NextResponse.json({ error: "Gói không còn bán. Mở lại trang Ví để chọn gói." }, { status: 400 });
    }
    const amount = pkg ? pkg.price : Number(body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 10000) {
      return NextResponse.json({ error: "Nạp tối thiểu 10.000đ." }, { status: 400 });
    }
    if (amount > 50000000) {
      return NextResponse.json({ error: "Mỗi lần nạp tối đa 50.000.000đ." }, { status: 400 });
    }

    // Limit pending orders per user (max 5)
    const { count: pendingCount } = await supabaseAdmin
      .from("topup_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");

    if ((pendingCount ?? 0) >= 5) {
      return NextResponse.json({
        error: "Bạn đang có 5 lần nạp chưa chuyển khoản. Chuyển xong một lần, hoặc chờ đơn cũ hết hạn rồi thử lại nhé.",
      }, { status: 429 });
    }

    // Payment info from env
    // IMPORTANT: bankAcc = số tài khoản thật trên ngân hàng (dùng cho QR)
    //            bankVA  = tài khoản ảo Sepay, có prefix "VA" (dùng cho webhook matching)
    const bankBin = process.env.SEPAY_BANK_BIN || "970418";
    const bankAcc = process.env.SEPAY_BANK_ACCOUNT || "";
    const bankVA = process.env.SEPAY_BANK_VA || "";
    const bankName = process.env.SEPAY_BANK_NAME || "BIDV";
    const accountName = process.env.SEPAY_ACCOUNT_NAME || "";

    // QR code phải dùng STK thật (bankAcc) — ngân hàng không nhận VA prefix
    const qrAccount = bankAcc || bankVA;
    // Webhook matching dùng VA (Sepay trả subAccount với VA prefix)
    const paymentId = bankVA || bankAcc;

    if (!qrAccount) {
      return NextResponse.json({ error: "Nạp tiền đang tạm dừng. Bạn thử lại sau nhé." }, { status: 500 });
    }

    // Create topup order
    const { data: newOrder, error: createErr } = await supabaseAdmin
      .from("topup_orders")
      .insert({
        user_id: user.id,
        amount,
        status: "pending",
        payment_id: paymentId,
        ...(pkg ? { buy_package_id: pkg.id, buy_points: pkg.points, buy_key: crypto.randomUUID() } : {}),
      })
      .select("id")
      .single();

    if (createErr || !newOrder) {
      throw new Error(createErr?.message || "Chưa tạo được lần nạp. Bạn thử lại nhé.");
    }

    const orderId: string = newOrder.id;
    const description = `TL${orderId.substring(0, 8).toUpperCase()}`;
    // VietQR — chuẩn NAPAS, tất cả app ngân hàng VN hỗ trợ
    // Dùng bankAcc (STK thật, không có VA prefix) cho QR
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankBin)}-${encodeURIComponent(qrAccount)}-compact.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

    return NextResponse.json({
      success: true,
      orderId,
      amount,
      points: pkg?.points ?? null,
      description,
      qrUrl,
      beneficiary: qrAccount,
      bankBin,
      bankName,
      accountName,
    });
  } catch (error) {
    console.error("Create topup error:", error);
    return NextResponse.json(
      { error: "Chưa tạo được mã chuyển khoản. Bạn thử lại sau ít phút nhé." },
      { status: 500 }
    );
  }
}
