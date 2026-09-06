import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { getWaveSpeedPrediction } from "@/lib/wavespeed";

export const maxDuration = 60;

function outputUrl(outputs: unknown[] | undefined) {
  const first = outputs?.[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    const value = first as { url?: unknown; output?: unknown };
    return typeof value.url === "string" ? value.url : typeof value.output === "string" ? value.output : null;
  }
  return null;
}

async function persistVideo(sourceUrl: string, projectId: string, jobId: string) {
  const admin = getSupabaseAdmin();
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Không tải được MP4 từ provider (${response.status}).`);
  if (!(response.headers.get("content-type") || "").includes("video/mp4")) throw new Error("Provider không trả về MP4.");
  if (Number(response.headers.get("content-length") || 0) > 100 * 1024 * 1024) throw new Error("MP4 vượt giới hạn 100MB.");
  const path = `${projectId}/${jobId}.mp4`;
  const { error } = await admin.storage.from("content-media").upload(path, await response.arrayBuffer(), { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function POST(request: NextRequest) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  if (!token) return NextResponse.json({ error: "Worker credential is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: jobs, error } = await admin.from("generation_jobs").select("id, project_id, content_output_id, provider_request_id").eq("provider", "wavespeed").eq("status", "running").not("provider_request_id", "is", null).order("started_at", { ascending: true }).limit(24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let processed = 0;
  for (const job of jobs ?? []) {
    try {
      const result = await getWaveSpeedPrediction(job.provider_request_id);
      if (result.status === "completed") {
        const url = outputUrl(result.outputs);
        if (!url) throw new Error("Prediction completed without an MP4 URL.");
        const path = await persistVideo(url, job.project_id, job.id);
        await admin.from("generation_jobs").update({ status: "completed", provider_response: result, checkpoint: {}, error: null, completed_at: new Date().toISOString(), lease_expires_at: null }).eq("id", job.id);
        if (job.content_output_id) await admin.from("content_outputs").update({ status: "completed", media_url: path }).eq("id", job.content_output_id);
        processed++;
      } else if (["failed", "cancelled", "timeout", "deleted"].includes(result.status)) {
        await admin.from("generation_jobs").update({ status: "failed", provider_response: result, error: { provider: result.error ?? result.status }, completed_at: new Date().toISOString(), lease_expires_at: null }).eq("id", job.id);
        if (job.content_output_id) await admin.from("content_outputs").update({ status: "failed" }).eq("id", job.content_output_id);
        processed++;
      }
    } catch (jobError) { console.error(`WaveSpeed reconcile failed for ${job.id}`, jobError); }
  }
  return NextResponse.json({ processed });
}
