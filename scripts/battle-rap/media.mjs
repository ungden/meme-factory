import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ffmpeg, probe, dimensions } from "../short-film/media.mjs";

function stamp(value) {
  const cs = Math.round(value * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
function escapeAss(value) {
  return String(value).replace(/\\/g, "＼").replace(/\{/g, "｛").replace(/\}/g, "｝").replace(/[\r\n]+/g, " ");
}
function wrap(value, width) {
  const words = escapeAss(value).split(/\s+/), lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).length > width && current) { lines.push(current); current = word; }
    else current += `${current ? " " : ""}${word}`;
  }
  if (current) lines.push(current);
  return lines.join("\\N");
}
export function assDocument({ title, cues, names = {}, format = "9:16", duration }) {
  const [w, h] = dimensions(format, "720p");
  const font = format === "9:16" ? 32 : 27;
  const rows = ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${w}`, `PlayResY: ${h}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"];
  for (const [name, color] of Object.entries({ A: "&H00FFE066", B: "&H0066BFFF", MC: "&H00FFFFFF", DJ: "&H00FFFFFF", crowd: "&H00FFFFFF" })) {
    rows.push(`Style: ${name},Noto Sans,${font},${color},${color},&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,2,1,2,45,45,${Math.round(h * 0.13)},1`);
  }
  rows.push(`Style: Title,Noto Sans,${font + 6},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,2,1,8,45,45,${Math.round(h * 0.09)},1`);
  rows.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
  rows.push(`Dialogue: 1,${stamp(0)},${stamp(Math.min(3.5, duration))},Title,,0,0,0,,${wrap(title, format === "9:16" ? 28 : 55)}`);
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > duration + 0.05) throw new Error("Lời có mốc thời gian không hợp lệ.");
    const name = names[cue.speaker] || (cue.speaker === "crowd" ? "" : cue.speaker);
    const label = name ? `${name}: ${cue.text}` : cue.text;
    rows.push(`Dialogue: 0,${stamp(cue.start)},${stamp(cue.end)},${["A", "B", "MC", "DJ", "crowd"].includes(cue.speaker) ? cue.speaker : "MC"},,0,0,0,,${wrap(label, format === "9:16" ? 35 : 65)}`);
  }
  return rows.join("\n") + "\n";
}

export async function normalizeClip(source, target, seconds, format) {
  const info = await probe(source);
  if (!info.video || info.duration < seconds - 0.15) throw new Error("Cảnh chưa đủ thời lượng cần dùng.");
  const [w, h] = dimensions(format, "720p");
  await ffmpeg(["-i", source, "-map", "0:v:0", "-an", "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`, "-t", String(seconds), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", target]);
}

export async function renderBattle({ clips, audio, cues, title, names, duration, format, dir }) {
  if (!clips.length || !cues.length) throw new Error("Chưa đủ video và lời để ghép bài.");
  const master = await probe(audio);
  if (!master.audio || Math.abs(master.duration - duration) > 0.1) throw new Error("Bản nhạc master đã đổi thời lượng; cần căn lại các cảnh.");
  const joined = path.join(dir, "joined.mp4"), manifest = path.join(dir, "concat.txt"), subtitles = path.join(dir, "lyrics.ass"), output = path.join(dir, "battle.mp4");
  if (clips.some(file => /['\r\n]/.test(file))) throw new Error("Tên tệp video chưa hợp lệ.");
  await writeFile(manifest, clips.map(file => `file '${file}'`).join("\n"));
  await writeFile(subtitles, assDocument({ title, cues, names, duration, format }));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", manifest, "-map", "0:v:0", "-an", "-c:v", "copy", joined]);
  const joinedInfo = await probe(joined);
  if (joinedInfo.duration < duration - 0.1) throw new Error("Tổng cảnh chưa phủ hết bài nhạc.");
  const filterPath = subtitles.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  await ffmpeg(["-i", joined, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-vf", `ass='${filterPath}'`, "-t", String(duration), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
  const info = await probe(output);
  if (!info.video || !info.audio || Math.abs(info.duration - duration) > 0.15) throw new Error("Bài ghép chưa đạt kiểm tra thời lượng và âm thanh.");
  return { output, duration: info.duration };
}
