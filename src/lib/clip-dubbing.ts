import "server-only";
import { getSupabaseAdmin } from "./admin";
import { estimateGeminiTtsPrice } from "./ai-pricing";
import { isGeminiTtsModel } from "./short-film/contracts";
export type ClipDubbing = {
  characterId: string;
  voiceProfileVersion: string;
  voice: string;
  model: string;
  direction: string;
  text: string;
  points: number;
  providerCostUsd: number;
};
/** Lỗi do người dùng sửa được (lời dài, chưa chọn giọng); route hiện nguyên câu này. */
export class ClipDubbingError extends Error {}

/** Only server-owned approved voice versions may be used; clients submit text and character ID. */
export async function resolveClipDubbing(
  projectId: string,
  input: unknown,
  duration: number,
): Promise<ClipDubbing | null> {
  if (input == null) return null;
  const value = input as Record<string, unknown>;
  if (
    typeof value.text !== "string" ||
    !value.text.trim() ||
    typeof value.characterId !== "string"
  )
    throw new ClipDubbingError("Nhập lời lồng tiếng và chọn người nói nhé.");
  const text = value.text.trim();
  if (text.length > 700 || text.split(/\s+/).length > (duration - 0.5) * 2.6)
    throw new ClipDubbingError(
      "Lời lồng tiếng dài quá so với video. Rút gọn lời hoặc chọn video dài hơn nhé.",
    );
  const db = getSupabaseAdmin();
  const [{ data: project, error: pe }, { data: character, error: ce }] =
    await Promise.all([
      db
        .from("projects")
        .select("workspace_version")
        .eq("id", projectId)
        .single(),
      db
        .from("characters")
        .select("id")
        .eq("id", value.characterId)
        .eq("project_id", projectId)
        .single(),
    ]);
  if (pe || ce || !character || !project)
    throw new ClipDubbingError("Người nói không thuộc kênh này.");
  const { data: voice, error } = await db
    .from("character_voice_versions")
    .select("id,voice_id,model,settings")
    .eq("character_id", character.id)
    .eq("workspace_version", project.workspace_version)
    // Giọng mẫu cho Seedance tự nói không phải giọng TTS; lấy nó là hỏng lồng tiếng.
    .neq("model", "seedance-native")
    .not("approved_at", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !voice || !isGeminiTtsModel(voice.model))
    throw new ClipDubbingError(
      "Nhân vật này chưa có giọng nói. Chọn giọng cho nhân vật trước rồi bật lồng tiếng nhé.",
    );
  const price = estimateGeminiTtsPrice({
    model: voice.model,
    text,
    requestedSeconds: duration,
  });
  return {
    characterId: character.id,
    voiceProfileVersion: voice.id,
    voice: voice.voice_id,
    model: voice.model,
    direction: String(voice.settings?.direction || "Nói tiếng Việt tự nhiên."),
    text,
    points: price.customerPoints,
    providerCostUsd: price.providerCostUsd,
  };
}
