import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { verifyWaveSpeedWebhook } from "@/lib/wavespeed";
export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    if (!verifyWaveSpeedWebhook(request.headers, raw))
      return NextResponse.json(
        { error: "Webhook không hợp lệ" },
        { status: 401 },
      );
    const parsed = JSON.parse(raw);
    const event = parsed.data || parsed;
    if (!event.id)
      return NextResponse.json(
        { error: "Thiếu prediction id" },
        { status: 400 },
      );
    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc("record_film_event", {
      p_id: request.headers.get("webhook-id"),
      p_prediction: event.id,
      p_payload: event,
    });
    if (error) throw error;
    // The worker owns terminal transitions and file persistence, including failures.
    const { error: legacy } = await admin
      .from("generation_jobs")
      .update({ provider_response: event })
      .eq("provider_request_id", event.id)
      .in("status", ["queued", "running"]);
    if (legacy) throw legacy;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Không xử lý được webhook" },
      { status: 500 },
    );
  }
}
