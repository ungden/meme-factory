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
  input?: { audioMode?: string; videoTaskId?: string } | null;
  result?: { segments?: Array<{ start: number; end: number; text: string }> } | null;
};

/**
 * Chọn giọng chuẩn cho từng bé từ phim vừa quay, không hỏi ai.
 *
 * Chỉ lấy từ clip có đúng MỘT người nói: model tự quyết lúc nào ai nói, nên
 * mốc giờ dự kiến trong clip nhiều người có thể rơi vào giọng bé khác, và giọng
 * mẫu sai sẽ bị chép sang mọi tập sau. Mốc cắt lấy từ bản chép lời thật (Whisper)
 * khi có, không thì từ storyboard. Đoạn dài nhất (3–10 giây) thắng.
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
    const spoken = board.beats.filter((beat) => beat.dialogue.trim() && beat.speakerCharacterId);
    const speakers = new Set(spoken.map((beat) => beat.speakerCharacterId));
    const speaker = spoken[0]?.speakerCharacterId;
    if (speakers.size !== 1 || !speaker || !eligibleCharacterIds.includes(speaker)) continue;
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
    const segments = tasks
      .filter((task) => task.kind === "transcribe" && task.status === "completed" && task.input?.videoTaskId === clip.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      ?.result?.segments?.filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start);
    let inSeconds: number;
    let outSeconds: number;
    if (segments?.length) {
      inSeconds = segments[0].start;
      outSeconds = inSeconds;
      for (const segment of segments) {
        if (segment.end - inSeconds > NATIVE_SAMPLE_MAX_SECONDS) break;
        outSeconds = segment.end;
      }
    } else {
      inSeconds = spoken[0].startSeconds;
      outSeconds = Math.min(spoken[spoken.length - 1].endSeconds, inSeconds + NATIVE_SAMPLE_MAX_SECONDS);
    }
    outSeconds = Math.min(outSeconds, board.durationSeconds);
    const length = outSeconds - inSeconds;
    const current = best.get(speaker);
    if (length >= NATIVE_SAMPLE_MIN_SECONDS && (!current || length > current.outSeconds - current.inSeconds))
      best.set(speaker, {
        characterId: speaker,
        sourceTaskId: clip.id,
        inSeconds: Math.round(inSeconds * 100) / 100,
        outSeconds: Math.round(outSeconds * 100) / 100,
      });
  }
  return [...best.values()];
}

/**
 * Độ dài file WAV đọc từ header (chunk "fmt " và "data"). Không tin số giây
 * client gửi: một file dài hơn trần 30 giây làm hỏng mọi clip dùng giọng này.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") byteRate = view.getUint32(offset + 16, true);
    if (id === "data") return byteRate > 0 ? Math.min(size, bytes.length - offset - 8) / byteRate : null;
    offset += 8 + size + (size % 2);
  }
  return null;
}
