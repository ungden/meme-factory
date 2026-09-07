import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { submitSeedanceVideo, WAVESPEED_SEEDANCE_MODEL } from "@/lib/wavespeed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  if (typeof body.prompt !== "string" || !body.prompt.trim() || typeof body.image !== "string" || ![15, 30].includes(Number(body.duration)) || !["720p", "1080p"].includes(body.resolution)) return NextResponse.json({ error: "Cấu hình video không hợp lệ." }, { status: 400 });
  const requestId = typeof body.request_id === "string" && UUID.test(body.request_id) ? body.request_id : crypto.randomUUID();
  const { data: output } = await supabase.from("content_outputs").select("*, content_sets!inner(project_id)").eq("id", id).maybeSingle();
  if (!output || output.kind !== "video") return NextResponse.json({ error: "Không tìm thấy đầu ra video." }, { status: 404 });
  if (["queued", "running"].includes(output.status) && output.generation_job_id) return NextResponse.json({ jobId: output.generation_job_id, outputId: id, duplicate: true }, { status: 202 });
  try {
    const video = { prompt: body.prompt.trim(), image: body.image, lastImage: typeof body.last_image === "string" ? body.last_image : undefined, duration: Number(body.duration) as 15 | 30, resolution: body.resolution as "720p" | "1080p", generateAudio: body.generate_audio !== false };
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://aida.vn";
    if (!siteUrl.startsWith("https://")) throw new Error("URL ứng dụng phải dùng HTTPS để nhận kết quả video.");
    const savedQuote = output.quote_snapshot as { customerPoints?: number; providerCostUsd?: number; config?: Record<string, unknown> } | null;
    const savedConfig = savedQuote?.config;
    const quoteIsCurrent = !!savedQuote && !!output.quote_expires_at && new Date(output.quote_expires_at).getTime() > Date.now()
      && savedConfig?.prompt === video.prompt && savedConfig?.image === video.image
      && savedConfig?.duration === video.duration && savedConfig?.resolution === video.resolution && savedConfig?.generateAudio === video.generateAudio;
    if (!quoteIsCurrent || typeof savedQuote?.customerPoints !== "number" || typeof savedQuote.providerCostUsd !== "number") {
      return NextResponse.json({ error: "Báo giá đã hết hạn hoặc cấu hình đã đổi. Hãy xem giá lại trước khi tạo video.", code: "QUOTE_EXPIRED" }, { status: 409 });
    }
    const quote = { customerPoints: savedQuote.customerPoints, providerCostUsd: savedQuote.providerCostUsd };
    const projectId = output.content_sets.project_id as string;
    const manifestHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ outputId: id, ...video, requestId }))).then((hash) => Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""));
    const { data: job, error: jobError } = await getSupabaseAdmin().from("generation_jobs").insert({ project_id: projectId, content_set_id: output.content_set_id, content_output_id: id, creation_kind: "content_video", source_entity_type: "content_output", source_entity_id: id, workflow_version: "content-video-v1", provider: "wavespeed", model: WAVESPEED_SEEDANCE_MODEL, status: "queued", compiled_prompt: video.prompt, reference_manifest: [{ image: video.image, role: "first_frame" }], manifest_hash: manifestHash, requested_output: { duration: video.duration, resolution: video.resolution, aspectRatio: output.format, generateAudio: video.generateAudio }, estimated_points: quote.customerPoints, actual_points: quote.customerPoints, estimated_cost_usd: quote.providerCostUsd, created_by: user.id, checkpoint: { quote, requestId, quoteExpiresAt: output.quote_expires_at } }).select().single();
    if (jobError || !job) {
      const { data: existing } = await getSupabaseAdmin().from("generation_jobs").select("id").eq("content_output_id", id).in("status", ["queued", "running"]).maybeSingle();
      if (existing) return NextResponse.json({ jobId: existing.id, outputId: id, duplicate: true }, { status: 202 });
      throw new Error(jobError?.message || "Không lưu được job video.");
    }
    const { data: deduction, error: deductError } = await getSupabaseAdmin().rpc("atomic_deduct_project_points", { _project_id: projectId, _actor_user_id: user.id, _cost: quote.customerPoints, _description: `Tạo video Seedance 2.5 ${video.duration}s ${video.resolution} (-${quote.customerPoints} điểm)`, _request_id: requestId, _ai_action: "video", _metadata: { model: WAVESPEED_SEEDANCE_MODEL, duration: video.duration, resolution: video.resolution, content_output_id: id } });
    if (deductError || !deduction?.success) {
      // A rejected charge never reached the provider. Remove the temporary
      // concurrency lock so it cannot appear as a failed media generation.
      await getSupabaseAdmin().from("generation_jobs").delete().eq("id", job.id);
      return NextResponse.json({ error: `Ví dự án không đủ điểm. Cần ${quote.customerPoints} điểm.`, required: quote.customerPoints, current: deduction?.points ?? 0 }, { status: 402 });
    }
    await getSupabaseAdmin().from("content_outputs").update({ generation_job_id: job.id, status: "queued", poster_url: video.image, script: video.prompt, duration_seconds: video.duration, attempt_count: (output.attempt_count ?? 0) + 1 }).eq("id", id);
    let prediction;
    try {
      prediction = await submitSeedanceVideo(video, `${siteUrl}/api/webhooks/wavespeed`);
    } catch (error) {
      // The provider may have received the request even if its response was
      // interrupted. Keep the charged job for operator review; never resend it.
      await getSupabaseAdmin().from("generation_jobs").update({ status: "failed", error: { provider_submission: error instanceof Error ? error.message : "Unknown provider submission failure" }, completed_at: new Date().toISOString() }).eq("id", job.id);
      await getSupabaseAdmin().from("content_outputs").update({ status: "failed" }).eq("id", id);
      throw error;
    }
    await getSupabaseAdmin().from("generation_jobs").update({ provider_request_id: prediction.id, provider_response: prediction, status: "running", started_at: new Date().toISOString(), lease_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("id", job.id);
    await getSupabaseAdmin().from("content_outputs").update({ status: "running" }).eq("id", id);
    return NextResponse.json({ jobId: job.id, outputId: id, quote }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không tạo được video." }, { status: 500 });
  }
}
