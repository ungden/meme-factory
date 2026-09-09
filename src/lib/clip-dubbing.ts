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
    throw new Error("Nhập lời lồng tiếng và chọn người nói.");
  const text = value.text.trim();
  if (text.length > 700 || text.split(/\s+/).length > (duration - 0.5) * 2.6)
    throw new Error(
      "Lời thoại quá dài. Rút gọn hoặc chọn clip dài hơn rồi xem lại giá.",
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
    throw new Error("Người nói không thuộc dự án.");
  const { data: voice, error } = await db
    .from("character_voice_versions")
    .select("id,voice_id,model,settings")
    .eq("character_id", character.id)
    .eq("workspace_version", project.workspace_version)
    .not("approved_at", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !voice || !isGeminiTtsModel(voice.model))
    throw new Error(
      "Duyệt một giọng Gemini cho nhân vật trước khi lồng tiếng.",
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
