/** Reject any ambiguous voice routing before reading or mixing media. */
export function validateDubCue(cue, audio, videoTask, measuredDuration) {
  const i = audio.input || {};
  const sourceSceneId = videoTask.scene_id || videoTask.input?.sourceSceneId;
  const sourceSceneVersion =
    videoTask.scene_version || videoTask.input?.sourceSceneVersion;
  const sameSegment =
    videoTask.segment_id &&
    audio.segment_id === videoTask.segment_id &&
    audio.segment_revision === videoTask.segment_revision;
  if (
    audio.project_id !== videoTask.project_id ||
    (!sameSegment &&
      (audio.scene_id !== sourceSceneId ||
        audio.scene_version !== sourceSceneVersion)) ||
    audio.status !== "completed" ||
    audio.kind !== "tts" ||
    i.speakerCharacterId !== cue.speakerCharacterId ||
    i.voiceProfileVersion !== cue.voiceProfileVersion ||
    i.beatIndex !== cue.beatIndex ||
    i.providerInputs?.text !== cue.dialogue ||
    (i.providerInputs?.voice || i.providerInputs?.voice_id) !== cue.voice
  )
    throw new Error(
      "DUB_VOICE_MISMATCH: audio không đúng lượt nói/phiên bản giọng.",
    );
  if (
    !Number.isFinite(measuredDuration) ||
    measuredDuration <= 0 ||
    Math.abs(measuredDuration - cue.duration) > 0.08 ||
    measuredDuration > cue.endSeconds - cue.startSeconds + 0.02
  )
    throw new Error("DUB_DURATION_MISMATCH: thoại không vừa nhịp diễn.");
}
/**
 * ambientWindows: khoảng [start, end] của nhịp không lời trong clip. Audio gốc
 * của Seedance chỉ được nghe trong các khoảng này (tiếng sóng, gió); lúc có thoại
 * thì tắt để không lẫn tiếng nói do model tự tạo.
 */
export function dubArguments(video, audioFiles, schedule, duration, output, ambientWindows = []) {
  if (
    !schedule.length ||
    schedule.length !== audioFiles.length ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error("DUB_INVALID_SCHEDULE");
  let priorEnd = 0;
  for (const cue of schedule) {
    if (
      ![cue.startSeconds, cue.endSeconds, cue.duration].every(
        Number.isFinite,
      ) ||
      cue.startSeconds < priorEnd ||
      cue.duration <= 0 ||
      cue.endSeconds > duration + 0.05 ||
      cue.duration > cue.endSeconds - cue.startSeconds + 0.02
    )
      throw new Error("DUB_OVERLAP_OR_OVERFLOW");
    priorEnd = cue.startSeconds + cue.duration;
  }
  const filters = schedule.map(
    (cue, i) =>
      `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(cue.startSeconds * 1000)}:all=1[a${i}]`,
  );
  const windows = ambientWindows.filter(
    (w) => Number.isFinite(w?.start) && Number.isFinite(w?.end) && w.end - w.start >= 0.3,
  );
  if (windows.length) {
    const inside = windows
      .map((w) => `between(t,${Math.max(0, w.start).toFixed(3)},${Math.min(duration, w.end).toFixed(3)})`)
      .join("+");
    filters.push(
      `[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.35,volume=0:enable='not(${inside})',apad,atrim=duration=${duration}[amb]`,
    );
  }
  filters.push(
    `${schedule.map((_, i) => `[a${i}]`).join("")}${windows.length ? "[amb]" : ""}amix=inputs=${schedule.length + (windows.length ? 1 : 0)}:normalize=0:dropout_transition=0,apad,atrim=duration=${duration}[dub]`,
  );
  return [
    "-i",
    video,
    ...audioFiles.flatMap((file) => ["-i", file]),
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[dub]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    output,
  ];
}

export function transcriptMatchesClip(transcript, clipId) {
  const threshold = transcript?.input?.audioMode === "dubbed" ? 0.3 : 0.2;
  if (transcript?.input?.videoTaskId !== clipId) return false;
  // Whisper có thể bịa lời trên clip mở bằng nhịp không lời. Transcript đã khoá
  // theo lịch TTS và được người nghe lại, duyệt thì dùng được để dựng.
  if (
    (transcript?.approved_at || transcript?.auto_accepted_at) &&
    transcript?.result?.transcriptSource === "locked_tts_schedule"
  )
    return true;
  return (
    Number.isFinite(Number(transcript?.result?.speechError)) &&
    Number(transcript.result.speechError) <= threshold
  );
}

export function lockedTranscriptSegments(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  const segments = schedule.map((cue) => ({
    start: Number(cue.startSeconds),
    end: Number(cue.startSeconds) + Number(cue.duration),
    text: String(cue.dialogue || "").trim(),
  }));
  return segments.every(
    (segment) =>
      Number.isFinite(segment.start) &&
      Number.isFinite(segment.end) &&
      segment.end > segment.start &&
      segment.text.length > 0,
  )
    ? segments
    : null;
}
