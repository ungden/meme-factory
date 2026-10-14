import { verifyClipQuote } from "@/lib/clip-quote-auth";
import { ClipDubbingError, resolveClipDubbing } from "@/lib/clip-dubbing";
import { formatPoints } from "@/lib/format";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { spendProjectPoints } from "@/lib/project-points";
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
      { error: "Thiếu mô tả hoặc ảnh mở đầu cho video." },
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
      { error: "Không tìm thấy video này." },
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
      throw new ClipDubbingError("Nhập lời lồng tiếng và chọn người nói nhé.");
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
            "Giá vừa hết hạn hoặc bạn đã đổi tuỳ chọn. Xem lại giá rồi bấm làm video nhé.",
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
      .select("watermark_url,watermark_position,watermark_opacity,name,user_id")
      .eq("id", projectId).single();
    if (brandError || !brand) throw new Error("Không tải được logo của kênh.");
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
    const billing = getSupabaseAdmin();
    const spent = await spendProjectPoints(
      async (name, args) => billing.rpc(name, args),
      {
        projectId,
        projectOwnerId: String(brand.user_id),
        actorUserId: user.id,
        cost: quote.customerPoints,
        description: `Làm video ${SEEDANCE_VARIANTS.find((item) => item.id === video.model)?.customerLabel.toLocaleLowerCase("vi")} ${video.duration} giây ${video.resolution} (-${formatPoints(quote.customerPoints)})`,
        requestId,
        aiAction: "video",
        metadata: {
          model,
          mode: video.mode,
          duration: video.duration,
          resolution: video.resolution,
          content_output_id: id,
        },
        projectName: String(brand.name || ""),
      },
    );
    if (!spent.ok) {
      // A rejected charge never reached the provider. Remove the temporary
      // concurrency lock so it cannot appear as a failed media generation.
      await getSupabaseAdmin()
        .from("generation_jobs")
        .delete()
        .eq("id", job.id);
      if (spent.code === "FAILED") throw new Error(spent.message);
      return NextResponse.json(
        {
          error: `Không đủ điểm. Cần ${formatPoints(quote.customerPoints)}, bạn đang có ${formatPoints(spent.available)}.`,
          code: "INSUFFICIENT_POINTS",
          required: quote.customerPoints,
          current: spent.available,
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
      console.error("Video submission failed:", error);
      return NextResponse.json(
        {
          error:
            "Chưa gửi được video. Khoản điểm vừa trừ sẽ được kiểm tra và hoàn lại nếu video không về.",
          code: "SUBMIT_FAILED",
        },
        { status: 502 },
      );
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
    if (error instanceof ClipDubbingError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Video start failed:", error);
    return NextResponse.json(
      { error: "Chưa bắt đầu làm video được. Bạn thử lại sau ít phút nhé." },
      { status: 500 },
    );
  }
}

type JobRow = {
  id: string;
  status: string;
  phase: string | null;
  error: Record<string, unknown> | null;
};

/** Vì sao video hỏng, theo cách trang video cần nói với người dùng. */
function failureReason(job: JobRow) {
  if (job.error?.provider_submission) return "submission";
  if (job.phase === "render_failed") return "render";
  if (job.status === "failed" || job.status === "cancelled") return "provider";
  if (job.phase === "dubbing_needs_review") return "dubbing";
  return null;
}

/**
 * GET — trạng thái một video lẻ cho trang Video: đang làm, xong hay hỏng, và đã
 * hoàn bao nhiêu điểm. Video hỏng mà chưa hoàn thì hoàn ngay tại đây (RPC tự
 * chặn hoàn hai lần); sweeper vẫn là đường chính khi người dùng không quay lại.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json({ error: "Không tìm thấy video này." }, { status: 404 });
  const { supabase, user } = await getRequestUser(request);
  if (!user)
    return NextResponse.json(
      { error: "Phiên đăng nhập đã hết hạn." },
      { status: 401 },
    );
  const { data: output } = await supabase
    .from("content_outputs")
    .select(
      "id, kind, status, format, media_url, poster_url, duration_seconds, script, caption, generation_job_id, source_snapshot, content_sets!inner(project_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!output || output.kind !== "video")
    return NextResponse.json({ error: "Không tìm thấy video này." }, { status: 404 });
  const { data: row } = output.generation_job_id
    ? await supabase
        .from("generation_jobs")
        .select("id, status, phase, error")
        .eq("id", output.generation_job_id)
        .maybeSingle()
    : { data: null };
  let job = null;
  if (row) {
    const record = row as JobRow;
    const recorded = Number(record.error?.refunded_points);
    let refundedPoints = Number.isFinite(recorded) && recorded > 0 ? recorded : null;
    if (record.status === "failed" && refundedPoints === null) {
      const { data: settled, error } = await getSupabaseAdmin().rpc(
        "settle_failed_content_video",
        { _job_id: record.id },
      );
      if (error) console.error("Video refund failed:", error.message);
      else if (settled?.settled && Number(settled.points) > 0)
        refundedPoints = Number(settled.points);
    }
    job = {
      id: record.id,
      status: record.status,
      phase: record.phase,
      reason: failureReason(record),
      refundedPoints,
    };
  }
  const { content_sets: _parent, ...rest } = output;
  void _parent;
  return NextResponse.json({ output: rest, job });
}
