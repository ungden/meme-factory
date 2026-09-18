/**
 * Soi một tập phim đã ghép: thời lượng, các mốc cắt cảnh, mức âm thanh,
 * và bản ghi lời thoại nghe được (để so với kịch bản).
 * Dùng: railway run node scripts/.inspect-film.mjs <renderTaskId> <outDir>
 */
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";

const run = promisify(execFile);
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const [taskId, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const { data: task } = await db
  .from("short_film_tasks")
  .select("id, plan_id, result")
  .eq("id", taskId)
  .single();
const path = task.result?.path;
const { data: signed } = await db.storage.from("content-media").createSignedUrl(path, 900);
const mp4 = `${outDir}/film.mp4`;
await writeFile(mp4, Buffer.from(await (await fetch(signed.signedUrl)).arrayBuffer()));

const probe = JSON.parse(
  (await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", mp4])).stdout,
);
console.log("thời lượng:", Number(probe.format.duration).toFixed(2), "giây");

// Mốc cắt cảnh: thay đổi khung hình lớn.
const cuts = (await run("ffmpeg", ["-v", "error", "-i", mp4, "-filter:v", "select='gt(scene,0.4)',showinfo", "-f", "null", "-"]).catch((e) => ({ stderr: e.stderr || "" })))
  .stderr.split("\n")
  .map((line) => line.match(/pts_time:([0-9.]+)/)?.[1])
  .filter(Boolean);
console.log("mốc cắt cảnh:", cuts.length ? cuts.join(", ") : "không phát hiện");

// Mức âm thanh tổng thể.
const vol = (await run("ffmpeg", ["-v", "error", "-i", mp4, "-af", "volumedetect", "-f", "null", "-"]).catch((e) => ({ stderr: e.stderr || "" }))).stderr;
console.log(vol.split("\n").filter((l) => l.includes("volume:")).join("\n"));

// Ảnh chụp lưới để nhìn nhân vật qua các cảnh.
const sheet = `${outDir}/sheet.png`;
await run("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vf", "fps=1/2,scale=320:-1,tile=4x4", "-frames:v", "1", sheet]);
console.log("lưới khung hình:", sheet);

// Nghe lại lời thoại.
const wav = `${outDir}/audio.mp3`;
await run("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", wav]);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const audio = await readFile(wav);
const res = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: [
    { text: "Ghi lại CHÍNH XÁC mọi lời tiếng Việt nghe được, mỗi câu một dòng kèm mốc thời gian gần đúng dạng [mm:ss]. Nếu một đoạn không có lời, ghi [mm:ss] (không lời)." },
    { inlineData: { mimeType: "audio/mp3", data: audio.toString("base64") } },
  ],
});
console.log("\n--- nghe được ---\n" + (res.text || "(không có)"));
