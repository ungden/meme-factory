import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { authorizeInternal } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/worker-heartbeat — worker Railway báo "tôi còn sống".
 *
 * Lưu trong `system_settings.worker_heartbeat` thay vì bảng riêng: một dòng
 * key-value cho mỗi worker là đủ, và không phải thêm migration cho một con số
 * bị ghi đè mỗi 30 giây.
 */
export async function POST(request: NextRequest) {
  if (!authorizeInternal(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const worker = typeof body.worker === "string" && body.worker ? body.worker.slice(0, 40) : "wavespeed";
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "worker_heartbeat")
    .maybeSingle();
  const value = { ...((data?.value as Record<string, string>) || {}), [worker]: new Date().toISOString() };
  const { error } = await admin
    .from("system_settings")
    .upsert({ key: "worker_heartbeat", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, worker });
}
