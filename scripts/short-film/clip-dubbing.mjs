import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGeminiSpeech, readGeminiSpeech } from "./gemini-tts.mjs";
import { download, ffmpeg, probe } from "./media.mjs";
import { dubArguments } from "./dubbing.mjs";
import { VIDEO_MAX_BYTES } from "./storage.mjs";
/** Checkpointed local dub of a standalone clip. No call here can regenerate video. */
export async function dubStandaloneClip({
  job,
  sourceUrl,
  save,
  persist,
  sign,
  apiKey,
  createSpeech = createGeminiSpeech,
  readSpeech = readGeminiSpeech,
  downloadMedia = download,
}) {
  const config = job.checkpoint.dubbing;
  if (job.checkpoint.dubbedOutput) return job.checkpoint.dubbedOutput;
  const dir = await mkdtemp(path.join(tmpdir(), "aida-clip-dub-"));
  try {
    const videoFile = path.join(dir, "source.mp4"),
      audioFile = path.join(dir, "voice.wav"),
      output = path.join(dir, "dubbed.mp4");
    await save({}); // Assert lease before any paid operation.
    await downloadMedia(
      job.checkpoint.rawVideoPath
        ? await sign(job.checkpoint.rawVideoPath)
        : sourceUrl,
      videoFile,
      VIDEO_MAX_BYTES,
    );
    const video = await probe(videoFile);
    if (!video.video) throw new Error("DUB_VIDEO_INVALID");
    if (!job.checkpoint.rawVideoPath) {
      const raw = await persist(videoFile, "source.mp4", "video/mp4");
      await save({ rawVideoPath: raw.storagePath });
    }
    if (job.checkpoint.dubAudioPath) {
      await downloadMedia(
        await sign(job.checkpoint.dubAudioPath),
        audioFile,
        64 * 1024 * 1024,
      );
    } else {
      let audio;
      if (job.checkpoint.dubInteractionId) {
        const recovered = await readSpeech({
          apiKey,
          interactionId: job.checkpoint.dubInteractionId,
        });
        if (recovered.pending) throw new Error("DUB_TTS_PENDING");
        audio = recovered.audio;
      } else {
        if (job.checkpoint.dubSubmitting)
          throw new Error(
            "DUB_TTS_RECONCILING: Không tự gửi lại TTS khi kết quả chưa rõ.",
          );
        await save({ dubSubmitting: true });
        const created = await createSpeech({
          apiKey,
          model: config.model,
          voice: config.voice,
          direction: config.direction,
          text: config.text,
        });
        audio = created.audio;
        if (created.interactionId)
          await save({ dubInteractionId: created.interactionId });
      }
      if (!audio) throw new Error("DUB_TTS_EMPTY");
      await writeFile(audioFile, audio);
      const saved = await persist(audioFile, "voice.wav", "audio/wav");
      await save({ dubAudioPath: saved.storagePath });
    }
    const voice = await probe(audioFile);
    if (!voice.audio || voice.duration + 0.1 > video.duration)
      throw new Error(
        "DUB_SPEECH_TOO_LONG: Thoại dài hơn clip. Clip gốc và audio đã được giữ; cần sửa trước khi ghép.",
      );
    await save({});
    await ffmpeg(
      dubArguments(
        videoFile,
        [audioFile],
        [
          {
            startSeconds: 0,
            endSeconds: video.duration,
            duration: voice.duration,
          },
        ],
        video.duration,
        output,
      ),
    );
    await save({});
    const checked = await probe(output);
    if (
      !checked.audio ||
      !checked.video ||
      checked.width !== video.width ||
      checked.height !== video.height ||
      Math.abs(checked.duration - video.duration) > 0.1
    )
      throw new Error("DUB_OUTPUT_INVALID");
    const saved = await persist(output, "video.mp4", "video/mp4");
    const result = {
      storagePath: saved.storagePath,
      duration: checked.duration,
      hasAudio: true,
      voiceProfileVersion: config.voiceProfileVersion,
      review: "pending_human_review",
    };
    await save({ dubbedOutput: result });
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
