import type { ChannelProfile, Story } from "./family-catalogue";
const string = { type: "string" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function storyResponseSchema(profile: ChannelProfile, ids: string[]) {
  const characterId = { type: "string", enum: ids };
  return object({
    comicPremise: object({
      normalExpectation: string,
      invertedReality: string,
      visibleContrast: string,
    }),
    series: { type: "string", enum: profile.series },
    situation: string,
    mechanism: string,
    outcome: string,
    setup: string,
    payoff: string,
    caption: string,
    endingPlan: object({
      mode: {
        type: "string",
        enum: ["hard_cut", "silent_reaction", "resolved"],
      },
      stopAfterLine: { type: "integer", minimum: 1, maximum: 12 },
      anchorQuote: string,
      reason: string,
    }),
    wants: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: object({ characterId, want: string }),
    },
    beats: object({
      hook: string,
      turns: { type: "array", minItems: 0, maxItems: 4, items: string },
      payoff: string,
      reaction: string,
    }),
    dialogue: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: object({ characterId, text: string, action: string }),
    },
  });
}
export function unpackStory(value: unknown) {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== "object" || Array.isArray(v.beats)) return value;
  const b = v.beats as {
    hook: string;
    turns: string[];
    payoff: string;
    reaction: string;
  };
  if (!b || !Array.isArray(b.turns)) return value;
  const endingPlan = v.endingPlan as Story["endingPlan"] | undefined;
  // The legacy free-text reaction field often repeats the last spoken line.
  // Only an explicit silent-reaction ending may create an additional shot.
  const silentReaction =
    endingPlan?.mode === "silent_reaction" ? b.reaction?.trim() : "";
  return {
    ...v,
    beats: [
      { purpose: "hook", description: b.hook },
      ...b.turns
        .filter((description) => description?.trim())
        .map((description) => ({ purpose: "turn", description })),
      { purpose: "payoff", description: b.payoff },
      ...(silentReaction
        ? [{ purpose: "reaction", description: silentReaction }]
        : []),
    ],
  };
}
export function shotResponseSchema(story: Story, ids: string[] = []) {
  const hasReaction = story.beats.at(-1)?.purpose === "reaction";
  const shotCount = story.dialogue.length + (hasReaction ? 1 : 0);
  const shot = object({
    action: string,
    setting: string,
    camera: string,
    durationSeconds: { type: "number", minimum: 0.5, maximum: 30 },
    imagePrompt: {
      type: "string",
      description:
        "Khung ĐẦU trước hành động; chưa diễn ra kết quả chuyển động. Người nói phải rõ mặt; có thể giữ một người nghe trong khung để lấy phản ứng; không chữ hoặc lưới.",
    },
    motionPrompt: string,
    listenerCharacterIds: {
      type: "array",
      maxItems: 1,
      items: ids.length ? { type: "string", enum: ids } : string,
    },
  });
  return object({
    title: string,
    summary: string,
    shots: object(
      Object.fromEntries(
        Array.from({ length: shotCount }, (_, i) => [`shot${i + 1}`, shot]),
      ),
    ),
  });
}
/** Text and cast are compiled from the accepted story, not rewritten by the shot planner. */
export function compileStoryShots(
  value: unknown,
  story: Story,
  characters: { id: string; name: string }[] = [],
) {
  const v = value as {
    title: string;
    summary: string;
    shots: Record<string, Record<string, unknown>>;
  };
  const hasReaction = story.beats.at(-1)?.purpose === "reaction";
  const shotCount = story.dialogue.length + (hasReaction ? 1 : 0);
  if (!v?.shots || Object.keys(v.shots).length !== shotCount)
    throw new Error("STORY_SHOTS_MISSING");
  const scenes = Array.from({ length: shotCount }, (_, i) => {
    const shot = v.shots[`shot${i + 1}`],
      line = story.dialogue[i];
    if (
      !shot ||
      ["action", "setting", "camera", "imagePrompt", "motionPrompt"].some(
        (k) => typeof shot[k] !== "string" || !(shot[k] as string).trim(),
      )
    )
      throw new Error(
        `STORY_SHOT_${i + 1}_INVALID: cần đủ hành động, bối cảnh, camera và hai prompt`,
      );
    return {
      ...shot,
      ...(line
        ? {
            imagePrompt: `${shot.imagePrompt || ""}\nRàng buộc: ${characters.find((c) => c.id === line.characterId)?.name || "người nói"} là người duy nhất nói và phải nhìn rõ mặt. Người nghe chỉ hiện khi cần cho phản ứng tự nhiên; không chữ hay lưới ảnh.`,
          }
        : {}),
      characterIds: line
        ? [
            line.characterId,
            ...(
              (Array.isArray(shot.listenerCharacterIds)
                ? shot.listenerCharacterIds
                : []) as string[]
            ).filter(
              (id) =>
                id !== line.characterId && characters.some((c) => c.id === id),
            ),
          ].slice(0, 2)
        : [...new Set(story.dialogue.map((d) => d.characterId))],
      speakerCharacterId: line?.characterId || null,
      dialogue: line?.text || "",
      followsPrevious: false,
    };
  });
  return { title: v.title, summary: v.summary, scenes };
}
