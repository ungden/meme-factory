import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      return NextResponse.json({ error: "Phiên đăng nhập hết hạn" }, { status: 401 });
    }

    const body = await req.json();
    const amount = Number(body?.amount);
    if (!amount || isNaN(amount) || amount < 10000) {
      return NextResponse.json({ error: "Số tiền tối thiểu 10.000đ" }, { status: 400 });
    }
    if (amount > 50000000) {
      return NextResponse.json({ error: "Số tiền tối đa 50.000.000đ" }, { status: 400 });
    }

    // Limit pending orders per user (max 5)
    const { count: pendingCount } = await supabaseAdmin
      .from("topup_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");

    if ((pendingCount ?? 0) >= 5) {
      return NextResponse.json({
        error: "Bạn đang có quá nhiều đơn nạp chờ xử lý. Vui lòng hoàn tất hoặc đợi đơn cũ hết hạn.",
      }, { status: 429 });
    }

    // Payment info from env
    const bankBin = process.env.SEPAY_BANK_BIN || "970418";
    const bankAcc = process.env.SEPAY_BANK_ACCOUNT || "";
    const bankVA = process.env.SEPAY_BANK_VA || "";
    const bankName = process.env.SEPAY_BANK_NAME || "BIDV";
    const accountName = process.env.SEPAY_ACCOUNT_NAME || "";
    const beneficiary = bankVA || bankAcc;

    if (!beneficiary) {
      return NextResponse.json({ error: "Chưa cấu hình tài khoản ngân hàng" }, { status: 500 });
    }

    // Create topup order
    const { data: newOrder, error: createErr } = await supabaseAdmin
      .from("topup_orders")
      .insert({
        user_id: user.id,
        amount,
        status: "pending",
        payment_id: beneficiary,
      })
      .select("id")
      .single();

    if (createErr || !newOrder) {
      throw new Error(createErr?.message || "Không thể tạo đơn nạp tiền");
    }

    const orderId: string = newOrder.id;
    const description = `TL${orderId.substring(0, 8).toUpperCase()}`;
    const qrUrl = `https://qr.sepay.vn/img?acc=${encodeURIComponent(beneficiary)}&bank=${encodeURIComponent(bankBin)}&amount=${encodeURIComponent(amount)}&des=${encodeURIComponent(description)}`;

    return NextResponse.json({
      success: true,
      orderId,
      amount,
      description,
      qrUrl,
      beneficiary,
      bankBin,
      bankName,
      accountName,
    });
  } catch (error) {
    console.error("Create topup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi server" },
      { status: 500 }
    );
  }
}
