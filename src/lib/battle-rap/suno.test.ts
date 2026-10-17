import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { pollMusic, submitMusic, sunoConfigured, timestampedLyrics } from "./suno";
import { briefFixture, input } from "./test-fixtures";
const fetchMock = vi.fn();
describe("SunoAPI adapter", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); vi.stubEnv("SUNO_API_KEY", "test-key"); vi.stubEnv("SUNO_API_BASE_URL", "https://music.example.invalid"); vi.stubEnv("SUNO_MODEL", "V6"); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("submits exact custom lyrics and style with explicit duration", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { taskId: "track-job" } })));
    expect(await submitMusic(briefFixture(), input, "https://app.example.invalid/callback")).toBe("track-job");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.customMode).toBe(true); expect(body.instrumental).toBe(false);
    expect(body.lyrics).toBe(briefFixture().suno.lyrics); expect(body.style).toBe(briefFixture().suno.style);
    expect(body.duration).toBe(90); expect(body.model).toBe("V6");
  });
  it("waits for complete results and selects the duration closest to the brief", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { status: "FIRST_SUCCESS" } })));
    expect(await pollMusic("track-job", 90)).toBe(null);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { status: "SUCCESS", response: { sunoData: [{ id: "long", audio_url: "https://cdn.example.invalid/long.mp3", duration: 200 }, { id: "near", audio_url: "https://cdn.example.invalid/near.mp3", duration: 91 }] } } })));
    expect((await pollMusic("track-job", 90))?.audioId).toBe("near");
  });
  it("reads real timestamped lyrics for the selected track", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { alignedWords: [{ word: "Xin", startS: 1, endS: 1.3 }] } })));
    await timestampedLyrics({ taskId: "track-job", audioId: "selected-track", duration: 90 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ taskId: "track-job", audioId: "selected-track" });
  });
  it("reports confirmed provider failure and rejects an insecure configured endpoint", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { status: "GENERATE_AUDIO_FAILED" } })));
    await expect(pollMusic("track-job", 90)).rejects.toThrow(/thất bại/);
    vi.stubEnv("SUNO_API_BASE_URL", "http://music.example.invalid");
    await expect(pollMusic("track-job", 90)).rejects.toThrow(/bảo mật/);
  });
  it("has a deliberate manual bridge when no music key exists", () => {
    vi.stubEnv("SUNO_API_KEY", ""); expect(sunoConfigured()).toBe(false);
  });
});
