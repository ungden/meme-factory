import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilmTask } from "./contracts";

const sent = vi.hoisted(() => ({ parts: [] as Array<Record<string, unknown>> }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (r: { contents: { parts: Array<Record<string, unknown>> }[] }) => {
        sent.parts = r.contents[0].parts;
        return { text: JSON.stringify({ status: "passed", issues: [], summary: "ok", requirementResults: [] }) };
      },
    };
  },
  ThinkingLevel: { LOW: "LOW" },
}));
vi.mock("@/lib/server-secrets", () => ({ getGeminiApiKey: async () => "test" }));

import { checkVisualTask } from "./automatic-qa";

const video: FilmTask = {
  id: "t",
  kind: "video",
  scene_id: "s2",
  scene_version: 1,
  plan_version: 1,
  status: "completed",
  input: { audioMode: "dubbed" },
  result: { qaPreviewPath: "p.mp4" },
  error: null,
  approved_at: null,
  created_at: new Date().toISOString(),
};

afterEach(() => vi.unstubAllGlobals());

describe("video continuity check", () => {
  // Tập "Cát bay vào mắt": các clip sinh độc lập nên Bố đang cõng con thành con
  // đứng dưới đất, chân trần thành đi giày mà QA từng clip không thấy.
  it("sends the approved previous scene as continuity evidence", async () => {
    vi.stubGlobal("fetch", async (url: string) => new Response(new TextEncoder().encode(url), { headers: { "content-type": "image/jpeg" } }));
    await checkVisualTask(video, "https://media/clip", ["https://media/ref"], {
      contactSheetUrl: "https://media/previous-sheet",
      action: "Bố cõng Đậu Đỏ đi dọc mép nước",
      setting: "Bãi biển lúc hoàng hôn",
    });
    const texts = sent.parts.map((part) => String(part.text || "")).join("\n");
    expect(texts).toContain("LIÊN TỤC VỚI CẢNH LIỀN TRƯỚC");
    expect(texts).toContain("Bố cõng Đậu Đỏ đi dọc mép nước");
    const last = sent.parts.at(-1) as { inlineData?: { data: string } };
    expect(Buffer.from(last.inlineData!.data, "base64").toString()).toBe("https://media/previous-sheet");
  });

  it("checks a clip alone when no previous scene is approved", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }));
    await checkVisualTask(video, "https://media/clip", []);
    expect(sent.parts.map((part) => String(part.text || "")).join("\n")).not.toContain("LIÊN TỤC");
  });
});
