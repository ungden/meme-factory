import { nativeSpeechSupported } from "../video-models";

export function fixedVoiceEnabled(projectId: string) {
  if (process.env.SHORT_FILM_FIXED_VOICE_ENABLED === "true") return true;
  return String(process.env.SHORT_FILM_FIXED_VOICE_PROJECT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(projectId);
}

/**
 * Seedance 2.5 tự nói tiếng Việt mới chỉ được thiết kế, chưa chạy thật tập nào
 * (CLAUDE.md: đo một tập trước khi đổi pipeline). Bật theo dự án để kênh của
 * chủ app thử trước; khách khác vẫn lồng tiếng như cũ cho tới khi bật chung.
 */
export function nativeVoiceEnabled(projectId: string) {
  if (process.env.SHORT_FILM_NATIVE_VOICE_ENABLED === "true") return true;
  return String(process.env.SHORT_FILM_NATIVE_VOICE_PROJECT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(projectId);
}

export function nativeSpeechAllowed(projectId: string, videoModel: unknown) {
  return nativeSpeechSupported(videoModel) && nativeVoiceEnabled(projectId);
}

export function defaultFilmAudioMode(projectId: string, videoModel: unknown): "native" | "dubbed" {
  return nativeSpeechAllowed(projectId, videoModel) ? "native" : "dubbed";
}
