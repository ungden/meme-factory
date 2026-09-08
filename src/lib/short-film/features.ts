export function fixedVoiceEnabled(projectId: string) {
  if (process.env.SHORT_FILM_FIXED_VOICE_ENABLED === "true") return true;
  return String(process.env.SHORT_FILM_FIXED_VOICE_PROJECT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(projectId);
}
