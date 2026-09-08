import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { getSeedanceModel, submitSeedanceVideo, type VideoRequest } from "@/lib/wavespeed";

async function planForUser(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], planId: string) {
  return supabase.from("video_plans").select("*, video_plan_scenes(*)").eq("id", planId).maybeSingle();
}

type QuotedScene = { sceneId: string; sceneIndex: number; prompt: string; request: VideoRequest; quote: { customerPoints: number; providerCostUsd: number } };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { planId } = await params; const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data: plan } = await planForUser(supabase, planId);
  if (!plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch video." }, { status: 404 });
  if (plan.status === "running") {
    const { data: job } = await getSupabaseAdmin().from("generation_jobs").select("id, content_output_id").eq("video_plan_id", plan.id).eq("creation_kind", "video_plan_render").in("status", ["queued", "running"]).maybeSingle();
    if (job) return NextResponse.json({ jobId: job.id, outputId: job.content_output_id, duplicate: true }, { status: 202 });
  }
  const snapshot = plan.quote_snapshot as { version?: number; scenes?: QuotedScene[]; totals?: { customerPoints?: number } } | null;
  if (Number(body.expectedVersion) !== plan.version || snapshot?.version !== plan.version || !plan.quote_expires_at || new Date(plan.quote_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Báo giá đã hết hạn hoặc kế hoạch đã đổi. Hãy xem giá lại.", code: "QUOTE_EXPIRED" }, { status: 409 });
  const quotedScenes = snapshot?.scenes ?? [];
  const liveScenes = plan.video_plan_scenes ?? [];
  if (!quotedScenes.length || quotedScenes.length !== liveScenes.length || quotedScenes.some((item) => !liveScenes.some((scene: { id: string }) => scene.id === item.sceneId))) return NextResponse.json({ error: "Báo giá không khớp các cảnh hiện tại. Hãy xem giá lại." }, { status: 409 });
  const totalPoints = Number(snapshot?.totals?.customerPoints ?? 0);
  const admin = getSupabaseAdmin();
  const { data: wallet } = await admin.from("project_wallets").select("points").eq("project_id", plan.project_id).maybeSingle();
  if (Number(wallet?.points ?? 0) < totalPoints) return NextResponse.json({ error: `Ví dự án không đủ điểm. Cần ${totalPoints.toLocaleString("vi-VN")} điểm.`, required: totalPoints, current: wallet?.points ?? 0 }, { status: 402 });
  const { data: contentSet, error: setError } = await admin.from("content_sets").insert({ project_id: plan.project_id, title: plan.title, brief: plan.brief, selected_character_ids: (plan.cast_snapshot as Array<{ characterId?: string }> ?? []).map((character) => character.characterId).filter((id): id is string => typeof id === "string"), cast_snapshot: plan.cast_snapshot, created_by: user.id }).select().single();
  if (setError || !contentSet) return NextResponse.json({ error: setError?.message || "Không tạo được bản lưu video." }, { status: 500 });
  const { data: output, error: outputError } = await admin.from("content_outputs").insert({ content_set_id: contentSet.id, kind: "video", format: plan.format, script: plan.brief, duration_seconds: null, status: "queued", source_snapshot: { videoPlanId: plan.id, videoPlanVersion: plan.version, scenes: quotedScenes.map((scene) => scene.sceneId) } }).select().single();
  if (outputError || !output) return NextResponse.json({ error: outputError?.message || "Không tạo được đầu ra video." }, { status: 500 });
  const { data: renderJob, error: renderError } = await admin.from("generation_jobs").insert({ project_id: plan.project_id, content_set_id: contentSet.id, content_output_id: output.id, video_plan_id: plan.id, creation_kind: "video_plan_render", source_entity_type: "video_plan", source_entity_id: plan.id, workflow_version: "multiscene-v1", provider: "wavespeed", model: "ffmpeg-concat-v1", status: "queued", compiled_prompt: plan.brief || plan.title, manifest_hash: crypto.createHash("sha256").update(JSON.stringify({ planId: plan.id, version: plan.version, outputId: output.id, scenes: quotedScenes.map((scene) => scene.sceneId) })).digest("hex"), requested_output: { planVersion: plan.version, generateAudio: plan.generate_audio, format: plan.format, resolution: plan.resolution, sceneIds: quotedScenes.map((scene) => scene.sceneId) }, estimated_points: 0, actual_points: 0, created_by: user.id, checkpoint: { phase: "waiting_for_scenes" } }).select().single();
  if (renderError || !renderJob) return NextResponse.json({ error: renderError?.message || "Không tạo được job ghép video." }, { status: 500 });
  const webhook = `${(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://aida.vn").replace(/\/$/, "")}/api/webhooks/wavespeed`;
  const jobs: Array<{ sceneId: string; jobId: string }> = [];
  try {
    for (const scene of quotedScenes) {
      const requestId = crypto.randomUUID();
      const { data: job, error: jobError } = await admin.from("generation_jobs").insert({ project_id: plan.project_id, content_set_id: contentSet.id, content_output_id: null, video_plan_id: plan.id, video_plan_scene_id: scene.sceneId, parent_job_id: renderJob.id, creation_kind: "video_scene", source_entity_type: "video_plan_scene", source_entity_id: scene.sceneId, workflow_version: "multiscene-v1", provider: "wavespeed", model: getSeedanceModel(scene.request), status: "queued", compiled_prompt: scene.prompt, reference_manifest: [{ image: scene.request.image, role: "first_frame" }, ...(scene.request.lastImage ? [{ image: scene.request.lastImage, role: "last_frame" }] : [])], manifest_hash: crypto.createHash("sha256").update(JSON.stringify({ planId: plan.id, version: plan.version, sceneId: scene.sceneId, request: scene.request, requestId })).digest("hex"), requested_output: { ...scene.request, generateAudio: scene.request.generateAudio, phase: "provider_submission" }, estimated_points: scene.quote.customerPoints, actual_points: scene.quote.customerPoints, estimated_cost_usd: scene.quote.providerCostUsd, created_by: user.id, checkpoint: { quote: scene.quote, requestId, parentJobId: renderJob.id } }).select().single();
      if (jobError || !job) throw new Error(jobError?.message || `Không tạo được cảnh ${scene.sceneIndex + 1}.`);
      const { data: deduction, error: deductionError } = await admin.rpc("atomic_deduct_project_points", { _project_id: plan.project_id, _actor_user_id: user.id, _cost: scene.quote.customerPoints, _description: `Tạo cảnh ${scene.sceneIndex + 1} của ${plan.title} (-${scene.quote.customerPoints} điểm)`, _request_id: requestId, _ai_action: "video_scene", _metadata: { video_plan_id: plan.id, video_plan_scene_id: scene.sceneId, render_job_id: renderJob.id, model: getSeedanceModel(scene.request) } });
      if (deductionError || !deduction?.success) { await admin.from("generation_jobs").delete().eq("id", job.id); throw new Error(`Ví dự án không đủ điểm cho cảnh ${scene.sceneIndex + 1}.`); }
      const { error: sceneError } = await admin.from("video_plan_scenes").update({ status: "queued", active_job_id: job.id }).eq("id", scene.sceneId);
      if (sceneError) throw new Error(sceneError.message);
      try {
        const prediction = await submitSeedanceVideo(scene.request, webhook);
        await admin.from("generation_jobs").update({ status: "running", provider_request_id: prediction.id, provider_response: prediction, started_at: new Date().toISOString(), lease_expires_at: null, phase: "provider_running" }).eq("id", job.id);
        await admin.from("video_plan_scenes").update({ status: "running" }).eq("id", scene.sceneId);
      } catch (providerError) {
        // A timeout can mean WaveSpeed accepted the request. It stays visible to
        // operators as a reconciliation case; no automatic resubmission occurs.
        await admin.from("generation_jobs").update({ status: "running", phase: "reconciling_submission", error: { provider_submission: providerError instanceof Error ? providerError.message : "Unknown submission state" }, checkpoint: { quote: scene.quote, requestId, parentJobId: renderJob.id, needsReconciliation: true } }).eq("id", job.id);
        await admin.from("video_plan_scenes").update({ status: "running" }).eq("id", scene.sceneId);
      }
      jobs.push({ sceneId: scene.sceneId, jobId: job.id });
    }
    await admin.from("video_plans").update({ status: "running", latest_content_output_id: output.id }).eq("id", plan.id).eq("version", plan.version);
    return NextResponse.json({ jobId: renderJob.id, outputId: output.id, sceneJobs: jobs, totalPoints }, { status: 202 });
  } catch (error) {
    await admin.from("generation_jobs").update({ status: "cancelled", completed_at: new Date(), error: { run: error instanceof Error ? error.message : "Run interrupted" } }).eq("id", renderJob.id).eq("status", "queued");
    await admin.from("content_outputs").update({ status: "failed" }).eq("id", output.id).eq("status", "queued");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không gửi được lô cảnh." }, { status: 500 });
  }
}
