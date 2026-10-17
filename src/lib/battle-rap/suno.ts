import "server-only";
import type { BattleBrief, BattleInput, Music } from "./contracts";

/** Adapter cho dịch vụ trung gian SunoAPI; không phải API chính thức của Suno. */
export function sunoConfigured() { return Boolean(process.env.SUNO_API_KEY?.trim()); }
async function request(path: string, body?: unknown) {
  const base = process.env.SUNO_API_BASE_URL || "https://apibox.erweima.ai";
  const url = new URL(path, base);
  if (url.protocol !== "https:") throw new Error("Dịch vụ nhạc cần dùng kết nối bảo mật.");
  if (!sunoConfigured()) throw new Error("Chưa kết nối dịch vụ nhạc.");
  const response = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const json = await response.json();
  if (!response.ok || json.code !== 200) throw new Error("Dịch vụ nhạc chưa xử lý được yêu cầu.");
  return json.data;
}
export async function submitMusic(brief: BattleBrief, input: BattleInput, callback: string): Promise<string> {
  const data = await request("/api/v1/generate", { customMode: true, instrumental: false, title: brief.suno.title, style: brief.suno.style, lyrics: brief.suno.lyrics, prompt: brief.suno.lyrics, model: process.env.SUNO_MODEL || "V6", duration: input.targetSeconds, callBackUrl: callback });
  if (!data?.taskId || typeof data.taskId !== "string") throw new Error("Dịch vụ nhạc chưa trả mã theo dõi.");
  return data.taskId;
}
export async function pollMusic(taskId: string, target: number): Promise<Music | null> {
  const data = await request(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "SENSITIVE_WORD_ERROR"].includes(data.status)) throw new Error("Dịch vụ nhạc báo làm bài thất bại.");
  if (data.status !== "SUCCESS") return null;
  const tracks = (data.response?.sunoData || []).filter((t: Record<string, unknown>) => typeof t.id === "string" && typeof t.audio_url === "string" && Number(t.duration) >= 10 && Number(t.duration) <= 360) as { id: string; audio_url: string; duration: number }[];
  tracks.sort((a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target));
  if (!tracks.length) throw new Error("Dịch vụ nhạc chưa trả bản âm thanh hoàn chỉnh.");
  const track = tracks[0];
  return { taskId, audioId: track.id, sourceUrl: track.audio_url, duration: track.duration };
}
export async function timestampedLyrics(music: Music): Promise<unknown> {
  if (!music.taskId || !music.audioId) throw new Error("Bản nhạc này cần tải lời có thời gian lên.");
  const data = await request("/api/v1/generate/get-timestamped-lyrics", { taskId: music.taskId, audioId: music.audioId });
  return data.alignedWords;
}
