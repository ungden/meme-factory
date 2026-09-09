/** Planned timings direct the model; they are never subtitle timestamps. */
export type StoryboardBeat = {
  startSeconds: number;
  endSeconds: number;
  speakerCharacterId: string | null;
  dialogue: string;
  action: string;
  camera: string;
  motion: string;
};
export type FilmStoryboard = {
  version: 1;
  durationSeconds: 15;
  beats: StoryboardBeat[];
};
export const STORYBOARD_SECONDS = 15;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const spokenSeconds = (s: string) =>
  Math.max(1.2, words(s) / 2.6 + 0.25);

export function storyboardDialogue(board: FilmStoryboard) {
  return board.beats
    .map((b) => b.dialogue)
    .filter(Boolean)
    .join("\n");
}

/** Reject invalid or stale derived fields instead of silently stripping a board. */
export function validateStoryboard(
  value: unknown,
  castIds: string[],
): FilmStoryboard {
  const b = value as FilmStoryboard;
  if (
    !b ||
    b.version !== 1 ||
    b.durationSeconds !== 15 ||
    !Array.isArray(b.beats) ||
    !b.beats.length ||
    b.beats.length > 12
  )
    throw new Error(
      "STORYBOARD_INVALID: cần storyboard 15 giây có nhịp diễn rõ ràng.",
    );
  let end = 0;
  for (const beat of b.beats) {
    if (
      !beat ||
      !Number.isFinite(beat.startSeconds) ||
      !Number.isFinite(beat.endSeconds) ||
      Math.abs(beat.startSeconds - end) > 0.011 ||
      beat.endSeconds <= beat.startSeconds ||
      beat.endSeconds > 15 ||
      ["dialogue", "action", "camera", "motion"].some(
        (k) => typeof beat[k as keyof StoryboardBeat] !== "string",
      ) ||
      beat.dialogue.length > 700 ||
      beat.action.length > 900 ||
      beat.camera.length > 600 ||
      beat.motion.length > 1600 ||
      !beat.action.trim() ||
      !beat.camera.trim() ||
      !beat.motion.trim() ||
      (beat.speakerCharacterId !== null &&
        !castIds.includes(beat.speakerCharacterId)) ||
      (beat.dialogue.trim() &&
        (!beat.speakerCharacterId ||
          spokenSeconds(beat.dialogue) >
            beat.endSeconds - beat.startSeconds + 0.02))
    )
      throw new Error(
        "STORYBOARD_BEAT_INVALID: kiểm tra người nói, lời thoại và thời lượng mỗi nhịp.",
      );
    end = beat.endSeconds;
  }
  if (end !== 15 || storyboardDialogue(b).length > 700)
    throw new Error(
      "STORYBOARD_DURATION_INVALID: cần đủ 15 giây và thoại vừa thời lượng.",
    );
  return b;
}

/** Minimum number of clips, balanced contiguous groups, never split a sentence. */
export function storyboardGroups(
  lines: { text: string }[],
  reaction: boolean,
): number[][] {
  const weights = lines.map((l) => spokenSeconds(l.text));
  if (reaction) weights.push(1.2);
  if (!weights.length || weights.some((w) => w > 14.5))
    throw new Error(
      "STORYBOARD_LINE_TOO_LONG: rút gọn câu thoại để nói trọn trong đoạn 15 giây.",
    );
  for (let count = 1; count <= weights.length; count++) {
    const target = weights.reduce((n, w) => n + w, 0) / count;
    const memo = new Map<
      string,
      { score: number; groups: number[][] } | null
    >();
    const search = (
      from: number,
      remaining: number,
    ): { score: number; groups: number[][] } | null => {
      if (!remaining)
        return from === weights.length ? { score: 0, groups: [] } : null;
      // Never buy a separate 15s clip merely to hold a 1s final reaction.
      if (reaction && remaining === 1 && from === weights.length - 1)
        return null;
      const key = `${from}:${remaining}`;
      if (memo.has(key)) return memo.get(key)!;
      let best: { score: number; groups: number[][] } | null = null,
        sum = 0;
      for (let to = from; to <= weights.length - remaining; to++) {
        sum += weights[to];
        if (sum > 14.5) break;
        const next = search(to + 1, remaining - 1);
        if (!next) continue;
        const score = next.score + (sum - target) ** 2;
        if (!best || score < best.score)
          best = {
            score,
            groups: [
              Array.from({ length: to - from + 1 }, (_, i) => from + i),
              ...next.groups,
            ],
          };
      }
      memo.set(key, best);
      return best;
    };
    const result = search(0, count);
    if (result) return result.groups;
  }
  throw new Error("STORYBOARD_GROUPING_FAILED");
}
