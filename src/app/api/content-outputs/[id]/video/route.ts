import { verifyClipQuote } from "@/lib/clip-quote-auth";
import { resolveClipDubbing } from "@/lib/clip-dubbing";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { getSeedanceModel, submitSeedanceVideo } from "@/lib/wavespeed";
import type { VideoRequest } from "@/lib/wavespeed";
import {
  SEEDANCE_VARIANTS,
  seedanceVariant,
  validSeedanceDuration,
} from "@/lib/video-models";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user)
    return NextResponse.json(
      { error: "Phiên đăng nhập đã hết hạn." },
      { status: 401 },
    );
  const body = await request.json();
  const mode: VideoRequest["mode"] = body.mode === "text" ? "text" : "image";
  if (
    typeof body.prompt !== "string" ||
    !body.prompt.trim() ||
    (mode === "image" && typeof body.image !== "string") ||
    !validSeedanceDuration(body.duration, body.model) ||
    !["720p", "1080p"].includes(body.resolution) ||
    (mode === "text" &&
      !["9:16", "1:1", "16:9"].includes(body.aspect_ratio ?? "9:16"))
  )
    return NextResponse.json(
      { error: "Cấu hình video không hợp lệ." },
      { status: 400 },
    );
  const requestId =
    typeof body.request_id === "string" && UUID.test(body.request_id)
      ? body.request_id
      : crypto.randomUUID();
  const { data: output } = await supabase
    .from("content_outputs")
    .select("*, content_sets!inner(project_id)")
    .eq("id", id)
    .maybeSingle();
  if (!output || output.kind !== "video")
    return NextResponse.json(
      { error: "Không tìm thấy đầu ra video." },
      { status: 404 },
    );
  if (["queued", "running"].includes(output.status) && output.generation_job_id)
    return NextResponse.json(
      { jobId: output.generation_job_id, outputId: id, duplicate: true },
      { status: 202 },
    );
  try {
    const video: VideoRequest = {
      model: seedanceVariant(body.model),
      mode,
      prompt: body.prompt.trim(),
      image: typeof body.image === "string" ? body.image : undefined,
      lastImage:
        typeof body.last_image === "string" ? body.last_image : undefined,
      referenceImages: Array.isArray(body.reference_images)
        ? body.reference_images
            .filter((url: unknown): url is string => typeof url === "string")
            .slice(0, 30)
        : undefined,
      aspectRatio:
        body.aspect_ratio === "1:1" || body.aspect_ratio === "16:9"
          ? body.aspect_ratio
          : "9:16",
      duration: Number(body.duration),
      resolution: body.resolution as "720p" | "1080p",
      generateAudio: false,
    };
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://aida.vn";
    if (!siteUrl.startsWith("https://"))
      throw new Error("URL ứng dụng phải dùng HTTPS để nhận kết quả video.");
    const savedQuote = output.quote_snapshot as {
      customerPoints?: number;
      providerCostUsd?: number;
      dubbing?: unknown;
      signature?: string;
      config?: Record<string, unknown>;
    } | null;
    const dubbing = await resolveClipDubbing(
      output.content_sets.project_id,
      body.dubbing,
      video.duration,
    );
    if (body.generate_audio !== false && !dubbing)
      throw new Error("Chọn người nói và nhập lời lồng tiếng.");
    const savedConfig = savedQuote?.config;
    const authentic = verifyClipQuote({ outputId: id, expiresAt: output.quote_expires_at ? new Date(output.quote_expires_at).toISOString() : null, customerPoints: savedQuote?.customerPoints, providerCostUsd: savedQuote?.providerCostUsd, config: savedConfig, dubbing: savedQuote?.dubbing }, savedQuote?.signature);
    const quoteIsCurrent =
      authentic &&
      !!savedQuote &&
      !!output.quote_expires_at &&
      new Date(output.quote_expires_at).getTime() > Date.now() &&
      savedConfig?.mode === video.mode &&
      savedConfig?.prompt === video.prompt &&
      savedConfig?.image === video.image &&
      savedConfig?.lastImage === video.lastImage &&
      savedConfig?.aspectRatio === video.aspectRatio &&
      JSON.stringify(savedConfig?.referenceImages ?? []) ===
        JSON.stringify(video.referenceImages ?? []) &&
      JSON.stringify(savedQuote?.dubbing ?? null) === JSON.stringify(dubbing) &&
      savedConfig?.duration === video.duration &&
      savedConfig?.resolution === video.resolution &&
      savedConfig?.generateAudio === video.generateAudio;
    if (
      !quoteIsCurrent ||
      typeof savedQuote?.customerPoints !== "number" ||
      typeof savedQuote.providerCostUsd !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "Báo giá đã hết hạn hoặc cấu hình đã đổi. Hãy xem giá lại trước khi tạo video.",
          code: "QUOTE_EXPIRED",
        },
        { status: 409 },
      );
    }
    const quote = {
      customerPoints: savedQuote.customerPoints,
      providerCostUsd: savedQuote.providerCostUsd,
    };
    const projectId = output.content_sets.project_id as string;
    const { data: brand, error: brandError } = await supabase.from("projects")
      .select("watermark_url,watermark_position,watermark_opacity")
      .eq("id", projectId).single();
    if (brandError || !brand) throw new Error("Không tải được thương hiệu dự án.");
    const manifestHash = await crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify({ outputId: id, ...video, requestId }),
        ),
      )
      .then((hash) =>
        Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );
    const model = getSeedanceModel(video);
    const referenceManifest = [
      ...(video.image ? [{ image: video.image, role: "first_frame" }] : []),
      ...(video.lastImage
        ? [{ image: video.lastImage, role: "last_frame" }]
        : []),
      ...(video.referenceImages ?? []).map((image: string) => ({
        image,
        role: "reference",
      })),
    ];
    const { data: job, error: jobError } = await getSupabaseAdmin()
      .from("generation_jobs")
      .insert({
        project_id: projectId,
        content_set_id: output.content_set_id,
        content_output_id: id,
        creation_kind: "content_video",
        source_entity_type: "content_output",
        source_entity_id: id,
        workflow_version: dubbing ? "content-video-dub-v1" : "content-video-v2",
        provider: "wavespeed",
        model,
        status: "queued",
        compiled_prompt: video.prompt,
        reference_manifest: referenceManifest,
        manifest_hash: manifestHash,
        requested_output: {
          model,
          mode: video.mode,
          duration: video.duration,
          resolution: video.resolution,
          aspectRatio:
            video.mode === "text" ? video.aspectRatio : output.format,
          generateAudio: video.generateAudio,
        },
        estimated_points: quote.customerPoints,
        actual_points: quote.customerPoints,
        estimated_cost_usd: quote.providerCostUsd,
        created_by: user.id,
        checkpoint: {
          brand,
          dubbing,
          quote,
          requestId,
          quoteExpiresAt: output.quote_expires_at,
          video,
        },
      })
      .select()
      .single();
    if (jobError || !job) {
      const { data: existing } = await getSupabaseAdmin()
        .from("generation_jobs")
        .select("id")
        .eq("content_output_id", id)
        .in("status", ["queued", "running"])
        .maybeSingle();
      if (existing)
        return NextResponse.json(
          { jobId: existing.id, outputId: id, duplicate: true },
          { status: 202 },
        );
      throw new Error(jobError?.message || "Không lưu được job video.");
    }
    const { data: deduction, error: deductError } =
      await getSupabaseAdmin().rpc("atomic_deduct_project_points", {
        _project_id: projectId,
        _actor_user_id: user.id,
        _cost: quote.customerPoints,
        _description: `Tạo video ${SEEDANCE_VARIANTS.find((item) => item.id === video.model)?.label} ${video.duration}s ${video.resolution} (-${quote.customerPoints} điểm)`,
        _request_id: requestId,
        _ai_action: "video",
        _metadata: {
          model,
          mode: video.mode,
          duration: video.duration,
          resolution: video.resolution,
          content_output_id: id,
        },
      });
    if (deductError || !deduction?.success) {
      // A rejected charge never reached the provider. Remove the temporary
      // concurrency lock so it cannot appear as a failed media generation.
      await getSupabaseAdmin()
        .from("generation_jobs")
        .delete()
        .eq("id", job.id);
      return NextResponse.json(
        {
          error: `Ví dự án không đủ điểm. Cần ${quote.customerPoints} điểm.`,
          required: quote.customerPoints,
          current: deduction?.points ?? 0,
        },
        { status: 402 },
      );
    }
    await getSupabaseAdmin()
      .from("content_outputs")
      .update({
        generation_job_id: job.id,
        status: "queued",
        poster_url: video.image ?? null,
        script: video.prompt,
        duration_seconds: video.duration,
        source_snapshot: {
          model,
          mode: video.mode,
          image: video.image ?? null,
          lastImage: video.lastImage ?? null,
          referenceImages: video.referenceImages ?? [],
          aspectRatio: video.aspectRatio ?? null,
        },
        attempt_count: (output.attempt_count ?? 0) + 1,
      })
      .eq("id", id);
    let prediction;
    try {
      prediction = await submitSeedanceVideo(
        video,
        `${siteUrl}/api/webhooks/wavespeed`,
      );
    } catch (error) {
      // The provider may have received the request even if its response was
      // interrupted. Keep the charged job for operator review; never resend it.
      await getSupabaseAdmin()
        .from("generation_jobs")
        .update({
          status: "failed",
          error: {
            provider_submission:
              error instanceof Error
                ? error.message
                : "Unknown provider submission failure",
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      await getSupabaseAdmin()
        .from("content_outputs")
        .update({ status: "failed" })
        .eq("id", id);
      throw error;
    }
    // A prediction id is durable. Make it immediately claimable by Railway
    // instead of holding a web-function lease for fifteen minutes.
    await getSupabaseAdmin()
      .from("generation_jobs")
      .update({
        provider_request_id: prediction.id,
        provider_response: prediction,
        status: "running",
        started_at: new Date().toISOString(),
        lease_expires_at: null,
      })
      .eq("id", job.id);
    await getSupabaseAdmin()
      .from("content_outputs")
      .update({ status: "running" })
      .eq("id", id);
    return NextResponse.json(
      { jobId: job.id, outputId: id, quote },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Không tạo được video.",
      },
      { status: 500 },
    );
  }
}
