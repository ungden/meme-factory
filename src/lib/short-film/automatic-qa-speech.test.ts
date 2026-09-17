import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilmTask } from "./contracts";

const heard = vi.hoisted(() => ({ text: "" }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: async () => ({ text: JSON.stringify({ text: heard.text }) }) };
  },
  ThinkingLevel: { LOW: "LOW" },
}));
vi.mock("@/lib/server-secrets", () => ({ getGeminiApiKey: async () => "test" }));

import { speechWordError, verifyUnreadableSpeech } from "./automatic-qa";

const transcribe: FilmTask = {
  id: "t",
  kind: "transcribe",
  scene_id: "s0",
  scene_version: 1,
  plan_version: 1,
  status: "completed",
  input: { audioMode: "dubbed", dialogue: "Bố chạy nhanh lên, máy bay cất cánh vù vù!", videoTaskId: "dub" },
  result: { asrIssue: "Timestamp ASR không hợp lệ.", transcriptSource: "locked_tts_schedule", speechError: 1 },
  error: null,
  approved_at: null,
  created_at: new Date().toISOString(),
};

afterEach(() => vi.unstubAllGlobals());

// Whisper từng trả "Hãy subscribe cho kênh…" cho clip mở bằng nhịp không lời;
// mỗi tập phải có người nghe lại. Gemini chép lời để tự đạt khi khớp kịch bản.
describe("unreadable dubbed speech", () => {
  it("passes when a second listener hears the scripted line", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } }));
    heard.text = "Bố chạy nhanh lên máy bay cất cánh vù vù";
    expect((await verifyUnreadableSpeech(transcribe, "https://media/dub")).status).toBe("passed");
    heard.text = "Hãy subscribe cho kênh Ghiền Mì Gõ";
    expect((await verifyUnreadableSpeech(transcribe, "https://media/dub")).status).toBe("needs_review");
  });

  it("measures word error independent of punctuation and case", () => {
    expect(speechWordError("Bố sao vậy?", "bố sao vậy")).toBe(0);
    expect(speechWordError("Bố sao vậy?", "")).toBe(1);
  });
});
