import {
  storyboardGroups,
  spokenSeconds,
  validateStoryboard,
  storyboardDialogue,
  type StoryboardBeat,
} from "./film-storyboard";
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

/** Panels are planned per story beat, but provider jobs are 15-second sequences. */
export function compileStoryboards(
  value: unknown,
  story: Story,
  characters: { id: string; name: string }[] = [],
) {
  const planned = compileStoryShots(value, story, characters);
  const hasReaction = story.beats.at(-1)?.purpose === "reaction";
  const groups = storyboardGroups(story.dialogue, hasReaction);
  const raw = (value as { shots: Record<string, Record<string, unknown>> })
    .shots;
  const scenes = groups.map((group) => {
    const shots = group.map((i) => planned.scenes[i]);
    const characterIds = [...new Set(shots.flatMap((s) => s.characterIds))];
    const weights = group.map((i) => {
      const shot = raw[`shot${i + 1}`];
      if (!story.dialogue[i]) return 1.2;
      // Speech is the timing source of truth. Give each turn only enough room
      // for its real delivery plus a short reaction/action beat; the provider
      // may return 15s, but the finished film must not inherit that padding.
      return Math.max(
        spokenSeconds(story.dialogue[i].text) + 0.7,
        Math.min(4.5, Number(shot.durationSeconds) || 0),
      );
    });
    const sum = weights.reduce((n, w) => n + w, 0);
    if (sum > 29.5)
      throw new Error(
        "STORYBOARD_GROUP_TOO_LONG: chia thêm clip để giữ trọn lời và nhịp diễn.",
      );
    const providerDuration = Math.max(4, Math.min(30, Math.ceil(sum + 0.5)));
    // Pack useful action at the start of the provider clip. Any short source
    // tail is discarded during render instead of becoming dead air.
    let cursor = 0;
    const beats: StoryboardBeat[] = group.map((i, j) => {
      const shot = raw[`shot${i + 1}`],
        line = story.dialogue[i];
      const startSeconds = cursor;
      cursor = Math.round((cursor + weights[j]) * 100) / 100;
      return {
        startSeconds,
        endSeconds: cursor,
        speakerCharacterId: line?.characterId || null,
        dialogue: line?.text || "",
        action: String(shot.action),
        camera: String(shot.camera),
        motion: String(shot.motionPrompt)
          .replace(
            /(?:^|\s)\d+(?:\.\d+)?s?\s*[–-]\s*\d+(?:\.\d+)?s\s*:\s*/g,
            " ",
          )
          .trim(),
      };
    });
    const storyboard = validateStoryboard(
      {
        version: 1,
        durationSeconds: providerDuration,
        contentEndSeconds: Math.round(sum * 100) / 100,
        beats,
      },
      characterIds,
    );
    const first = raw[`shot${group[0] + 1}`];
    const names = characterIds
      .map((id) => characters.find((c) => c.id === id)?.name || id)
      .join(", ");
    return {
      characterIds,
      speakerCharacterId: null,
      dialogue: storyboardDialogue(storyboard),
      action: String(first.action),
      setting: String(first.setting),
      camera: String(first.camera),
      durationSeconds: providerDuration,
      followsPrevious: false,
      storyboard,
      imagePrompt: `${first.imagePrompt}\nKhung đầu sạch của đoạn đối đáp: có đủ ${names} từ ảnh chuẩn, vị trí và hướng nhìn rõ theo trục đối thoại, đúng tỷ lệ vóc dáng. Chưa diễn ra hành động hoặc kết quả ở nhịp sau. Không lưới, nhãn, mũi tên, chữ hoặc nhiều bản sao nhân vật.`,
      motionPrompt:
        "Thực hiện lần lượt các nhịp storyboard, giữ nhịp đối đáp tự nhiên và liên tục; mốc thời gian là chỉ dẫn diễn xuất, không phải phụ đề.",
    };
  });
  return { title: planned.title, summary: planned.summary, scenes };
}
