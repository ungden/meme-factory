import { describe, expect, it } from "vitest";
import { nativeSampleWindow, pickNativeVoiceSamples } from "./native-voice";

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
    { id: "s1", storyboard: { durationSeconds: 15, beats: [beat("do", 0, 2.5), beat("do", 2.5, 6), beat("me", 6, 9)] } },
    { id: "s2", storyboard: { durationSeconds: 15, beats: [beat("do", 0, 3.2), beat("bao", 3.2, 14)] } },
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

  it("gộp các nhịp liền nhau của cùng người và lấy đoạn dài nhất, tối đa 10 giây", () => {
    const picked = pickNativeVoiceSamples(scenes, [clip("v1", "s1"), clip("v2", "s2")], ["do", "me", "bao"]);
    expect(picked).toEqual([
      { characterId: "do", sourceTaskId: "v1", inSeconds: 0, outSeconds: 6 },
      { characterId: "me", sourceTaskId: "v1", inSeconds: 6, outSeconds: 9 },
      { characterId: "bao", sourceTaskId: "v2", inSeconds: 3.2, outSeconds: 13.2 },
    ]);
  });

  it("bỏ qua clip chưa qua kiểm tra, clip lồng tiếng và người đã có giọng", () => {
    expect(
      pickNativeVoiceSamples(
        scenes,
        [clip("v1", "s1", { auto_accepted_at: null }), clip("v2", "s2", { input: { audioMode: "dubbed" } })],
        ["do", "me", "bao"],
      ),
    ).toEqual([]);
    expect(pickNativeVoiceSamples(scenes, [clip("v1", "s1")], ["me"]).map((item) => item.characterId)).toEqual(["me"]);
  });
});
