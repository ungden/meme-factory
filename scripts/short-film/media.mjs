import { createWriteStream, createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureDiskSpace } from "./storage.mjs";
const exec = promisify(execFile);
export async function ffmpeg(args) {
  return exec(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "2",
      "-filter_threads",
      "1",
      "-filter_complex_threads",
      "1",
      ...args.slice(0, -1),
      "-threads",
      "2",
      args.at(-1),
    ],
    {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 300000,
    },
  );
}
export async function probe(file) {
  const { stdout } = await exec(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels",
      "-of",
      "json",
      file,
    ],
    { timeout: 30000 },
  );
  const j = JSON.parse(stdout);
  const v = j.streams?.find((s) => s.codec_type === "video"),
    a = j.streams?.find((s) => s.codec_type === "audio");
  const duration = Number(j.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Media không có thời lượng hợp lệ.");
  return {
    duration,
    width: v?.width,
    height: v?.height,
    video: !!v,
    audio: !!a,
    videoCodec: v?.codec_name,
    audioCodec: a?.codec_name,
  };
}
export function dimensions(format, resolution) {
  const unit = resolution === "1080p" ? 1080 : 720;
  return format === "1:1"
    ? [unit, unit]
    : format === "16:9"
      ? [Math.round((unit * 16) / 9), unit]
      : format === "4:5"
        ? [unit, (unit * 5) / 4]
        : [unit, Math.round((unit * 16) / 9)];
}
function unsafe(address) {
  if (address.includes(":")) return !/^2|^3/.test(address);
  return /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|22[4-9]|23\d|24\d|25[0-5])\./.test(
    address,
  );
}
export async function safeFetch(url, limit = 100 * 1024 * 1024) {
  let current = url;
  for (let i = 0; i < 4; i++) {
    const u = new URL(current);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443")
    )
      throw new Error("URL media không hợp lệ.");
    const addresses = isIP(u.hostname)
      ? [{ address: u.hostname }]
      : await lookup(u.hostname, { all: true });
    if (!addresses.length || addresses.some((x) => unsafe(x.address)))
      throw new Error("Địa chỉ media không được phép.");
    // Connect to the validated DNS result; a second lookup must not bypass the
    // private-address check while the request still uses the original TLS host.
    const pinned = addresses[0];
    const incoming = await new Promise((resolve, reject) => {
      const req = httpsRequest(
        u,
        {
          signal: AbortSignal.timeout(120000),
          lookup: (_host, options, callback) => {
            const value = {
              address: pinned.address,
              family: isIP(pinned.address),
            };
            if (options.all) callback(null, [value]);
            else callback(null, value.address, value.family);
          },
        },
        resolve,
      );
      req.on("error", reject);
      req.end();
    });
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const r = new Response(Readable.toWeb(incoming), {
      status: incoming.statusCode,
      headers,
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body.cancel();
      current = new URL(r.headers.get("location"), current).href;
      continue;
    }
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      throw new Error(`Không tải được media (${r.status}).`);
    }
    if (Number(r.headers.get("content-length")) > limit) {
      await r.body.cancel();
      throw new Error("Media vượt giới hạn.");
    }
    return r;
  }
  throw new Error("Media chuyển hướng quá nhiều.");
}
export async function writeBodyWithLimit(body, file, limit) {
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(body),
    new Transform({
      transform(chunk, encoding, cb) {
        bytes += chunk.length;
        cb(
          bytes > limit ? new Error("Media vượt giới hạn thực đọc.") : null,
          chunk,
        );
      },
    }),
    createWriteStream(file),
  );
  return bytes;
}
export async function download(url, file, limit = 100 * 1024 * 1024) {
  const r = await safeFetch(url, limit);
  const declared = Number(r.headers.get("content-length"));
  await ensureDiskSpace(
    file,
    (Number.isFinite(declared) && declared > 0 ? declared : limit) +
      64 * 1024 * 1024,
  );
  await writeBodyWithLimit(r.body, file, limit);
  return (
    r.headers.get("content-type")?.split(";")[0] || "application/octet-stream"
  );
}
export function checkVideo(report, input) {
  if (!report.video) throw new Error("Thiếu video stream.");
  if (input.resolution) {
    const wanted = dimensions(input.format, input.resolution);
    if (Math.abs(report.width / report.height - wanted[0] / wanted[1]) > 0.04)
      throw new Error("Video trả về sai tỷ lệ.");
    // Provider resolution is a quality tier. Seedance may return a codec-safe
    // dimension a few percent below the nominal short edge; the render stage
    // always normalizes accepted clips to the exact project dimensions.
    const nominal = input.resolution === "1080p" ? 1080 : 720;
    if (Math.min(report.width, report.height) < Math.round(nominal * 0.94))
      throw new Error("Video trả về không đủ độ phân giải.");
  }
  if (
    input.providerInputs?.duration &&
    Math.abs(report.duration - input.providerInputs.duration) > 0.8
  )
    throw new Error("Video trả về sai thời lượng.");
  if (input.providerInputs?.generate_audio && !report.audio)
    throw new Error("Video thiếu audio được yêu cầu.");
}
export function parseTranscript(value, duration) {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  const j = raw?.data || raw;
  let entries = j?.segments || j?.chunks || j?.words;
  if (!Array.isArray(entries))
    throw new Error("ASR chưa trả timestamp để làm phụ đề.");
  const segments = entries
    .map((x) => ({
      text: String(x.text || x.word || "").trim(),
      start: Number(x.start ?? x.timestamp?.[0]),
      end: Number(x.end ?? x.timestamp?.[1]),
    }))
    .filter((x) => x.text);
  if (
    !segments.length ||
    segments.some(
      (s, i) =>
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.start < 0 ||
        s.end <= s.start ||
        s.end > duration + 0.25 ||
        (i > 0 && s.start < segments[i - 1].start),
    )
  )
    throw new Error("Timestamp ASR không hợp lệ.");
  return { text: segments.map((s) => s.text).join(" "), segments };
}
export function speechError(expected, actual) {
  const clean = (t) =>
    t
      .toLowerCase()
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const a = clean(expected),
    b = clean(actual);
  let row = b.map((_, i) => i + 1);
  row.unshift(0);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length] / Math.max(1, a.length);
}
export function srtTimestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function subtitles(segments) {
  return segments
    .map((s, i) => {
      const words = s.text.replace(/[<>\r\n]/g, " ").split(/\s+/);
      if (words.join(" ").length > 100)
        throw new Error(
          "Câu phụ đề quá dài, cần chia theo timestamp trước khi dựng.",
        );
      let first = "",
        second = "";
      for (const w of words) {
        if (!second && `${first} ${w}`.trim().length <= 48)
          first = `${first} ${w}`.trim();
        else second = `${second} ${w}`.trim();
      }
      if (second.length > 55) throw new Error("Phụ đề vượt hai dòng.");
      return `${i + 1}\n${srtTimestamp(s.start)} --> ${srtTimestamp(s.end)}\n${first}${second ? "\n" + second : ""}\n`;
    })
    .join("\n");
}
export function captionSegments(segments) {
  const out = [];
  let current;
  for (const s of segments) {
    if (
      !current ||
      current.text.length + s.text.length > 72 ||
      s.end - current.start > 4
    ) {
      current = { ...s };
      out.push(current);
    } else {
      current.text += " " + s.text;
      current.end = s.end;
    }
  }
  return out;
}
export async function normalizeClip(source, target, format, resolution, range) {
  const [w, h] = dimensions(format, resolution);
  const p = await probe(source);
  const start = range?.inSeconds ?? 0,
    end = range?.outSeconds ?? p.duration;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > p.duration + 0.05
  )
    throw new Error("INVALID_EDIT_RANGE");
  const args = ["-i", source];
  if (!p.audio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push(
    "-ss",
    String(start),
    "-map",
    "0:v:0",
    "-map",
    p.audio ? "0:a:0" : "1:a:0",
    "-vf",
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(end - start),
    "-movflags",
    "+faststart",
    target,
  );
  await ffmpeg(args);
  return probe(target);
}
export { readFile, writeFile, createReadStream };
