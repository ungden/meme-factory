import type { FilmPlan } from "./contracts";
import type { ChannelProfile } from "../family-catalogue";

const normalizeName = (name: string) =>
  name.normalize("NFC").toLocaleLowerCase("vi").trim();

/**
 * Blocks paid media when one scene mixes artifacts from another revision:
 * a speaker outside the scene's cast, stale prompts referencing characters
 * that are not in the scene, or dialogue without an identifiable speaker.
 * The bug behind plan c184347b: the new idea's dialogue was kept while the
 * old episode's image/motion prompts (and their cast) remained.
 */
export function assertMediaCoherent(
  plan: FilmPlan,
  profile: ChannelProfile | null,
) {
  const roleNames = (profile?.roles || []).map((role) => role.name);
  const roleIds = new Set(
    (profile?.roles || []).map((role) => role.characterId),
  );
  const issues: string[] = [];
  plan.video_plan_scenes.forEach((scene, index) => {
    const cast = scene.cast_snapshot || [];
    const castNames = new Set(cast.map((c) => normalizeName(c.name)));
    const hasStoryboard = Boolean(scene.storyboard?.beats?.length);
    if (scene.dialogue && !scene.speaker_character_id && !hasStoryboard) {
      issues.push(`Cảnh ${index + 1} có lời thoại nhưng chưa chọn người nói.`);
    }
    if (
      scene.speaker_character_id &&
      !cast.some((c) => c.characterId === scene.speaker_character_id)
    ) {
      issues.push(
        `Cảnh ${index + 1}: người nói không nằm trong cast của cảnh; prompt có thể thuộc kịch bản khác.`,
      );
    }
    const ghostNames = roleNames.filter(
      (name) => name && !castNames.has(normalizeName(name)),
    );
    const ghostIds = [...roleIds].filter(
      (id) => !cast.some((c) => c.characterId === id),
    );
    const prompt = `${scene.image_prompt || ""}\n${scene.motion_prompt || ""}`;
    const lowered = prompt.toLocaleLowerCase("vi");
    // Single-token family names ("Bố", "Mẹ") also appear as ordinary words;
    // only flag them when the prompt carries the cast id or an explicit
    // "(ID …)" pairing. Multi-word names ("Bánh Bao", "Đậu Đỏ") are ambiguous
    // enough nowhere else that a plain word-boundary hit is already a strong
    // stale-revision signal.
    const ghosts = [
      ...ghostNames.filter((name) => {
        const key = normalizeName(name);
        if (!lowered.includes(key)) return false;
        if (/\s/.test(name)) return true;
        return ghostIds.filter((id) => prompt.includes(id)).length > 0;
      }),
      ...ghostNames.filter((name) =>
        lowered.includes(`${normalizeName(name)} (id`),
      ),
      ...ghostIds.filter((id) => prompt.includes(id)),
    ];
    const uniqueGhosts = [...new Set(ghosts)];
    if (uniqueGhosts.length)
      issues.push(
        `Cảnh ${index + 1}: prompt nhắc tới nhân vật ngoài cast (${uniqueGhosts.join(", ")}). Hãy AI soạn lại storyboard cho thoại hiện tại.`,
      );
  });
  if (issues.length)
    throw new Error(`PLAN_MEDIA_INCOHERENT\u0000${issues.join(" · ")}`);
}

/** Map coherence errors back into a clear user-facing film error. */
export function coherenceMessage(message: string) {
  if (message.includes("PLAN_MEDIA_INCOHERENT"))
    return message.split("\u0000")[1] || message;
  return message;
}