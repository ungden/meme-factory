/** Reject any ambiguous voice routing before reading or mixing media. */
export function validateDubCue(cue, audio, videoTask, measuredDuration) {
  const i = audio.input || {};
  if (
    audio.project_id !== videoTask.project_id ||
    audio.scene_id !== videoTask.scene_id ||
    audio.scene_version !== videoTask.scene_version ||
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
export function dubArguments(video, audioFiles, schedule, duration, output) {
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
  filters.push(
    `${schedule.map((_, i) => `[a${i}]`).join("")}amix=inputs=${schedule.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${duration}[dub]`,
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
