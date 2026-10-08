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

type SampleScene = {
  id: string;
  storyboard?: {
    durationSeconds: number;
    beats: Array<{ speakerCharacterId: string | null; dialogue: string; startSeconds: number; endSeconds: number }>;
  } | null;
};
type SampleTask = {
  id: string;
  kind: string;
  scene_id: string | null;
  status: string;
  created_at: string;
  approved_at?: string | null;
  auto_accepted_at?: string | null;
  input?: { audioMode?: string } | null;
};

/**
 * Chọn giọng chuẩn cho từng bé từ phim vừa quay, không hỏi ai.
 *
 * Lấy đoạn một người nói liền mạch dài nhất (gộp các nhịp liền nhau của cùng
 * người) trong clip tự nói đã qua kiểm tra. Đoạn dài cho model nghe đủ âm sắc;
 * chỉ một người nói để giọng mẫu không lẫn giọng người khác.
 */
export function pickNativeVoiceSamples(
  scenes: SampleScene[],
  tasks: SampleTask[],
  eligibleCharacterIds: string[],
): Array<{ characterId: string; sourceTaskId: string; inSeconds: number; outSeconds: number }> {
  const best = new Map<string, { characterId: string; sourceTaskId: string; inSeconds: number; outSeconds: number }>();
  for (const scene of scenes) {
    const board = scene.storyboard;
    if (!board) continue;
    const clip = tasks
      .filter(
        (task) =>
          task.scene_id === scene.id &&
          task.kind === "video" &&
          task.status === "completed" &&
          task.input?.audioMode === "native" &&
          Boolean(task.approved_at || task.auto_accepted_at),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!clip) continue;
    for (let i = 0; i < board.beats.length; ) {
      const speaker = board.beats[i].speakerCharacterId;
      let j = i;
      while (j + 1 < board.beats.length && board.beats[j + 1].speakerCharacterId === speaker) j += 1;
      const spoken = board.beats.slice(i, j + 1).some((beat) => beat.dialogue.trim());
      if (speaker && spoken && eligibleCharacterIds.includes(speaker)) {
        const inSeconds = board.beats[i].startSeconds;
        const outSeconds = Math.min(board.beats[j].endSeconds, inSeconds + NATIVE_SAMPLE_MAX_SECONDS, board.durationSeconds);
        const length = outSeconds - inSeconds;
        const current = best.get(speaker);
        if (
          length >= NATIVE_SAMPLE_MIN_SECONDS &&
          (!current || length > current.outSeconds - current.inSeconds)
        )
          best.set(speaker, {
            characterId: speaker,
            sourceTaskId: clip.id,
            inSeconds: Math.round(inSeconds * 100) / 100,
            outSeconds: Math.round(outSeconds * 100) / 100,
          });
      }
      i = j + 1;
    }
  }
  return [...best.values()];
}
