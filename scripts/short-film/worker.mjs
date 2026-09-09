import { validateDubCue, dubArguments } from "./dubbing.mjs";
import { speechRange, shiftTranscript } from "./edit-range.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  download,
  probe,
  checkVideo,
  parseTranscript,
  speechError,
  captionSegments,
  subtitles,
  normalizeClip,
  ffmpeg,
  readFile,
  writeFile,
  dimensions,
} from "./media.mjs";
import {
  ensureDiskSpace,
  uploadMedia,
  VIDEO_MAX_BYTES,
} from "./storage.mjs";
import {
  createGeminiSpeech,
  GEMINI_TTS_MODEL_IDS,
  readGeminiSpeech,
} from "./gemini-tts.mjs";
const API = "https://api.wavespeed.ai/api/v3";
class LostLease extends Error {}
export function makeFilmWorker(db) {
  async function checkpoint(t, patch) {
    const { data, error } = await db.rpc("checkpoint_film_task", {
      p_id: t.id,
      p_owner: t.lease_owner,
      p_patch: patch,
    });
    if (error || !data)
      throw new LostLease("Lease đã hết hoặc workspace thay đổi.");
    t.checkpoint = { ...t.checkpoint, ...patch.checkpoint };
    if (patch.provider_id) t.provider_id = patch.provider_id;
  }
  async function source(id, project) {
    const { data, error } = await db
      .from("short_film_tasks")
      .select("*")
      .eq("id", id)
      .eq("project_id", project)
      .eq("status", "completed")
      .single();
    if (error || !data?.result) throw new Error("Thiếu kết quả đầu vào.");
    return data;
  }
  async function sign(storagePath, project) {
    if (!storagePath?.startsWith(project + "/"))
      throw new Error("Sai phạm vi media.");
    const { data, error } = await db.storage
      .from("content-media")
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
  async function upload(t, file, name, mime) {
    const previous = t.checkpoint.uploads?.[name];
    const saved = await uploadMedia({
      db,
      prefix: `${t.project_id}/films/${t.id}`,
      file,
      name,
      mime,
      previous,
      onCheckpoint: async (state) => {
        await checkpoint(t, {
          checkpoint: {
            uploads: { ...(t.checkpoint.uploads || {}), [name]: state },
          },
        });
      },
    });
    return saved.storagePath;
  }
  async function getResult(t) {
    const r = await fetch(
      `${API}/predictions/${encodeURIComponent(t.provider_id)}/result`,
      {
        headers: { Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!r.ok) throw new Error(`Không đọc được prediction (${r.status}).`);
    const j = await r.json();
    return j.data || j;
  }
  async function send(t, input) {
    if (t.checkpoint.submitting && !t.provider_id) {
      await checkpoint(t, {
        status: "reconciling",
        error:
          "Đã bắt đầu gửi provider; cần đối soát prediction trước khi chạy tiếp.",
        release: true,
      });
      return null;
    }
    await checkpoint(t, {
      checkpoint: { submitting: true, submittedInputs: input },
    });
    let r;
    try {
      r = await fetch(
          `${API}/${t.input.model}?webhook=${encodeURIComponent(`${process.env.AIDA_PUBLIC_BASE_URL || "https://aida.vn"}/api/webhooks/wavespeed`)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(45000),
        },
      );
    } catch {
      await checkpoint(t, {
        status: "reconciling",
        error: "Chưa biết provider đã nhận yêu cầu hay chưa. Không tự gửi lại.",
        release: true,
      });
      return null;
    }
    const j = await r.json().catch(() => ({}));
    const result = j.data || j;
    if (!r.ok || !result.id) {
      const certain =
        r.status >= 400 &&
        r.status < 500 &&
        ![408, 409, 429].includes(r.status);
      await checkpoint(t, {
        status: certain ? "failed" : "reconciling",
        checkpoint: { definitiveFailure: certain },
        error: `Provider ${r.status}; ${certain ? "yêu cầu bị từ chối" : "cần đối soát"}.`,
        release: true,
      });
      return null;
    }
    await checkpoint(t, {
      provider_id: result.id,
      checkpoint: { predictionId: result.id },
      release: true,
    });
    return null;
  }
  async function prepareInputs(t) {
    const i = { ...t.input.providerInputs };
    if (t.kind === "video") {
      const image = await source(t.input.imageTaskId, t.project_id);
      i.image = await sign(image.result.path, t.project_id);
    }
    if (t.kind === "lip_sync" || t.kind === "transcribe") {
      const video = await source(t.input.videoTaskId, t.project_id);
      i.video = await sign(video.result.path, t.project_id);
      if (t.kind === "lip_sync") {
        const audio = await source(t.input.audioTaskId, t.project_id);
        if (
          Number(audio.result.duration) >
          Number(video.result.duration) - 0.15
        )
          throw new Error("Thoại dài hơn clip; không cắt lời.");
        i.audio = await sign(audio.result.path, t.project_id);
        i.sync_mode = "silence";
      } else {
        delete i.prompt;
        i.language = "vi";
        i.task = "transcribe";
        i.enable_timestamps = true;
      }
    }
    return i;
  }
  async function image(t, dir) {
    if (t.input.importPath)
      return {
        path: t.input.importPath,
        cast: t.input.cast,
        review: "pending_visual_review",
      };
    if (t.checkpoint.submitting && !t.checkpoint.generatedImage) {
      await checkpoint(t, {
        status: "reconciling",
        error:
          "Lượt tạo ảnh bị gián đoạn sau khi gửi. Cần đối soát; không tự sinh lại.",
        release: true,
      });
      return null;
    }
    let inline = t.checkpoint.generatedImage;
    if (!inline) {
      const parts = [{ text: t.input.prompt }];
      for (let n = 0; n < (t.input.cast || []).length; n++) {
        const c = t.input.cast[n],
          file = path.join(dir, `ref-${n}`);
        const mime = await download(c.imageUrl, file, 20 * 1024 * 1024);
        parts.push(
          {
            text: `Ảnh tham chiếu ${n + 1} chỉ là ${c.name}. ${c.description}. Không thêm người ngoài danh sách.`,
          },
          {
            inlineData: {
              mimeType: mime,
              data: (await readFile(file)).toString("base64"),
            },
          },
        );
      }
      await checkpoint(t, { checkpoint: { submitting: true } });
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      });
      const response = await ai.models.generateContent({
        model: t.input.model,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: t.input.format, imageSize: "1K" },
          httpOptions: { timeout: 60000 },
        },
      });
      inline = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData,
      )?.inlineData;
      if (!inline?.data) throw new Error("AI chưa trả ảnh.");
      await checkpoint(t, {
        checkpoint: {
          generatedImage: { data: inline.data, mimeType: inline.mimeType },
        },
      });
    }
    const file = path.join(dir, "image.png");
    await writeFile(file, Buffer.from(inline.data, "base64"));
    const result = {
      path: await upload(t, file, "image.png", inline.mimeType || "image/png"),
      cast: t.input.cast,
      review: "pending_visual_review",
    };
    await checkpoint(t, {
      checkpoint: { persisted: result, generatedImage: null },
    });
    return result;
  }

  async function geminiTts(t, dir) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    let audio;
    if (t.provider_id) {
      const recovered = await readGeminiSpeech({
        apiKey,
        interactionId: t.provider_id,
      });
      if (recovered.pending) {
        await checkpoint(t, { release: true });
        return null;
      }
      audio = recovered.audio;
    } else {
      if (t.checkpoint.submitting) {
        await checkpoint(t, {
          status: "reconciling",
          error:
            "Lượt Gemini TTS bị gián đoạn sau khi gửi; không tự tạo lại để tránh tính phí trùng.",
          release: true,
        });
        return null;
      }
      await checkpoint(t, { checkpoint: { submitting: true } });
      const created = await createGeminiSpeech({
        apiKey,
        model: t.input.model,
        voice: t.input.providerInputs.voice,
        direction: t.input.providerInputs.direction,
        text: t.input.providerInputs.text,
      });
      if (created.interactionId)
        await checkpoint(t, {
          provider_id: created.interactionId,
          checkpoint: { interactionId: created.interactionId },
        });
      audio = created.audio;
    }
    if (!audio) throw new Error("Gemini TTS chưa trả audio.");
    const file = path.join(dir, "audio.wav");
    await writeFile(file, audio);
    const inspection = await probe(file);
    if (!inspection.audio || !Number.isFinite(inspection.duration))
      throw new Error("Gemini TTS trả file audio không hợp lệ.");
    const result = {
      path: await upload(t, file, "audio.wav", "audio/wav"),
      ...inspection,
      model: t.input.model,
      voice: t.input.providerInputs.voice,
      review: "pending_human_voice_review",
    };
    await checkpoint(t, { checkpoint: { persisted: result } });
    return result;
  }
  async function dub(t, dir) {
    const video = await source(t.input.videoTaskId, t.project_id);
    if (video.kind !== "video" || video.scene_id !== t.scene_id || video.scene_version !== t.scene_version || JSON.stringify(t.input.schedule) !== JSON.stringify(video.input.dubbingSchedule)) throw new Error("DUB_SOURCE_MISMATCH");
    const file = path.join(dir, "source.mp4");
    await checkpoint(t, {});
    await download(await sign(video.result.path, t.project_id), file, VIDEO_MAX_BYTES);
    const inspection = await probe(file), files = [];
    for (const [index, cue] of t.input.schedule.entries()) {
      await checkpoint(t, {});
      const audio = await source(cue.audioTaskId, t.project_id);
      validateDubCue(cue, audio, video, Number(audio.result.duration));
      const wav = path.join(dir, `line-${index}.wav`);
      await download(await sign(audio.result.path, t.project_id), wav, 64 * 1024 * 1024);
      const measured = await probe(wav);
      if (!measured.audio) throw new Error("DUB_AUDIO_MISSING");
      validateDubCue(cue, audio, video, measured.duration);
      files.push(wav);
    }
    await checkpoint(t, {});
    const output = path.join(dir, "dubbed.mp4");
    await ffmpeg(dubArguments(file, files, t.input.schedule, inspection.duration, output));
    await checkpoint(t, {});
    const checked = await probe(output);
    if (!checked.video || !checked.audio || checked.width !== inspection.width || checked.height !== inspection.height || Math.abs(checked.duration - inspection.duration) > 0.1) throw new Error("DUB_OUTPUT_INVALID");
    const result = { ...checked, path: await upload(t, output, "dubbed.mp4", "video/mp4"), schedule: t.input.schedule, review: "pending_speaker_and_lip_review", sourceVideoTaskId: video.id };
    await checkpoint(t, { checkpoint: { persisted: result } });
    return result;
  }
  async function render(t, dir) {
    await ensureDiskSpace(
      path.join(dir, "final.mp4"),
      VIDEO_MAX_BYTES * 2 + 128 * 1024 * 1024,
    );
    const clips = [],
      allSegments = [],
      editManifest = [];
    let offset = 0;
    for (let n = 0; n < t.input.clips.length; n++) {
      const spec = t.input.clips[n],
        clip = await source(spec.taskId, t.project_id);
      if (!clip.approved_at && !clip.auto_accepted_at)
        throw new Error("Clip chưa được duyệt hoặc qua kiểm tra tự động.");
      const original = path.join(dir, `source-${n}.mp4`),
        normalized = path.join(dir, `clip-${n}.mp4`);
      await download(
        await sign(clip.result.path, t.project_id),
        original,
        VIDEO_MAX_BYTES,
      );
      const transcript = spec.transcriptTaskId
        ? await source(spec.transcriptTaskId, t.project_id)
        : null;
      if (
        transcript &&
        (transcript.input.videoTaskId !== clip.id ||
          transcript.result.speechError > 0.2)
      )
        throw new Error("Lời thoại hoặc nguồn transcript chưa đạt để dựng.");
      const originalReport = await probe(original);
      const range = speechRange(
        originalReport.duration,
        transcript?.result.segments,
        spec.trimSpeech === true,
      );
      const report = await normalizeClip(
        original,
        normalized,
        t.input.format,
        t.input.resolution,
        range,
      );
      clips.push(normalized);
      if (transcript)
        allSegments.push(
          ...shiftTranscript(transcript.result.segments, range, offset),
        );
      editManifest.push({
        ...spec,
        ...range,
        sourceDuration: originalReport.duration,
        usedDuration: report.duration,
        timelineStart: offset,
      });
      offset += report.duration;
    }
    const list = path.join(dir, "clips.txt");
    await writeFile(list, clips.map((f) => `file '${f}'`).join("\n"));
    const srt = path.join(dir, "subtitles.srt");
    await writeFile(srt, subtitles(captionSegments(allSegments)));
    const merged = path.join(dir, "merged.mp4");
    await ffmpeg([
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
      merged,
    ]);
    const final = path.join(dir, "final.mp4"),
      args = ["-i", merged];
    const filters = [];
    const [w] = dimensions(t.input.format, t.input.resolution);
    const brand = t.input.brand;
    if (brand?.watermark_url) {
      const wm = path.join(dir, "watermark.png");
      await download(brand.watermark_url, wm, 10 * 1024 * 1024);
      args.push("-i", wm);
      const pos = brand.watermark_position || "bottom-right";
      const x = pos.includes("left")
        ? "24"
        : pos === "center"
          ? "(W-w)/2"
          : "W-w-24";
      const y = pos.includes("top")
        ? "24"
        : pos === "center"
          ? "(H-h)/2"
          : "H-h-24";
      filters.push(
        `[1:v]scale=${Math.round(w * 0.24)}:-1,format=rgba,colorchannelmixer=aa=${Math.max(0.05, Math.min(1, Number(brand.watermark_opacity || 0.8)))}[wm]`,
        `[0:v][wm]overlay=${x}:${y}[branded]`,
      );
    }
    const base = filters.length ? "[branded]" : "[0:v]";
    if (t.input.subtitles && allSegments.length)
      filters.push(
        `${base}subtitles=${srt}:force_style='FontName=Noto Sans,FontSize=20,Outline=1,MarginV=45'[out]`,
      );
    else filters.push(`${base}null[out]`);
    await ffmpeg([
      ...args,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-map",
      "0:a:0",
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
      final,
    ]);
    const report = await probe(final);
    checkVideo(report, t.input);
    if (!report.audio || Math.abs(report.duration - offset) > 0.5)
      throw new Error("Bản dựng sai thời lượng hoặc thiếu âm thanh.");
    const poster = path.join(dir, "poster.jpg");
    await ffmpeg(["-i", final, "-frames:v", "1", poster]);
    const result = {
      path: await upload(t, final, "final.mp4", "video/mp4"),
      poster: await upload(t, poster, "poster.jpg", "image/jpeg"),
      srt: await upload(t, srt, "subtitles.srt", "application/x-subrip"),
      ...report,
      manifest: editManifest,
      review: "pending_final_review",
    };
    await checkpoint(t, { checkpoint: { persisted: result } });
    return result;
  }
  async function qaContactSheet(t, video, dir, duration) {
    const frames = [];
    for (const [index, fraction] of [0.15, 0.5, 0.85].entries()) {
      const frame = path.join(dir, `qa-${index}.jpg`);
      await ffmpeg([
        "-ss",
        String(Math.max(0, Number(duration) * fraction)),
        "-i",
        video,
        "-frames:v",
        "1",
        "-vf",
        "scale=360:-2",
        frame,
      ]);
      frames.push(frame);
    }
    const sheet = path.join(dir, "qa-contact-sheet.jpg");
    await ffmpeg([
      "-i",
      frames[0],
      "-i",
      frames[1],
      "-i",
      frames[2],
      "-filter_complex",
      "[0:v][1:v][2:v]hstack=inputs=3[out]",
      "-map",
      "[out]",
      "-frames:v",
      "1",
      sheet,
    ]);
    return upload(t, sheet, "qa-contact-sheet.jpg", "image/jpeg");
  }
  async function processTask(t) {
    const dir = await mkdtemp(path.join(tmpdir(), "aida-film-"));
    let heartbeatBusy = false,
      lost = false;
    const timer = setInterval(async () => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      try {
        await checkpoint(t, {});
      } catch {
        lost = true;
      } finally {
        heartbeatBusy = false;
      }
    }, 30000);
    try {
      let result = t.checkpoint.persisted;
      if (!result) {
        if (t.kind === "image") result = await image(t, dir);
        else if (
          t.kind === "tts" &&
          GEMINI_TTS_MODEL_IDS.has(t.input.model)
        )
          result = await geminiTts(t, dir);
        else if (t.kind === "dub") result = await dub(t, dir);
        else if (t.kind === "render") result = await render(t, dir);
        else if (t.kind === "frame") {
          const clip = await source(t.input.videoTaskId, t.project_id);
          const file = path.join(dir, "clip.mp4"),
            frame = path.join(dir, "frame.png");
          await download(
            await sign(clip.result.path, t.project_id),
            file,
            VIDEO_MAX_BYTES,
          );
          await ffmpeg([
            "-sseof",
            "-0.12",
            "-i",
            file,
            "-frames:v",
            "1",
            frame,
          ]);
          result = {
            path: await upload(t, frame, "frame.png", "image/png"),
            fromTaskId: clip.id,
            cast: t.input.cast,
            review: "pending_visual_review",
          };
          await checkpoint(t, { checkpoint: { persisted: result } });
        } else {
          if (!t.provider_id) {
            await send(t, await prepareInputs(t));
            return;
          }
          const prediction =
            t.checkpoint.providerCompleted || (await getResult(t));
          if (
            ["failed", "cancelled", "timeout", "deleted"].includes(
              prediction.status,
            )
          ) {
            await checkpoint(t, {
              status: "failed",
              checkpoint: { definitiveFailure: true },
              error: `Provider kết thúc: ${prediction.status}`,
              release: true,
            });
            return;
          }
          if (prediction.status !== "completed") {
            await checkpoint(t, { release: true });
            return;
          }
          await checkpoint(t, {
            checkpoint: { providerCompleted: prediction },
          });
          const out = prediction.outputs?.[0];
          const url = typeof out === "string" ? out : out?.url;
          if (t.kind === "transcribe") {
            let data = out;
            if (typeof out === "string" && out.startsWith("https://")) {
              const file = path.join(dir, "transcript.json");
              await download(out, file, 5 * 1024 * 1024);
              data = await readFile(file, "utf8");
            }
            const parsed = parseTranscript(data, Number(t.input.duration));
            result = {
              ...parsed,
              speechError: speechError(t.input.dialogue, parsed.text),
              videoTaskId: t.input.videoTaskId,
              review: "pending_speaker_and_lips_review",
            };
          } else {
            if (!url) throw new Error("Provider chưa trả URL kết quả.");
            const audio = t.kind === "tts" || t.kind === "voice_design",
              file = path.join(dir, audio ? "audio.wav" : "video.mp4");
            await download(
              url,
              file,
              audio ? 100 * 1024 * 1024 : VIDEO_MAX_BYTES,
            );
            const inspection = await probe(file);
            if (audio) {
              if (!inspection.audio) throw new Error("TTS thiếu audio.");
            } else {
              checkVideo(inspection, t.input);
              if (t.kind === "lip_sync") {
                const original = await source(
                  t.input.videoTaskId,
                  t.project_id,
                );
                if (
                  !inspection.audio ||
                  inspection.width !== original.result.width ||
                  inspection.height !== original.result.height ||
                  Math.abs(inspection.duration - original.result.duration) > 0.5
                )
                  throw new Error(
                    "Đồng bộ môi làm thay đổi kích thước/thời lượng hoặc thiếu audio; cần kiểm tra.",
                  );
              }
            }
            const qaFramePath = audio
              ? undefined
              : await qaContactSheet(t, file, dir, inspection.duration);
            result = {
              path: await upload(
                t,
                file,
                audio ? "audio.wav" : "video.mp4",
                audio ? "audio/wav" : "video/mp4",
              ),
              ...inspection,
              ...(qaFramePath ? { qaFramePath } : {}),
              review: "pending_review",
            };
          }
          await checkpoint(t, { checkpoint: { persisted: result } });
        }
      }
      if (result && !lost) {
        const { data, error } = await db.rpc("complete_film_task", {
          p_id: t.id,
          p_owner: t.lease_owner,
          p_result: result,
        });
        if (error || !data)
          throw new LostLease("Không còn quyền hoàn tất task.");
      }
    } catch (e) {
      if (!(e instanceof LostLease) && !lost) {
        const uncertain =
          t.kind === "image" &&
          t.checkpoint.submitting &&
          !t.checkpoint.persisted &&
          !t.checkpoint.generatedImage;
        try {
          await checkpoint(t, {
            ...(uncertain
              ? { status: "reconciling" }
              : Number(t.checkpoint.failureCount || 0) >= 2
                ? { status: "failed" }
                : {}),
            checkpoint: {
              failureCount: Number(t.checkpoint.failureCount || 0) + 1,
            },
            error: e.message,
            release: true,
          });
        } catch {
          /* The new owner is responsible for recovery. */
        }
        console.error("Short film stage failed", {
          taskId: t.id,
          kind: t.kind,
          message: e.message,
        });
      }
    } finally {
      clearInterval(timer);
      await rm(dir, { recursive: true, force: true });
    }
  }
  async function tick(renderLane) {
    if (renderLane) {
      const { error: settleError } = await db.rpc("settle_film_failures");
      if (settleError) throw settleError;
    }
    const { data, error } = await db.rpc("claim_film_tasks", {
      p_render: renderLane,
      p_limit: renderLane ? 1 : 2,
    });
    if (error) throw error;
    await Promise.all((data || []).map(processTask));
  }
  return { tick };
}
