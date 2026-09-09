import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin";
import { parseSepayPayment, validSepayKey } from "@/lib/sepay-payment";

export async function POST(req: Request) {
  const key = process.env.SEPAY_WEBHOOK_API_KEY;
  if (!key) return NextResponse.json({ success: false, error: "Webhook chưa cấu hình" }, { status: 503 });
  if (!validSepayKey(req.headers.get("authorization"), key))
    return NextResponse.json({ success: false, error: "API Key không hợp lệ" }, { status: 401 });
  let payload: unknown;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "JSON không hợp lệ" }, { status: 400 }); }
  const accounts = [process.env.SEPAY_BANK_ACCOUNT, process.env.SEPAY_BANK_VA].filter((v): v is string => !!v);
  if (!accounts.length) return NextResponse.json({ success: false, error: "Chưa cấu hình ngân hàng" }, { status: 503 });
  const payment = parseSepayPayment(payload, accounts);
  if (!payment) return NextResponse.json({ success: true, matched: false, message: "Giao dịch cần đối soát thủ công" });
  try {
    const { data, error } = await supabaseAdmin.rpc("confirm_sepay_topup", {
      p_event_id: payment.eventId, p_order_prefix: payment.orderPrefix,
      p_amount: payment.amount, p_accounts: payment.accounts,
    });
    if (error) throw error;
    if (!data?.success) {
      console.warn("SePay payment requires review", { eventId: payment.eventId, reason: data?.error });
      return NextResponse.json({ success: true, matched: false, message: "Giao dịch cần đối soát thủ công" });
    }
    return NextResponse.json({ success: true, matched: true, order_id: data.order_id, already_completed: data.already_completed ?? false });
  } catch {
    console.error("SePay payment confirmation unavailable", { eventId: payment.eventId });
    return NextResponse.json({ success: false, error: "Chưa thể xác nhận giao dịch" }, { status: 500 });
  }
}
