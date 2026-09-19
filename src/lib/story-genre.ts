export type StoryGenre = "comedy" | "emotion";

const GENRE_MARKER = /^\[AIDA_GENRE=(comedy|emotion)\]\s*/u;

/**
 * The marker keeps the user's explicit genre with a production run without a
 * schema migration. It is stripped before the brief is shown to a model or a
 * person.
 */
export function markedStoryIntent(intent: string, genre: StoryGenre) {
  return `[AIDA_GENRE=${genre}]\n${stripStoryGenreMarker(intent)}`;
}

export function stripStoryGenreMarker(intent: string | null | undefined) {
  return String(intent || "").replace(GENRE_MARKER, "").trim();
}

/** Only the episode brief may choose a genre. Channel tone often advertises
 * both comedy and emotion, so using it here makes every episode emotional.
 */
export function storyGenreFromIntent(
  intent: string | null | undefined,
  allowed: StoryGenre[] = ["comedy", "emotion"],
): StoryGenre {
  const raw = String(intent || "");
  const marked = raw.match(GENRE_MARKER)?.[1] as StoryGenre | undefined;
  // A persisted run keeps the choice it started with even if the channel
  // profile is edited later.
  if (marked) return marked;
  if (allowed.length === 1) return allowed[0];

  const brief = stripStoryGenreMarker(raw).toLocaleLowerCase("vi");
  const asksForEmotion =
    /\b(cảm động|xúc động|rưng rưng|hoài niệm|hồi tưởng|ký ức|chia tay)\b/u.test(brief) ||
    /\b(nhớ|thương)\s+(bố|mẹ|ông|bà|con|chị|em|nhà|gia đình)\b/u.test(brief);
  return asksForEmotion ? "emotion" : "comedy";
}
