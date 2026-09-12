export const GEMINI_ADULT_MALE_GUEST_VOICES = [
  { voice: "Fenrir", tone: "dứt khoát, nhiều năng lượng" },
  { voice: "Iapetus", tone: "rõ lời, lanh lợi" },
  { voice: "Algenib", tone: "hơi khàn, tự tin" },
  { voice: "Algieba", tone: "ấm, tự nhiên" },
  { voice: "Sadachbia", tone: "hoạt bát, giàu biểu cảm" },
] as const;

function stableIndex(value: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function isAdultMaleGuest(character: {
  name?: string | null;
  description?: string | null;
}) {
  return /(?:\bnam\b|\bông\b|\bchú\b|\banh\b|male|man\b)/i.test(
    `${character.name || ""} ${character.description || ""}`,
  );
}

/**
 * Pick once, freeze in cast_snapshot, and reuse for every line/retry of the
 * episode. The deterministic shuffle avoids a new voice after refresh while
 * still spreading guest roles over the approved male pool.
 */
export function automaticGuestVoice(params: {
  projectId: string;
  workspaceVersion: number;
  character: { id: string; name: string; description?: string | null };
  usedVoices?: Set<string>;
}) {
  const { projectId, workspaceVersion, character } = params;
  if (!isAdultMaleGuest(character)) return undefined;
  const used = params.usedVoices || new Set<string>();
  const start = stableIndex(
    `${projectId}:${workspaceVersion}:${character.id}`,
    GEMINI_ADULT_MALE_GUEST_VOICES.length,
  );
  const selected =
    Array.from({ length: GEMINI_ADULT_MALE_GUEST_VOICES.length }, (_, offset) =>
      GEMINI_ADULT_MALE_GUEST_VOICES[
        (start + offset) % GEMINI_ADULT_MALE_GUEST_VOICES.length
      ],
    ).find((candidate) => !used.has(candidate.voice)) ||
    GEMINI_ADULT_MALE_GUEST_VOICES[start];
  used.add(selected.voice);
  return {
    id: `auto-guest:${workspaceVersion}:${character.id}:${selected.voice}`,
    voice_id: selected.voice,
    model: "gemini-3.1-flash-tts-preview",
    settings: {
      provider: "google",
      source: "auto_guest",
      voiceName: selected.voice,
      direction: [
        `Audio profile: ${character.name}, một người đàn ông Việt Nam trưởng thành.`,
        `Giữ nguyên âm sắc nam của ${selected.voice}: ${selected.tone}; nói tự nhiên, rõ tiếng Việt.`,
        "Không dùng giọng trẻ em, không nữ tính, không đọc quảng cáo và không đổi tuổi hay âm sắc giữa các câu.",
      ].join(" "),
    },
  };
}
