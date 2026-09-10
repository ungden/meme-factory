/** Clip ranges use independent ASR from this exact source clip, never planned dialogue. */
export function speechRange(
  duration,
  segments,
  enabled,
  minimumOutSeconds = 0,
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("INVALID_CLIP_DURATION");
  if (!enabled) return { inSeconds: 0, outSeconds: duration };
  if (!Array.isArray(segments) || !segments.length)
    throw new Error("TRIM_REQUIRES_ACTUAL_TRANSCRIPT");
  let previous = 0;
  for (const s of segments) {
    if (
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < previous ||
      s.end <= s.start ||
      s.end > duration + 0.05 ||
      !s.text?.trim()
    )
      throw new Error("INVALID_TRANSCRIPT_TIMING");
    previous = s.end;
  }
  if (
    !Number.isFinite(minimumOutSeconds) ||
    minimumOutSeconds < 0 ||
    minimumOutSeconds > duration + 0.05
  )
    throw new Error("INVALID_MINIMUM_EDIT_OUT");
  return {
    inSeconds: Math.max(0, segments[0].start - 0.2),
    outSeconds: Math.min(
      duration,
      Math.max(minimumOutSeconds, segments.at(-1).end + 0.5),
    ),
  };
}
export function shiftTranscript(segments, range, offset) {
  return segments.map((s) => {
    if (s.start < range.inSeconds - 0.001 || s.end > range.outSeconds + 0.05)
      throw new Error("EDIT_WOULD_CUT_SPEECH");
    return {
      ...s,
      start: Math.max(0, s.start - range.inSeconds) + offset,
      end: Math.min(range.outSeconds, s.end) - range.inSeconds + offset,
    };
  });
}
