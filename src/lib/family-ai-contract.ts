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
    series: { type: "string", enum: profile.series },
    situation: string,
    mechanism: string,
    outcome: string,
    setup: string,
    payoff: string,
    caption: string,
    wants: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: object({ characterId, want: string }),
    },
    beats: object({
      hook: string,
      turns: { type: "array", minItems: 2, maxItems: 3, items: string },
      payoff: string,
      reaction: string,
    }),
    dialogue: {
      type: "array",
      minItems: 6,
      maxItems: 10,
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
  return {
    ...v,
    beats: [
      { purpose: "hook", description: b.hook },
      ...b.turns.map((description) => ({ purpose: "turn", description })),
      { purpose: "payoff", description: b.payoff },
      { purpose: "reaction", description: b.reaction },
    ],
  };
}
export function shotResponseSchema(story: Story) {
  const shot = object({
    action: string,
    setting: string,
    camera: string,
    durationSeconds: { type: "number", minimum: 0.5, maximum: 30 },
    imagePrompt: {
      type: "string",
      description:
        "Khung ĐẦU trước hành động; chưa diễn ra kết quả chuyển động. Shot thoại chỉ có người nói, người nghe ngoài khung, mặt rõ; không chữ hoặc lưới.",
    },
    motionPrompt: string,
  });
  return object({
    title: string,
    summary: string,
    shots: object(
      Object.fromEntries(
        Array.from({ length: story.dialogue.length + 1 }, (_, i) => [
          `shot${i + 1}`,
          shot,
        ]),
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
  if (!v?.shots || Object.keys(v.shots).length !== story.dialogue.length + 1)
    throw new Error("STORY_SHOTS_MISSING");
  const scenes = Array.from({ length: story.dialogue.length + 1 }, (_, i) => {
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
            camera: `Trung cận ngang tầm mắt ${characters.find((c) => c.id === line.characterId)?.name || "người nói"}; chỉ một người trong khung. Giữ mặt rõ, nhìn về người nghe ngoài khung suốt câu thoại.`,
            imagePrompt: `${shot.imagePrompt || ""}\nRàng buộc: chỉ ${characters.find((c) => c.id === line.characterId)?.name || "người nói"} hiện trong khung; người nghe ở ngoài khung. Đây là trạng thái trước hành động, không phải kết quả sau chuyển động; không chữ hay lưới ảnh.`,
          }
        : {}),
      characterIds: line
        ? [line.characterId]
        : [...new Set(story.dialogue.map((d) => d.characterId))],
      speakerCharacterId: line?.characterId || null,
      dialogue: line?.text || "",
      followsPrevious: false,
    };
  });
  return { title: v.title, summary: v.summary, scenes };
}
