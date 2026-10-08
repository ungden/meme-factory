import { describe, expect, it } from "vitest";
import { nativeSampleWindow, pickNativeVoiceSamples, wavDurationSeconds } from "./native-voice";

const clip = {
  id: "t1",
  kind: "video",
  status: "completed",
  input: { audioMode: "native", providerInputs: { generate_audio: true, duration: 15 } },
  result: { path: "p/films/t1/video.mp4", duration: 15 },
};

describe("giọng mẫu lấy từ clip", () => {
  it("nhận một đoạn 3–10 giây trong clip native đã xong", () => {
    expect(nativeSampleWindow(clip, 2.123, 8.5)).toEqual({ ok: true, inSeconds: 2.12, outSeconds: 8.5 });
  });

  // Clip lồng tiếng mang giọng TTS người lớn; lấy làm mẫu thì bé nói giọng người lớn.
  it("từ chối clip lồng tiếng và đoạn quá ngắn, quá dài hay vượt cuối clip", () => {
    expect(nativeSampleWindow({ ...clip, input: { audioMode: "dubbed", providerInputs: {} } }, 0, 5).ok).toBe(false);
    expect(nativeSampleWindow(clip, 1, 3).ok).toBe(false);
    expect(nativeSampleWindow(clip, 0, 11).ok).toBe(false);
    expect(nativeSampleWindow(clip, 12, 16).ok).toBe(false);
    expect(nativeSampleWindow(null, 0, 5).ok).toBe(false);
  });
});

describe("AI tự chọn giọng chuẩn sau phim tự nói", () => {
  const beat = (speakerCharacterId: string | null, startSeconds: number, endSeconds: number, dialogue = "câu") => ({
    speakerCharacterId,
    dialogue,
    startSeconds,
    endSeconds,
  });
  const scenes = [
    { id: "solo", storyboard: { durationSeconds: 15, beats: [beat("do", 0, 2.5), beat("do", 2.5, 6), beat(null, 6, 8, "")] } },
    { id: "duo", storyboard: { durationSeconds: 15, beats: [beat("do", 0, 8), beat("bao", 8, 14)] } },
    { id: "long", storyboard: { durationSeconds: 15, beats: [beat("bao", 0, 14)] } },
  ];
  const clip = (id: string, scene_id: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: "video",
    scene_id,
    status: "completed",
    created_at: "2026-10-08T00:00:00Z",
    auto_accepted_at: "2026-10-08T00:01:00Z",
    input: { audioMode: "native" },
    ...extra,
  });

  // Clip hai người: mốc dự kiến có thể rơi vào giọng bé kia, nên không bao giờ lấy.
  it("chỉ lấy clip một người nói; clip nhiều người bị bỏ qua", () => {
    const picked = pickNativeVoiceSamples(scenes, [clip("v1", "solo"), clip("v2", "duo")], ["do", "bao"]);
    expect(picked).toEqual([{ characterId: "do", sourceTaskId: "v1", inSeconds: 0, outSeconds: 6 }]);
  });

  it("cắt theo mốc lời nói thật trong bản chép lời, tối đa 10 giây", () => {
    const transcript = {
      id: "t3",
      kind: "transcribe",
      scene_id: "long",
      status: "completed",
      created_at: "2026-10-08T00:02:00Z",
      input: { videoTaskId: "v3" },
      result: { segments: [{ start: 1.2, end: 4, text: "a" }, { start: 4.3, end: 9.8, text: "b" }, { start: 10, end: 13.5, text: "c" }] },
    };
    expect(pickNativeVoiceSamples(scenes, [clip("v3", "long"), transcript], ["bao"])).toEqual([
      { characterId: "bao", sourceTaskId: "v3", inSeconds: 1.2, outSeconds: 9.8 },
    ]);
  });

  it("bỏ qua clip chưa qua kiểm tra, clip lồng tiếng và người đã có giọng", () => {
    expect(
      pickNativeVoiceSamples(
        scenes,
        [clip("v1", "solo", { auto_accepted_at: null }), clip("v3", "long", { input: { audioMode: "dubbed" } })],
        ["do", "bao"],
      ),
    ).toEqual([]);
    expect(pickNativeVoiceSamples(scenes, [clip("v1", "solo")], ["bao"])).toEqual([]);
  });
});

describe("độ dài file WAV", () => {
  function wav(seconds: number, sampleRate = 16000) {
    const data = seconds * sampleRate * 2;
    const buffer = new ArrayBuffer(44 + data);
    const view = new DataView(buffer);
    const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + data, true); write(8, "WAVE");
    write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, "data"); view.setUint32(40, data, true);
    return new Uint8Array(buffer);
  }
  it("đọc đúng số giây từ header, từ chối file không phải WAV", () => {
    expect(wavDurationSeconds(wav(6))).toBeCloseTo(6, 3);
    expect(wavDurationSeconds(new Uint8Array(60))).toBeNull();
  });
});
