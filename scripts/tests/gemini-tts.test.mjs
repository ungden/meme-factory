import { describe, expect, it, vi } from "vitest";
import {
  createGeminiSpeech,
  pcmToWav,
} from "../short-film/gemini-tts.mjs";

const pcm = Buffer.alloc(4800, 1).toString("base64");

function response(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

describe("Gemini TTS", () => {
  it("wraps 24 kHz mono PCM in a valid WAV container", () => {
    const wav = pcmToWav(Buffer.alloc(4800, 1));
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(4800);
  });

  it("uses the Interactions contract for Gemini 3.1 TTS", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        id: "interaction-1",
        output_audio: {
          type: "audio",
          data: pcm,
          mime_type: "audio/l16",
          sample_rate: 24000,
          channels: 1,
        },
      }),
    );
    const result = await createGeminiSpeech({
      apiKey: "test",
      model: "gemini-3.1-flash-tts-preview",
      voice: "Leda",
      direction: "Giọng bé gái Việt Nam.",
      text: "Xin chào.",
      fetchImpl,
    });
    expect(result.interactionId).toBe("interaction-1");
    expect(result.audio.subarray(0, 4).toString()).toBe("RIFF");
    const [, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.response_format).toEqual({ type: "audio" });
    expect(body.generation_config.speech_config[0]).toMatchObject({
      voice: "Leda",
      language: "vi-VN",
    });
  });

  it("uses generateContent for Gemini 2.5 TTS", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: pcm,
                    mimeType: "audio/L16;codec=pcm;rate=24000",
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    await createGeminiSpeech({
      apiKey: "test",
      model: "gemini-2.5-pro-preview-tts",
      voice: "Puck",
      direction: "Giọng bé trai Việt Nam.",
      text: "Xin chào.",
      fetchImpl,
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("gemini-2.5-pro-preview-tts:generateContent");
    const body = JSON.parse(options.body);
    expect(
      body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName,
    ).toBe("Puck");
  });

  it("returns an explicit status for a rejected request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "audio stream rejected" } }),
    }));
    await expect(
      createGeminiSpeech({
        apiKey: "test",
        model: "gemini-3.1-flash-tts-preview",
        voice: "Aoede",
        direction: "Nói tỉnh bơ.",
        text: "Chuyên gia có khác.",
        fetchImpl,
      }),
    ).rejects.toThrow("Gemini TTS 400: audio stream rejected");
  });
});
