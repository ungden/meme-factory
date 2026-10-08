import { describe, expect, it } from "vitest";
import { nativeSampleWindow } from "./native-voice";

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
