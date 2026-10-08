import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFilmAudioMode, nativeSpeechAllowed } from "./features";
import { SEEDANCE_20_FAST_TEXT_MODEL, SEEDANCE_25_TEXT_MODEL } from "../video-models";

describe("cổng thử nghiệm giọng tự nói", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("chỉ dự án được liệt kê mới mặc định tự nói, và chỉ trên 2.5", () => {
    vi.stubEnv("SHORT_FILM_NATIVE_VOICE_PROJECT_IDS", "p1, p2");
    expect(defaultFilmAudioMode("p1", SEEDANCE_25_TEXT_MODEL)).toBe("native");
    expect(defaultFilmAudioMode("p1", SEEDANCE_20_FAST_TEXT_MODEL)).toBe("dubbed");
    expect(defaultFilmAudioMode("p3", SEEDANCE_25_TEXT_MODEL)).toBe("dubbed");
  });

  it("bật chung thì mọi dự án dùng 2.5 đều tự nói", () => {
    vi.stubEnv("SHORT_FILM_NATIVE_VOICE_ENABLED", "true");
    expect(nativeSpeechAllowed("p9", SEEDANCE_25_TEXT_MODEL)).toBe(true);
    expect(nativeSpeechAllowed("p9", SEEDANCE_20_FAST_TEXT_MODEL)).toBe(false);
  });
});
