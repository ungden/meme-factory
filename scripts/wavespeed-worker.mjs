import { makeFilmWorker } from "./short-film/worker.mjs";
/* Durable Railway worker: polls provider jobs and renders completed multi-scene plans. */
import { createClient } from "@supabase/supabase-js";
import { createWriteStream, createReadStream } from "node:fs";
import { unlink, stat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";

const appUrl = process.env.AIDA_BASE_URL;
const workerToken = process.env.VIDEO_WORKER_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const waveSpeedKey = process.env.WAVESPEED_API_KEY;
const directMode = Boolean(supabaseUrl && serviceRoleKey && waveSpeedKey);
const supabase = directMode
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
const execFileAsync = promisify(execFile);
const MAX_BYTES = 100 * 1024 * 1024;
const LEASE_SECONDS = 90;
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
if (!directMode && (!appUrl || !workerToken))
  throw new Error(
    "Cần direct worker credentials hoặc AIDA_BASE_URL và VIDEO_WORKER_TOKEN.",
  );

function firstOutputUrl(outputs) {
  const first = outputs?.[0];
  return typeof first === "string"
    ? first
    : typeof first?.url === "string"
      ? first.url
      : typeof first?.output === "string"
        ? first.output
        : null;
}
function dimensions(format) {
  return format === "1:1"
    ? [720, 720]
    : format === "4:5"
      ? [720, 900]
      : format === "16:9"
        ? [1280, 720]
        : [720, 1280];
}
async function prediction(id) {
  const response = await fetch(
    `https://api.wavespeed.ai/api/v3/predictions/${encodeURIComponent(id)}/result`,
    { headers: { Authorization: `Bearer ${waveSpeedKey}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.message || body?.error || `WaveSpeed error ${response.status}`,
    );
  return body?.data ?? body;
}
async function probeVideo(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,width,height",
    "-of",
    "json",
    filePath,
  ]);
  const report = JSON.parse(stdout);
  const streams = Array.isArray(report?.streams) ? report.streams : [];
  return {
    duration: Number(report?.format?.duration),
    hasVideo: Boolean(streams.find((stream) => stream.codec_type === "video")),
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
  };
}
async function streamUrlToFile(sourceUrl, filePath) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Không tải được MP4 (${response.status}).`);
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES)
    throw new Error("MP4 vượt giới hạn 100MB.");
  if (!response.body) throw new Error("MP4 không có dữ liệu.");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  if ((await stat(filePath)).size > MAX_BYTES)
    throw new Error("MP4 vượt giới hạn 100MB.");
}
async function downloadAndPersist(sourceUrl, job) {
  const filePath = `/tmp/${job.id}.mp4`;
  try {
    await streamUrlToFile(sourceUrl, filePath);
    const inspection = await probeVideo(filePath);
    if (
      !inspection.hasVideo ||
      !Number.isFinite(inspection.duration) ||
      inspection.duration <= 0
    )
      throw new Error("MP4 không hợp lệ.");
    if (job.requested_output?.generateAudio && !inspection.hasAudio)
      throw new Error(
        "Video được yêu cầu có âm thanh nhưng file trả về không có audio.",
      );
    const storagePath = `${job.project_id}/${job.id}.mp4`;
    const { error } = await supabase.storage
      .from("content-media")
      .upload(storagePath, createReadStream(filePath), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (error) throw new Error(error.message);
    return {
      storagePath,
      duration: Math.round(inspection.duration),
      hasAudio: inspection.hasAudio,
    };
  } finally {
    await unlink(filePath).catch(() => {});
  }
}
function heartbeat(job) {
  let leaseLost = false;
  const renew = async () => {
    const { data, error } = await supabase
      .from("generation_jobs")
      .update({
        lease_expires_at: new Date(
          Date.now() + LEASE_SECONDS * 1000,
        ).toISOString(),
      })
      .eq("id", job.id)
      .eq("lease_owner", job.lease_owner)
      .eq("status", "running")
      .select("id");
    if (error || !data?.length) leaseLost = true;
  };
  const timer = setInterval(() => {
    void renew();
  }, 30_000);
  return { stop: () => clearInterval(timer), lost: () => leaseLost };
}
async function setSceneFailed(job, result) {
  if (job.video_plan_scene_id)
    await supabase
      .from("video_plan_scenes")
      .update({
        status: "failed",
        speech_qa: {
          status: "provider_failed",
          provider: result?.error ?? result?.status ?? "failed",
        },
      })
      .eq("id", job.video_plan_scene_id)
      .eq("active_job_id", job.id);
  if (job.content_output_id)
    await supabase
      .from("content_outputs")
      .update({ status: "failed" })
      .eq("id", job.content_output_id)
      .in("status", ["queued", "running"]);
}
async function finishProviderJob(job) {
  const lease = heartbeat(job);
  try {
    const result = await prediction(job.provider_request_id);
    if (result.status === "completed") {
      const sourceUrl = firstOutputUrl(result.outputs);
      if (!sourceUrl)
        throw new Error("Prediction completed without an MP4 URL.");
      const saved = await downloadAndPersist(sourceUrl, job);
      if (lease.lost()) return false;
      if (job.video_plan_scene_id) {
        const { error } = await supabase
          .from("video_plan_scenes")
          .update({
            status: "completed",
            clip_url: saved.storagePath,
            clip_duration_seconds: saved.duration,
            speech_qa: {
              status: job.requested_output?.generateAudio
                ? "audio_present_pending_transcript_review"
                : "not_requested",
              hasAudio: saved.hasAudio,
            },
            active_job_id: job.id,
          })
          .eq("id", job.video_plan_scene_id)
          .eq("active_job_id", job.id);
        if (error) throw new Error(error.message);
      }
      if (job.content_output_id) {
        const { error } = await supabase
          .from("content_outputs")
          .update({
            status: "completed",
            media_url: saved.storagePath,
            duration_seconds: saved.duration,
          })
          .eq("id", job.content_output_id)
          .in("status", ["queued", "running"]);
        if (error) throw new Error(error.message);
      }
      const { data, error } = await supabase
        .from("generation_jobs")
        .update({
          status: "completed",
          provider_response: result,
          checkpoint: {},
          error: null,
          phase: "stored",
          completed_at: new Date().toISOString(),
          lease_expires_at: null,
        })
        .eq("id", job.id)
        .eq("lease_owner", job.lease_owner)
        .eq("status", "running")
        .select("id");
      if (error || !data?.length) return false;
      return true;
    }
    if (["failed", "cancelled", "timeout", "deleted"].includes(result.status)) {
      if (lease.lost()) return false;
      await setSceneFailed(job, result);
      const { data } = await supabase
        .from("generation_jobs")
        .update({
          status: "failed",
          provider_response: result,
          error: { provider: result.error ?? result.status },
          phase: "provider_failed",
          completed_at: new Date().toISOString(),
          lease_expires_at: null,
        })
        .eq("id", job.id)
        .eq("lease_owner", job.lease_owner)
        .eq("status", "running")
        .select("id");
      return Boolean(data?.length);
    }
  } catch (error) {
    console.error(
      `WaveSpeed worker failed for ${job.id}:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    lease.stop();
  }
  return false;
}
async function signedDownload(storagePath, filePath) {
  const { data, error } = await supabase.storage
    .from("content-media")
    .createSignedUrl(storagePath, 600);
  if (error || !data?.signedUrl)
    throw new Error(error?.message || "Không ký được URL clip.");
  await streamUrlToFile(data.signedUrl, filePath);
}
async function runFfmpeg(args) {
  await execFileAsync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", ...args],
    { maxBuffer: 1024 * 1024 },
  );
}
async function renderPlan(job) {
  const lease = heartbeat(job);
  const directory = await mkdtemp(
    path.join(tmpdir(), `aida-render-${job.id}-`),
  );
  try {
    const requested = job.requested_output ?? {};
    const sceneIds = Array.isArray(requested.sceneIds)
      ? requested.sceneIds
      : [];
    const { data: plan, error: planError } = await supabase
      .from("video_plans")
      .select(
        "id, format, projects!inner(watermark_url, watermark_position, watermark_opacity), video_plan_scenes(*)",
      )
      .eq("id", job.video_plan_id)
      .single();
    if (planError || !plan)
      throw new Error(planError?.message || "Không tìm thấy kế hoạch render.");
    const scenes = (plan.video_plan_scenes ?? [])
      .filter((scene) => sceneIds.includes(scene.id))
      .sort((a, b) => a.scene_index - b.scene_index);
    if (
      !scenes.length ||
      scenes.length !== sceneIds.length ||
      scenes.some((scene) => scene.status !== "completed" || !scene.clip_url)
    )
      return false;
    const [width, height] = dimensions(plan.format);
    const normalized = [];
    for (let index = 0; index < scenes.length; index += 1) {
      if (lease.lost()) return false;
      const source = path.join(directory, `source-${index}.mp4`);
      const target = path.join(directory, `normalized-${index}.mp4`);
      await signedDownload(scenes[index].clip_url, source);
      await runFfmpeg([
        "-i",
        source,
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-af",
        "loudnorm",
        "-movflags",
        "+faststart",
        target,
      ]);
      normalized.push(target);
    }
    const list = path.join(directory, "clips.txt");
    await writeFile(
      list,
      normalized
        .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
        .join("\n"),
    );
    const concatenated = path.join(directory, "concatenated.mp4");
    await runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      concatenated,
    ]);
    const finalPath = path.join(directory, "final.mp4");
    const brand = Array.isArray(plan.projects)
      ? plan.projects[0]
      : plan.projects;
    if (brand?.watermark_url) {
      const watermark = path.join(directory, "watermark");
      await streamUrlToFile(brand.watermark_url, watermark);
      const opacity = Math.min(
        1,
        Math.max(0.05, Number(brand.watermark_opacity ?? 0.8)),
      );
      const position =
        brand.watermark_position === "top-left"
          ? "30:30"
          : brand.watermark_position === "top-right"
            ? "W-w-30:30"
            : brand.watermark_position === "bottom-left"
              ? "30:H-h-30"
              : "W-w-30:H-h-30";
      await runFfmpeg([
        "-i",
        concatenated,
        "-i",
        watermark,
        "-filter_complex",
        `[1:v]scale=iw*0.15:-1,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${position}:format=auto`,
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        finalPath,
      ]);
    } else
      await runFfmpeg([
        "-i",
        concatenated,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        finalPath,
      ]);
    const inspection = await probeVideo(finalPath);
    if (
      !inspection.hasVideo ||
      !Number.isFinite(inspection.duration) ||
      inspection.duration <= 0
    )
      throw new Error("Bản dựng MP4 không hợp lệ.");
    const storagePath = `${job.project_id}/${job.id}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from("content-media")
      .upload(storagePath, createReadStream(finalPath), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);
    if (lease.lost()) return false;
    const { error: outputError } = await supabase
      .from("content_outputs")
      .update({
        status: "completed",
        media_url: storagePath,
        duration_seconds: Math.round(inspection.duration),
        poster_url: null,
      })
      .eq("id", job.content_output_id)
      .in("status", ["queued", "running"]);
    if (outputError) throw new Error(outputError.message);
    await supabase
      .from("video_plans")
      .update({ status: "completed" })
      .eq("id", job.video_plan_id)
      .eq("status", "running");
    const { data, error } = await supabase
      .from("generation_jobs")
      .update({
        status: "completed",
        phase: "rendered",
        checkpoint: {
          sceneIds,
          actualDurationSeconds: Math.round(inspection.duration),
        },
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
        error: null,
      })
      .eq("id", job.id)
      .eq("lease_owner", job.lease_owner)
      .eq("status", "running")
      .select("id");
    if (error || !data?.length) return false;
    return true;
  } catch (error) {
    console.error(
      `Render worker failed for ${job.id}:`,
      error instanceof Error ? error.message : error,
    );
    if (!lease.lost()) {
      await supabase
        .from("generation_jobs")
        .update({
          status: "failed",
          phase: "render_failed",
          error: {
            render:
              error instanceof Error ? error.message : "Unknown render error",
          },
          completed_at: new Date().toISOString(),
          lease_expires_at: null,
        })
        .eq("id", job.id)
        .eq("lease_owner", job.lease_owner)
        .eq("status", "running");
      await supabase
        .from("content_outputs")
        .update({ status: "failed" })
        .eq("id", job.content_output_id)
        .in("status", ["queued", "running"]);
    }
    return false;
  } finally {
    lease.stop();
    await rm(directory, { recursive: true, force: true });
  }
}
async function directTick() {
  const [
    { data: providerJobs, error: providerError },
    { data: renderJobs, error: renderError },
  ] = await Promise.all([
    supabase.rpc("claim_wavespeed_video_jobs", {
      _batch_size: 2,
      _lease_seconds: LEASE_SECONDS,
    }),
    supabase.rpc("claim_video_plan_render_jobs", {
      _batch_size: 1,
      _lease_seconds: LEASE_SECONDS,
    }),
  ]);
  if (providerError) throw new Error(providerError.message);
  if (renderError) throw new Error(renderError.message);
  const results = await Promise.all([
    ...(providerJobs ?? []).map(finishProviderJob),
    ...(renderJobs ?? []).map(renderPlan),
  ]);
  console.log(
    `WaveSpeed direct reconcile complete: ${results.filter(Boolean).length} job(s) processed.`,
  );
}
async function proxyTick() {
  const response = await fetch(
    `${appUrl.replace(/\/$/, "")}/api/internal/wavespeed/reconcile`,
    { method: "POST", headers: { Authorization: `Bearer ${workerToken}` } },
  );
  if (!response.ok)
    throw new Error(`Reconcile ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log(
    `WaveSpeed fallback reconcile complete: ${result.processed ?? 0} job(s) processed.`,
  );
}
async function productionTick() {
  if (!appUrl || !workerToken) return;
  const response = await fetch(
    `${appUrl.replace(/\/$/, "")}/api/internal/short-film-production/advance`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}` },
      signal: AbortSignal.timeout(190000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Production advance ${response.status}: ${await response.text()}`,
    );
  const result = await response.json();
  if (Number(result.processed || 0) > 0)
    console.log(`Short-film production advanced: ${result.processed} run(s).`);
}
async function loop(work, delay) {
  while (true) {
    try {
      await work();
    } catch (error) {
      console.error(
        "Worker tick",
        error instanceof Error ? error.message : error,
      );
    }
    await sleep(delay);
  }
}
const film = directMode ? makeFilmWorker(supabase) : null;
await Promise.all([
  loop(directMode ? directTick : proxyTick, 10000),
  loop(productionTick, 5000),
  ...(film
    ? [loop(() => film.tick(false), 3000), loop(() => film.tick(true), 3000)]
    : []),
]);
