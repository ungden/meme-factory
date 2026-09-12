const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_TTS_MODEL_IDS = new Set([
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-pro-preview-tts",
  "gemini-2.5-flash-preview-tts",
]);

function findAudio(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (
    typeof value.data === "string" &&
    (value.type === "audio" ||
      String(value.mime_type || value.mimeType || "").startsWith("audio/"))
  )
    return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findAudio(item, seen);
        if (found) return found;
      }
    } else {
      const found = findAudio(child, seen);
      if (found) return found;
    }
  }
  return null;
}

export function pcmToWav(pcm, sampleRate = 24000, channels = 1) {
  const bitDepth = 16;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitDepth) / 8, 28);
  header.writeUInt16LE((channels * bitDepth) / 8, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function decodeAudio(response) {
  const audio = findAudio(response);
  if (!audio?.data) throw new Error("Gemini TTS chưa trả audio.");
  const bytes = Buffer.from(audio.data, "base64");
  const mime = String(audio.mime_type || audio.mimeType || "audio/l16");
  if (mime.includes("wav") || bytes.subarray(0, 4).toString() === "RIFF")
    return bytes;
  return pcmToWav(
    bytes,
    Number(audio.sample_rate || audio.sampleRate || 24000),
    Number(audio.channels || 1),
  );
}

async function request(url, options, fetchImpl) {
  const { apiKey, headers, ...requestOptions } = options;
  const response = await fetchImpl(url, {
    ...requestOptions,
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `Gemini TTS ${response.status}: ${json.error?.message || "yêu cầu bị từ chối"}`,
    );
  return json;
}

export async function createGeminiSpeech({
  apiKey,
  model,
  voice,
  direction,
  text,
  previousInteractionId,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("Worker thiếu GEMINI_API_KEY.");
  if (!GEMINI_TTS_MODEL_IDS.has(model))
    throw new Error("Model Gemini TTS không được hỗ trợ.");
  const input = [
    "Synthesize one Vietnamese speaker reading the transcript exactly. Return audio only.",
    "### AUDIO PROFILE AND DIRECTOR'S NOTES",
    direction,
    "### TRANSCRIPT — SPEAK ONLY THE TEXT BELOW",
    text,
  ].join("\n\n");
  if (model === "gemini-3.1-flash-tts-preview") {
    const json = await request(
      `${BASE}/interactions`,
      {
        method: "POST",
        apiKey,
        headers: { "Api-Revision": "2026-05-20" },
        body: JSON.stringify({
          model,
          input,
          ...(previousInteractionId
            ? { previous_interaction_id: previousInteractionId }
            : {}),
          response_format: { type: "audio" },
          generation_config: {
            speech_config: [{ voice, language: "vi-VN" }],
          },
        }),
      },
      fetchImpl,
    );
    return {
      interactionId: json.id || json.interaction?.id || null,
      audio: decodeAudio(json.interaction || json),
    };
  }
  const json = await request(
    `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      apiKey,
      body: JSON.stringify({
        contents: [{ parts: [{ text: input }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
    },
    fetchImpl,
  );
  return { interactionId: null, audio: decodeAudio(json) };
}

export async function readGeminiSpeech({ apiKey, interactionId, fetchImpl = fetch }) {
  const json = await request(
    `${BASE}/interactions/${encodeURIComponent(interactionId)}`,
    {
      method: "GET",
      apiKey,
      headers: { "Api-Revision": "2026-05-20" },
    },
    fetchImpl,
  );
  const status = String(json.status || json.interaction?.status || "").toLowerCase();
  if (status && !["completed", "succeeded", "success"].includes(status))
    return { pending: true, audio: null };
  return { pending: false, audio: decodeAudio(json.interaction || json) };
}
