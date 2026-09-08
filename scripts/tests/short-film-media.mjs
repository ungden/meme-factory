import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ffmpeg,
  normalizeClip,
  probe,
  writeFile,
  subtitles,
} from "../short-film/media.mjs";
const dir = await mkdtemp(path.join(tmpdir(), "aida-media-test-"));
try {
  const source = path.join(dir, "source.mp4"),
    silent = path.join(dir, "silent.mp4"),
    a = path.join(dir, "a.mp4"),
    b = path.join(dir, "b.mp4");
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=360x640:r=24:d=1.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=gray:s=360x640:r=24:d=1.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    silent,
  ]);
  const trimmed = path.join(dir, "trimmed.mp4");
  await normalizeClip(source, trimmed, "9:16", "720p", {
    inSeconds: 0.2,
    outSeconds: 1,
  });
  const trimmedProbe = await probe(trimmed);
  assert.ok(Math.abs(trimmedProbe.duration - 0.8) < 0.1);
  assert.equal(trimmedProbe.audio, true);
  await normalizeClip(source, a, "9:16", "1080p");
  await normalizeClip(silent, b, "9:16", "1080p");
  const list = path.join(dir, "list.txt");
  await writeFile(list, `file '${a}'\nfile '${b}'\n`);
  const srt = path.join(dir, "subtitles.srt");
  await writeFile(
    srt,
    subtitles([
      { start: 0, end: 1, text: "Bánh Bao & Đậu Đỏ" },
      { start: 1.2, end: 2.3, text: "Cả nhà cùng làm bánh!" },
    ]),
  );
  const result = path.join(dir, "final.mp4");
  await ffmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    `subtitles=${srt}`,
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
    result,
  ]);
  const p = await probe(result);
  assert.equal(p.width, 1080);
  assert.equal(p.height, 1920);
  assert.equal(p.audio, true);
  assert.ok(Math.abs(p.duration - 2.4) < 0.2);
  console.log(
    "PASS: 1080x1920, silent + audio clips, Vietnamese subtitles, AAC, duration",
    p.duration,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
