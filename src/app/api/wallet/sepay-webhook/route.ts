import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TL_REGEX = /tl([a-z0-9]{8})/i;

// ============================================
// Sepay Webhook Payload (from docs.sepay.vn):
// {
//   "id": 92704,                    // Sepay transaction ID
//   "gateway": "Vietcombank",       // Bank brand name
//   "transactionDate": "...",       // Timestamp
//   "accountNumber": "0123499999",  // Bank account number
//   "code": null,                   // Payment code (sepay auto-detect)
//   "content": "TL1A2B3C4D ...",   // Transfer content (has our TL code)
//   "transferType": "in",           // "in" = incoming, "out" = outgoing
//   "transferAmount": 2277000,      // Amount
//   "accumulated": 19077000,        // Running balance
//   "subAccount": null,             // Sub/virtual account
//   "referenceCode": "MBVCB.xxx",   // SMS reference code
//   "description": ""               // Full SMS body
// }
// ============================================

// Recursively extract all strings from any object
function iterateStringsDeep(obj: unknown): string[] {
  if (obj == null) return [];
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(iterateStringsDeep);
  if (typeof obj === "object") return Object.values(obj as Record<string, unknown>).flatMap(iterateStringsDeep);
  return [];
}

function findTLCode(payload: Record<string, unknown>): string | null {
  for (const s of iterateStringsDeep(payload)) {
    const match = s.match(TL_REGEX);
    if (match) return match[0];
  }
  return null;
}

function findVirtualAccount(payload: Record<string, unknown>): string | null {
  // Sepay uses "subAccount" for virtual/sub accounts, "accountNumber" for main account
  // Check all possible fields where the VA number might appear
  const candidates = [payload?.subAccount, payload?.accountNumber, payload?.virtualAccount, payload?.beneficiary, payload?.acc];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function findAmount(payload: Record<string, unknown>): number | null {
  // Sepay sends "transferAmount" — check it FIRST, then fallbacks
  const a = (payload?.transferAmount ?? payload?.amount ?? payload?.transAmount ?? payload?.value ?? payload?.money ?? null) as string | number | null;
  if (typeof a === "number" && isFinite(a)) return a;
  if (typeof a === "string") {
    const num = parseFloat(a);
    if (!isNaN(num)) return num;
  }
  return null;
}

// Atomic confirm via RPC — no race conditions, no partial state
async function confirmTopup(orderId: string) {
  const { data: result, error: rpcError } = await supabaseAdmin.rpc("atomic_confirm_topup", {
    _order_id: orderId,
  });

  if (rpcError) {
    throw new Error(`RPC error: ${rpcError.message}`);
  }

  if (!result?.success) {
    throw new Error(result?.error || "Không thể xác nhận nạp tiền");
  }

  return result;
}

export async function POST(req: Request) {
  try {
    // Validate webhook API key
    const apiKeySecret = process.env.SEPAY_WEBHOOK_API_KEY;
    if (!apiKeySecret) {
      console.error("[Sepay Webhook] SEPAY_WEBHOOK_API_KEY not configured");
      return NextResponse.json({ success: false, error: "Webhook API Key chưa cấu hình" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization");
    const incomingKey = authHeader?.startsWith("Apikey ") ? authHeader.substring(7) : null;

    if (incomingKey !== apiKeySecret) {
      console.warn("[Sepay Webhook] Invalid API key", { authHeader: authHeader?.substring(0, 20) });
      return NextResponse.json({ success: false, error: "API Key không hợp lệ" }, { status: 401 });
    }

    // Parse payload
    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      console.error("[Sepay Webhook] Invalid JSON body");
      return NextResponse.json({ success: false, error: "JSON không hợp lệ" }, { status: 400 });
    }

    // Log full payload for debugging
    console.log("[Sepay Webhook] Received:", JSON.stringify(payload));

    // Reject outgoing transfers — only process incoming money
    const transferType = payload?.transferType as string | undefined;
    if (transferType && transferType !== "in") {
      console.log("[Sepay Webhook] Skipping outgoing transfer", { transferType });
      return NextResponse.json({
        success: true,
        message: "Bỏ qua giao dịch tiền ra",
      });
    }

    // Priority 1: Match by TL code in transfer content
    const foundTL = findTLCode(payload);
    console.log("[Sepay Webhook] TL code search result:", foundTL);

    if (foundTL) {
      const suffix = (foundTL.match(TL_REGEX)?.[1] || "").toLowerCase();
      console.log("[Sepay Webhook] Extracted suffix:", suffix);

      if (suffix && suffix.length === 8) {
        let ord: { id?: string; status?: string } | null = null;

        const { data: orderByRPC, error: rpcError } = await supabaseAdmin
          .rpc("get_pending_topup_by_id_prefix", { _prefix: suffix })
          .maybeSingle();

        console.log("[Sepay Webhook] RPC lookup result:", { orderByRPC, rpcError: rpcError?.message });

        if (!rpcError && orderByRPC) {
          ord = orderByRPC;
        }

        // Fallback: include rejected orders (rescue)
        if (!ord) {
          const { data: fallbackOrder } = await supabaseAdmin
            .from("topup_orders")
            .select("id, status")
            .ilike("id", `${suffix}%`)
            .in("status", ["pending", "rejected"])
            .limit(1)
            .maybeSingle();

          if (fallbackOrder) {
            console.log("[Sepay Webhook] Fallback order found:", fallbackOrder.id);
            ord = fallbackOrder;
          }
        }

        if (ord?.id) {
          console.log("[Sepay Webhook] Confirming order:", ord.id);
          const result = await confirmTopup(ord.id);
          console.log("[Sepay Webhook] Confirm result:", result);
          return NextResponse.json({
            success: true,
            matched: "transfer_content",
            order_id: ord.id,
            already_completed: result.already_completed ?? false,
          });
        }
      }
    }

    // Priority 2: Match by VA + Amount
    const va = findVirtualAccount(payload);
    const amount = findAmount(payload);
    console.log("[Sepay Webhook] VA+Amount fallback:", { va, amount });

    if (va && amount) {
      const { data: matches, error: vaErr } = await supabaseAdmin
        .from("topup_orders")
        .select("id, status")
        .eq("payment_id", va)
        .eq("amount", amount)
        .eq("status", "pending");

      if (vaErr) throw new Error(`Lỗi truy vấn VA: ${vaErr.message}`);

      console.log("[Sepay Webhook] VA+Amount matches:", matches?.length);

      if (matches && matches.length === 1) {
        console.log("[Sepay Webhook] VA match confirming:", matches[0].id);
        const result = await confirmTopup(matches[0].id);
        return NextResponse.json({
          success: true,
          matched: "virtual_account",
          order_id: matches[0].id,
          already_completed: result.already_completed ?? false,
        });
      }
    }

    // No match — log warning with full context
    console.warn("[Sepay Webhook] No matching order found", {
      tl: foundTL,
      va,
      amount,
      content: payload?.content,
      description: payload?.description,
      transferType: payload?.transferType,
      transferAmount: payload?.transferAmount,
      accountNumber: payload?.accountNumber,
      subAccount: payload?.subAccount,
      sepayId: payload?.id,
    });

    return NextResponse.json({
      success: true,
      message: "Không tìm thấy đơn nạp tiền phù hợp",
    });
  } catch (error) {
    console.error("[Sepay Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Lỗi server" },
      { status: 500 }
    );
  }
}
