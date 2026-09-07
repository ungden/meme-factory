/*
 * Railway's durable video worker. It uses direct service credentials when
 * configured, while retaining the old authenticated reconcile call as a safe
 * rollout fallback. No browser or web-request lifetime owns a video job.
 */
import { createClient } from "@supabase/supabase-js";
import { createWriteStream, createReadStream } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const appUrl = process.env.AIDA_BASE_URL;
const workerToken = process.env.VIDEO_WORKER_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const waveSpeedKey = process.env.WAVESPEED_API_KEY;
const directMode = Boolean(supabaseUrl && serviceRoleKey && waveSpeedKey);
const supabase = directMode ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const execFileAsync = promisify(execFile);
const MAX_BYTES = 100 * 1024 * 1024;
const LEASE_SECONDS = 90;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!directMode && (!appUrl || !workerToken)) {
  throw new Error("Cần direct worker credentials hoặc AIDA_BASE_URL và VIDEO_WORKER_TOKEN.");
}

function firstOutputUrl(outputs) {
  const first = outputs?.[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") return typeof first.url === "string" ? first.url : typeof first.output === "string" ? first.output : null;
  return null;
}

async function prediction(id) {
  const response = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${encodeURIComponent(id)}/result`, {
    headers: { Authorization: `Bearer ${waveSpeedKey}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.error || `WaveSpeed error ${response.status}`);
  return body?.data ?? body;
}

async function probeVideo(path) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path]);
  const report = JSON.parse(stdout);
  const duration = Number(report?.format?.duration);
  const streams = Array.isArray(report?.streams) ? report.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  return { duration, hasVideo: Boolean(video), hasAudio: streams.some((stream) => stream.codec_type === "audio") };
}

async function downloadAndPersist(sourceUrl, job) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Không tải được MP4 từ provider (${response.status}).`);
  if (!(response.headers.get("content-type") || "").includes("video/mp4")) throw new Error("Provider không trả về MP4.");
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("MP4 vượt giới hạn 100MB.");
  if (!response.body) throw new Error("MP4 không có dữ liệu.");

  const path = `/tmp/${job.id}.mp4`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path, { flags: "w" }));
    if ((await stat(path)).size > MAX_BYTES) throw new Error("MP4 vượt giới hạn 100MB.");
    const inspection = await probeVideo(path);
    if (!inspection.hasVideo || !Number.isFinite(inspection.duration) || inspection.duration <= 0) throw new Error("MP4 không hợp lệ.");
    if (job.requested_output?.generateAudio && !inspection.hasAudio) throw new Error("Video được yêu cầu có âm thanh nhưng file trả về không có audio.");
    const storagePath = `${job.project_id}/${job.id}.mp4`;
    const { error } = await supabase.storage.from("content-media").upload(storagePath, createReadStream(path), { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(error.message);
    return { storagePath, duration: Math.round(inspection.duration) };
  } finally {
    await unlink(path).catch(() => {});
  }
}

function heartbeat(jobId) {
  const timer = setInterval(() => {
    void supabase.from("generation_jobs").update({ lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString() }).eq("id", jobId).eq("status", "running");
  }, 30_000);
  return () => clearInterval(timer);
}

async function finishJob(job) {
  const stopHeartbeat = heartbeat(job.id);
  try {
    const result = await prediction(job.provider_request_id);
    if (result.status === "completed") {
      const sourceUrl = firstOutputUrl(result.outputs);
      if (!sourceUrl) throw new Error("Prediction completed without an MP4 URL.");
      const saved = await downloadAndPersist(sourceUrl, job);
      if (job.content_output_id) {
        const { error } = await supabase.from("content_outputs").update({ status: "completed", media_url: saved.storagePath, duration_seconds: saved.duration }).eq("id", job.content_output_id).in("status", ["queued", "running"]);
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase.from("generation_jobs").update({ status: "completed", provider_response: result, checkpoint: {}, error: null, completed_at: new Date().toISOString(), lease_expires_at: null }).eq("id", job.id).eq("status", "running");
      if (error) throw new Error(error.message);
      return true;
    }
    if (["failed", "cancelled", "timeout", "deleted"].includes(result.status)) {
      if (job.content_output_id) await supabase.from("content_outputs").update({ status: "failed" }).eq("id", job.content_output_id).in("status", ["queued", "running"]);
      const { error } = await supabase.from("generation_jobs").update({ status: "failed", provider_response: result, error: { provider: result.error ?? result.status }, completed_at: new Date().toISOString(), lease_expires_at: null }).eq("id", job.id).eq("status", "running");
      if (error) throw new Error(error.message);
      return true;
    }
  } catch (error) {
    console.error(`WaveSpeed worker failed for ${job.id}:`, error instanceof Error ? error.message : error);
  } finally {
    stopHeartbeat();
  }
  return false;
}

async function directTick() {
  const { data: jobs, error } = await supabase.rpc("claim_wavespeed_video_jobs", { _batch_size: 2, _lease_seconds: LEASE_SECONDS });
  if (error) throw new Error(error.message);
  const results = await Promise.all((jobs ?? []).map(finishJob));
  console.log(`WaveSpeed direct reconcile complete: ${results.filter(Boolean).length} job(s) processed.`);
}

async function proxyTick() {
  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/wavespeed/reconcile`, {
    method: "POST", headers: { Authorization: `Bearer ${workerToken}` },
  });
  if (!response.ok) throw new Error(`Reconcile ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log(`WaveSpeed fallback reconcile complete: ${result.processed ?? 0} job(s) processed.`);
}

while (true) {
  try { await (directMode ? directTick() : proxyTick()); } catch (error) { console.error("Video worker tick:", error instanceof Error ? error.message : error); }
  await sleep(10_000);
}
