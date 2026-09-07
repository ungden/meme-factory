import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { verifyWaveSpeedWebhook } from "@/lib/wavespeed";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  let event: { id?: string; status?: string; outputs?: unknown[]; error?: unknown };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 }); }
  try {
    if (!verifyWaveSpeedWebhook(request.headers, raw)) return NextResponse.json({ error: "Webhook không hợp lệ" }, { status: 401 });
    if (!event.id) return NextResponse.json({ error: "Thiếu prediction id" }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data: job } = await admin.from("generation_jobs").select("id, status").eq("provider_request_id", event.id).maybeSingle();
    if (!job) return NextResponse.json({ ok: true });
    if (["completed", "failed", "cancelled"].includes(job.status)) return NextResponse.json({ ok: true, duplicate: true });
    if (event.status === "completed") {
      // WaveSpeed expects a quick 2xx acknowledgement. The worker downloads and
      // validates the MP4 so a slow storage write never causes duplicate callbacks.
      // The callback only records provider evidence and wakes an already
      // claimable job. It must not hold the worker back for five minutes.
      await admin.from("generation_jobs").update({ provider_response: event, lease_expires_at: null }).eq("id", job.id);
      return NextResponse.json({ ok: true, queuedForStorage: true });
    }
    await admin.from("generation_jobs").update({ status: "failed", provider_response: event, error: { provider: event.error ?? event.status ?? "Video failed" }, completed_at: new Date().toISOString(), lease_expires_at: null }).eq("id", job.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WaveSpeed webhook failed", error);
    return NextResponse.json({ error: "Không xử lý được webhook" }, { status: 500 });
  }
}
