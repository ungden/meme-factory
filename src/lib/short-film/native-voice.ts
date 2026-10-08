type ClipRow = {
  id: string;
  kind: string;
  status: string;
  input?: { audioMode?: string; providerInputs?: { generate_audio?: boolean; duration?: number } } | null;
  result?: { path?: string; duration?: number } | null;
} | null;

/** Đủ dài để model nghe ra âm sắc, đủ ngắn để bốn nhân vật vẫn dưới trần 30 giây. */
export const NATIVE_SAMPLE_MIN_SECONDS = 3;
export const NATIVE_SAMPLE_MAX_SECONDS = 10;

/**
 * Đoạn tiếng lấy làm giọng mẫu phải nằm trong một clip native đã xong: clip lồng
 * tiếng mang giọng TTS người lớn, lấy làm mẫu thì bé sẽ nói giọng người lớn.
 */
export function nativeSampleWindow(
  clip: ClipRow,
  inSeconds: number,
  outSeconds: number,
): { ok: true; inSeconds: number; outSeconds: number } | { ok: false; message: string } {
  if (
    !clip ||
    clip.kind !== "video" ||
    clip.status !== "completed" ||
    !clip.result?.path ||
    clip.input?.audioMode !== "native" ||
    clip.input?.providerInputs?.generate_audio !== true
  )
    return { ok: false, message: "Chọn một đoạn phim đã quay xong có giọng do AI tự nói." };
  const duration = Number(clip.result.duration ?? clip.input.providerInputs.duration);
  const length = outSeconds - inSeconds;
  if (
    !Number.isFinite(inSeconds) ||
    !Number.isFinite(outSeconds) ||
    inSeconds < 0 ||
    length < NATIVE_SAMPLE_MIN_SECONDS ||
    length > NATIVE_SAMPLE_MAX_SECONDS ||
    (Number.isFinite(duration) && outSeconds > duration)
  )
    return {
      ok: false,
      message: `Chọn đoạn ${NATIVE_SAMPLE_MIN_SECONDS}–${NATIVE_SAMPLE_MAX_SECONDS} giây nằm trong đoạn phim, chỉ có giọng của nhân vật này.`,
    };
  return {
    ok: true,
    inSeconds: Math.round(inSeconds * 100) / 100,
    outSeconds: Math.round(outSeconds * 100) / 100,
  };
}
