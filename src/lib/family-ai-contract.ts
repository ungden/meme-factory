import {
  storyboardGroups,
  beatSeconds,
  validateStoryboard,
  storyboardDialogue,
  type StoryboardBeat,
} from "./film-storyboard";
import type { ChannelProfile, Story } from "./family-catalogue";
import {
  PERFORMANCE_LANES,
  mergePerformanceDirections,
  type PerformanceDirection,
} from "./performance-direction";
import {
  validateSceneReferencePlan,
  type SceneReferencePlan,
  type VisualRequirement,
  type DirectorReferenceImage,
} from "./visual-direction";
/**
 * Số panel của một tập = số lượt thoại, cộng một panel phản ứng im lặng nếu
 * nhịp cuối là reaction. Ba nơi từng tự tính lại phép này; lệch nhau một đơn vị
 * là schema, validator và prompt bất đồng, và lỗi chỉ lộ ra sau khi đã gọi AI.
 */
export function storyShotCount(story: Story) {
  return story.dialogue.length + (storyHasReaction(story) ? 1 : 0);
}

export function storyHasReaction(story: Story) {
  return story.beats.at(-1)?.purpose === "reaction";
}

const string = { type: "string" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function storyResponseSchema(profile: ChannelProfile, ids: string[]) {
  const characterId = {
    type: "string",
    enum: [...ids, "guest-1", "guest-2"],
  };
  return object({
    performanceLane: { type: "string", enum: PERFORMANCE_LANES },
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
    guests: {
      type: "array",
      minItems: 0,
      maxItems: 2,
      items: object({
        key: { type: "string", enum: ["guest-1", "guest-2"] },
        name: string,
        description: string,
        personality: string,
      }),
    },
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
/**
 * Gemini trả 400 INVALID_ARGUMENT khi schema quá phức tạp: chép định nghĩa panel
 * thành shot1..shotN, hay giới hạn minItems/maxItems lồng trong panel, đều vượt
 * ngưỡng ngay cả với một panel. Vì vậy shots là mảng một định nghĩa, còn giới
 * hạn số phần tử do compileStoryShots/compileStoryboards tự áp.
 */
export function shotResponseSchema(
  story: Story,
  ids: string[] = [],
  { header = true }: { header?: boolean } = {},
) {
  const shotCount = storyShotCount(story);
  const shot = object({
    action: string,
    setting: string,
    camera: string,
    durationSeconds: { type: "number", minimum: 0.5, maximum: 30 },
    pauseAfterSeconds: {
      type: "number", minimum: 0, maximum: 2,
      description: "Khoảng nghỉ có chủ đích sau câu. Mặc định 0.15; chỉ tăng khi cần hành động/reaction cụ thể. Không tính thời gian nói vào đây.",
    },
    imagePrompt: {
      type: "string",
      description:
        "Khung ĐẦU trước hành động; chưa diễn ra kết quả chuyển động. Người nói phải rõ mặt; chữ hoặc số chỉ xuất hiện khi là chi tiết thật trên đạo cụ mà câu chuyện cần đọc.",
    },
    motionPrompt: string,
    openingState: {
      type: "string",
      description:
        "Trạng thái nhìn thấy trước hành động: ai ở đâu, hướng nhìn và vật đang ở tay/vị trí nào.",
    },
    closingState: {
      type: "string",
      description:
        "Trạng thái nhìn thấy sau hành động để nối nhịp tiếp theo; ghi rõ người đã rời khung.",
    },
    props: {
      type: "array",
      description: "Tối đa 8 đạo cụ.",
      items: object({
        id: string,
        label: string,
        color: string,
        size: string,
        marks: string,
        count: { type: "integer", minimum: 1, maximum: 20 },
        holderCharacterId: string,
        position: string,
      }),
    },
    performanceDirection: object({
      version: { type: "integer", enum: [1] },
      lane: { type: "string", enum: PERFORMANCE_LANES },
      comicObjective: string,
      statusBefore: string,
      statusAfter: string,
      hook: string,
      beats: {
        type: "array",
        description: "Từ 2 đến 6 nhịp hành động; ít hơn 2 là không hợp lệ.",
        items: object({
          physicalAction: string,
          expressionChange: string,
          gesture: string,
          propInteraction: string,
          reactionTarget: string,
          cameraMove: string,
        }),
      },
      revealOrCut: {
        type: "string",
        description: "Một câu cụ thể: điều gì lộ ra hoặc cắt ở khoảnh khắc nào; không chỉ ghi \"cut\".",
      },
    }),
    listenerCharacterIds: {
      type: "array",
      description: "Tối đa 1 người nghe.",
      items: ids.length ? { type: "string", enum: ids } : string,
    },
    requiresOwnSource: { type: "boolean" },
    visualRequirements: {
      type: "array",
      description: "Từ 1 đến 8 yêu cầu.",
      items: object({
        id: string,
        kind: {
          type: "string",
          enum: ["cast", "prop", "count", "text", "spatial", "reveal"],
        },
        description: string,
        visibleWhen: {
          type: "string",
          enum: ["opening", "during", "reveal", "ending"],
        },
        importance: { type: "string", enum: ["critical", "supporting"] },
        legibility: {
          type: "string",
          enum: ["recognizable", "countable", "readable"],
        },
      }),
    },
    referenceImages: {
      type: "array",
      description: "Từ 1 đến 4 ảnh; mỗi requirement critical phải được ít nhất một ảnh bao phủ.",
      items: object({
        id: string,
        role: {
          type: "string",
          enum: ["scene", "character", "prop", "environment"],
        },
        purpose: string,
        framing: string,
        moment: string,
        prompt: string,
        requirementIds: {
          type: "array",
          description: "Ít nhất 1 id trong visualRequirements của panel này.",
          items: string,
        },
      }),
    },
  });
  const shots = {
    type: "array",
    description: `Đúng ${shotCount} panel theo thứ tự; phần tử đầu là panel đầu tiên được yêu cầu.`,
    items: shot,
  };
  if (!header) return object({ shots });
  return object({
    title: string,
    summary: string,
    visualDirection: object({
      storyMechanism: string,
      audienceMustSee: {
        type: "array",
        items: string,
      },
      characterKnowledge: {
        type: "array",
        items: object({
          characterId: ids.length ? { type: "string", enum: ids } : string,
          knows: string,
          mustNotRevealBefore: string,
        }),
      },
    }),
    shots,
  });
}
/** Text and cast are compiled from the accepted story, not rewritten by the shot planner. */
const SHOT_LIMITS = { props: 8, visualRequirements: 8, referenceImages: 4 } as const;

function propId(value: unknown, fallback: string) {
  const slug = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

/**
 * Model hay viết lại cùng một đạo cụ với chữ hơi khác ("Trong suốt"/"trong suốt")
 * hoặc id có dấu cách/dấu tiếng Việt, khiến validator storyboard chặn cả tập.
 * Lần xuất hiện đầu của một id quyết định nhận diện; các panel sau chỉ đổi người
 * cầm và vị trí.
 */
function canonicalProps(
  list: unknown,
  identities: Map<string, Record<string, unknown>>,
) {
  if (!Array.isArray(list)) return list;
  const seen = new Set<string>();
  const props = list.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const prop = { ...(raw as Record<string, unknown>) };
    const id = propId(prop.id ?? prop.label, `prop-${index + 1}`);
    if (seen.has(id)) return [];
    seen.add(id);
    const count = Math.round(Number(prop.count));
    const own = {
      label: String(prop.label || "").trim() || id,
      color: String(prop.color || "").trim() || "không nêu",
      size: String(prop.size || "").trim() || "không nêu",
      marks: String(prop.marks || "").trim(),
      count: Number.isFinite(count) ? Math.min(20, Math.max(1, count)) : 1,
    };
    const identity = identities.get(id) || own;
    identities.set(id, identity);
    return [
      {
        ...prop,
        ...identity,
        id,
        position: String(prop.position || "").trim() || "trong khung",
      },
    ];
  });
  return props.length ? props : undefined;
}

/**
 * Nhận shots dạng mảng (schema hiện tại) hoặc shot1..shotN (dữ liệu cũ), cắt các
 * mảng về giới hạn và chuẩn hoá đạo cụ. priorShots là các panel đã dựng ở đoạn
 * trước: đạo cụ trùng id giữ nguyên nhận diện đã có.
 */
export function normalizeShotResponse(
  value: unknown,
  priorShots: unknown[] = [],
) {
  const v = value as { shots?: unknown } | null;
  if (!v || typeof v !== "object") return value;
  const entries: Array<[string, unknown]> = Array.isArray(v.shots)
    ? v.shots.map((shot, i) => [`shot${i + 1}`, shot])
    : v.shots && typeof v.shots === "object"
      ? Object.entries(v.shots)
      : [];
  if (!entries.length) return value;
  const identities = new Map<string, Record<string, unknown>>();
  for (const shot of priorShots)
    canonicalProps((shot as { props?: unknown } | null)?.props, identities);
  const shots = Object.fromEntries(
    entries.map(([key, raw]) => {
      if (!raw || typeof raw !== "object") return [key, raw];
      const shot = { ...(raw as Record<string, unknown>) };
      for (const [field, limit] of Object.entries(SHOT_LIMITS)) {
        const list = shot[field];
        if (Array.isArray(list))
          shot[field] = list.length ? list.slice(0, limit) : undefined;
      }
      if (shot.props !== undefined)
        shot.props = canonicalProps(shot.props, identities);
      return [key, shot];
    }),
  );
  return { ...v, shots };
}

/** Phần câu chuyện ứng với một nhóm panel (chỉ số toàn phim) để dựng và kiểm tra riêng từng đoạn. */
export function storySlice(story: Story, group: number[]): Story {
  const includesReaction = group.some((i) => i >= story.dialogue.length);
  return {
    ...story,
    dialogue: group
      .filter((i) => i < story.dialogue.length)
      .map((i) => story.dialogue[i]),
    beats: includesReaction
      ? story.beats
      : story.beats.filter((beat) => beat.purpose !== "reaction"),
  };
}

/**
 * Nhân vật được gọi tên trong một đoạn mô tả, theo thứ tự xuất hiện. Tên dài
 * khớp trước và phần đã khớp bị xoá, để "Bố hồi bé" không bị đếm thêm là "Bố".
 */
export function mentionedCharacters(
  text: string,
  characters: { id: string; name: string }[],
) {
  let rest = ` ${text.normalize("NFC")} `;
  const found: { id: string; at: number }[] = [];
  for (const character of [...characters].sort((a, b) => b.name.length - a.name.length)) {
    const name = character.name.normalize("NFC").trim();
    if (!name) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
      "iu",
    );
    const match = pattern.exec(rest);
    if (!match) continue;
    found.push({ id: character.id, at: match.index });
    rest = rest.replace(new RegExp(pattern.source, "giu"), (value) => " ".repeat(value.length));
  }
  return found.sort((a, b) => a.at - b.at).map((item) => item.id);
}

export function compileStoryShots(
  value: unknown,
  story: Story,
  characters: { id: string; name: string }[] = [],
) {
  const v = normalizeShotResponse(value) as {
    title: string;
    summary: string;
    visualDirection?: {
      storyMechanism?: string;
      audienceMustSee?: string[];
      characterKnowledge?: Array<{
        characterId?: string;
        knows?: string;
        mustNotRevealBefore?: string;
      }>;
    };
    shots: Record<string, Record<string, unknown>>;
  };
  const shotCount = storyShotCount(story);
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
    const performanceDirection = shot.performanceDirection as
      | PerformanceDirection
      | undefined;
    return {
      ...shot,
      ...(performanceDirection ? { performanceDirection } : {}),
      ...(line?.text.trim()
        ? {
            imagePrompt: `${shot.imagePrompt || ""}\nRàng buộc: ${characters.find((c) => c.id === line.characterId)?.name || "người nói"} là người duy nhất nói và phải nhìn rõ mặt. Người nghe chỉ hiện khi cần cho phản ứng tự nhiên. Không lưới, nhãn giao diện hay phụ đề; giữ nguyên chữ/số thật trên đạo cụ nếu visualRequirements yêu cầu đọc.`,
          }
        : line
          ? {
              imagePrompt: `${shot.imagePrompt || ""}\nRàng buộc: nhịp không lời, không ai nói; khung hình kể bằng hành động. Không lưới, nhãn giao diện hay phụ đề.`,
            }
          : {}),
      characterIds: line
        ? [
            ...new Set([
              line.characterId,
              // Người được nhắc tên trong action phải có ảnh chuẩn trong cảnh:
              // "Bố cõng Đậu Đỏ" chỉ gắn Bố thì ảnh tự vẽ một bé khác.
              ...mentionedCharacters(line.action, characters),
              ...(
                (Array.isArray(shot.listenerCharacterIds)
                  ? shot.listenerCharacterIds
                  : []) as string[]
              ).filter((id) => characters.some((c) => c.id === id)),
            ]),
          ].slice(0, line.text.trim() ? 2 : 3)
        : [...new Set(story.dialogue.map((d) => d.characterId))],
      speakerCharacterId: line?.text.trim() ? line.characterId : null,
      dialogue: line?.text || "",
    };
  });
  return {
    title: v.title,
    summary: v.summary,
    scenes,
    visualDirection: v.visualDirection,
  };
}

/** Panels are planned per story beat; each provider clip is sized to its content. */
/**
 * Khung hình này có thể nhìn thấy bàn chân không.
 *
 * Yêu cầu chứng minh trạng thái giày dép trong một khung cắt ngang đùi là yêu
 * cầu không thể đáp ứng: người kiểm tra trả về "uncertain" và cả lượt chạy đỗ
 * lại chờ người, dù ảnh chẳng có gì sai. Chỉ gắn yêu cầu khi khung hình đủ rộng
 * để thấy chân; khung không ghi rõ thì vẫn gắn, vì lỗi đi giày giữa các cảnh
 * chân trần từng lọt qua đúng ở những khung như vậy.
 */
/**
 * Rút đúng mệnh đề nói về giày dép trong trạng thái mở cảnh.
 *
 * Bản cũ nhét NGUYÊN trạng thái mở cảnh vào mô tả yêu cầu giày dép. Trạng thái
 * đó thường kể cả ai đứng ở đâu ("Bánh Bao đứng trước tủ lạnh. Đậu Đỏ đứng bên
 * cạnh. Cả hai đi chân trần."), nên người kiểm tra ảnh đọc yêu cầu "giày dép"
 * rồi đi tìm luôn cả Đậu Đỏ — trong một khung medium chỉ quay Bánh Bao. Cảnh 3
 * của tập ngày 18/09 bị từ chối hai lần đúng vì lý do này, mỗi lần tốn một vòng
 * tạo lại.
 */
export function footwearClause(openingState: string): string {
  const pattern = /chân trần|đi đất|giày|dép|guốc|tất|vớ/iu;
  const sentences = openingState
    .split(/(?<=[.!?;])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const matching = sentences.filter((sentence) => pattern.test(sentence));
  const text = matching.length ? matching.join(" ") : openingState;
  return text.slice(0, 200);
}

export function framingCanShowFeet(camera: string): boolean {
  const text = camera.toLocaleLowerCase("vi");
  if (!text.trim()) return true;
  const tooTight =
    /close[\s-]?up|medium|cận|trung cảnh|bán thân|nửa người|từ thắt lưng|waist|chest|over[\s-]?the[\s-]?shoulder|máy cầm tay cận/u;
  return !tooTight.test(text);
}

export function compileStoryboards(
  value: unknown,
  story: Story,
  characters: { id: string; name: string }[] = [],
  maxProviderSeconds = 30,
) {
  const normalized = normalizeShotResponse(value);
  const planned = compileStoryShots(normalized, story, characters);
  const hasReaction = story.beats.at(-1)?.purpose === "reaction";
  const initialGroups = storyboardGroups(
    story.dialogue,
    hasReaction,
    maxProviderSeconds,
    story.performanceLane,
  );
  const raw = (normalized as { shots: Record<string, Record<string, unknown>> })
    .shots;
  // The director may split a shot when its camera/state is too different for a
  // continuous source clip. Visual evidence itself is carried by references.
  const referenceLimit = maxProviderSeconds <= 15 ? 9 : 30;
  const groups = initialGroups.flatMap((group) => {
    const split: number[][] = [];
    for (const index of group) {
      const shot = raw[`shot${index + 1}`] || {};
      const current = split.at(-1);
      const candidate = current ? [...current, index] : [index];
      const candidateImageCount = candidate.reduce((total, shotIndex) => {
        const images = raw[`shot${shotIndex + 1}`]?.referenceImages;
        return total + (Array.isArray(images) && images.length ? images.length : 1);
      }, 0);
      const candidateCastCount = new Set(
        candidate.flatMap((shotIndex) => planned.scenes[shotIndex].characterIds),
      ).size;
      const mustSplit =
        shot.requiresOwnSource === true ||
        candidateImageCount + candidateCastCount > referenceLimit;
      if (!current || mustSplit) split.push([index]);
      else current.push(index);
    }
    return split;
  });
  const scenes = groups.map((group) => {
    const shots = group.map((i) => planned.scenes[i]);
    const characterIds = [...new Set(shots.flatMap((s) => s.characterIds))];
    const weights = group.map((i) => {
      const shot = raw[`shot${i + 1}`];
      if (!story.dialogue[i]) return 1.2;
      // Speech is the timing source of truth. Give each turn only enough room
      // for its real delivery plus a short reaction/action beat; the provider
      // may contain tail padding, but the finished film must not inherit it.
      // Nhịp không lời không có thoại để đo; beatSeconds cho nó thời lượng hình cố định.
      return beatSeconds(story.dialogue[i].text, story.performanceLane) + Number(shot.pauseAfterSeconds ?? 0.15);
    });
    const sum = weights.reduce((n, w) => n + w, 0);
    if (sum > maxProviderSeconds - 0.5)
      throw new Error(
        "STORYBOARD_GROUP_TOO_LONG: chia thêm clip để giữ trọn lời và nhịp diễn.",
      );
    const providerDuration = Math.max(
      4,
      Math.min(maxProviderSeconds, Math.ceil(sum + 0.5)),
    );
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
        speakerCharacterId: line?.text.trim() ? line.characterId : null,
        dialogue: line?.text || "",
        pauseAfterSeconds: Number(shot.pauseAfterSeconds ?? 0.15),
        action: String(shot.action),
        camera: String(shot.camera),
        motion: String(shot.motionPrompt)
          .replace(
            /(?:^|\s)\d+(?:\.\d+)?s?\s*[–-]\s*\d+(?:\.\d+)?s\s*:\s*/g,
            " ",
          )
          .trim(),
        openingState: { note: String(shot.openingState || "") },
        closingState: { note: String(shot.closingState || "") },
        props: (Array.isArray(shot.props) ? shot.props : []).map((prop) =>
          prop.holderCharacterId && !characterIds.includes(prop.holderCharacterId)
            ? { ...prop, holderCharacterId: "" }
            : prop,
        ),
        ...(shot.performanceDirection &&
        typeof shot.performanceDirection === "object"
          ? {
              performance: (shot.performanceDirection as PerformanceDirection)
                .beats[0],
            }
          : {}),
      };
    });
    const performanceDirection = mergePerformanceDirections(
      shots.map((shot) => shot.performanceDirection as PerformanceDirection | undefined),
    );
    const storyboard = validateStoryboard(
      {
        version: 2,
        timingPolicy: "audio_driven_v1",
        durationSeconds: providerDuration,
        contentEndSeconds: Math.round(sum * 100) / 100,
        beats,
        performanceDirection,
        referencePlan: (() => {
          const requirements: VisualRequirement[] = [];
          const referenceImages: DirectorReferenceImage[] = [];
          for (const index of group) {
            const shot = raw[`shot${index + 1}`];
            const prefix = `shot${index + 1}`;
            const shotRequirements = Array.isArray(shot.visualRequirements)
              ? (shot.visualRequirements as VisualRequirement[])
              : [
                  {
                    id: "composition",
                    kind: "cast" as const,
                    description: "Đúng nhân vật, bối cảnh và tư thế mở của cảnh.",
                    visibleWhen: "opening" as const,
                    importance: "critical" as const,
                    legibility: "recognizable" as const,
                  },
                ];
            // Giày dép là lỗi liên tục QA ảnh chỉ bắt khi có yêu cầu tường minh
            // (Đậu Đỏ đi giày trắng giữa các cảnh chân trần từng lọt qua). Panel
            // có ghi trạng thái giày dép thì tự thêm yêu cầu critical cho nó.
            const opening = String(shot.openingState || "");
            const footwearPattern = /chân trần|đi đất|giày|dép|guốc|tất|vớ/iu;
            const needsFootwear =
              footwearPattern.test(opening) &&
              framingCanShowFeet(String(shot.camera || "")) &&
              !shotRequirements.some((requirement) => footwearPattern.test(requirement.description));
            const withFootwear: VisualRequirement[] = needsFootwear
              ? [
                  ...shotRequirements,
                  {
                    id: "footwear",
                    kind: "spatial",
                    description: `Giày dép đúng trạng thái đã ghi: ${footwearClause(opening)}`,
                    visibleWhen: "opening",
                    importance: "critical",
                    legibility: "recognizable",
                  },
                ]
              : shotRequirements;
            for (const requirement of withFootwear)
              requirements.push({ ...requirement, id: `${prefix}_${requirement.id}` });
            const shotImages = Array.isArray(shot.referenceImages)
              ? (shot.referenceImages as DirectorReferenceImage[])
              : [
                  {
                    id: "start",
                    role: "scene" as const,
                    purpose: "Khung mở của cảnh",
                    framing: String(shot.camera || "Khung vừa"),
                    moment: "Trước hành động",
                    prompt: String(shot.imagePrompt || shot.action || "Khung mở cảnh"),
                    requirementIds: ["composition"],
                  },
                ];
            for (const [imageIndex, image] of shotImages.entries())
              referenceImages.push({
                ...image,
                id: `${prefix}_${image.id}`,
                requirementIds: [
                  ...image.requirementIds,
                  ...(needsFootwear && imageIndex === 0 ? ["footwear"] : []),
                ].map((id) => `${prefix}_${id}`),
              });
          }
          if (!referenceImages.some((image) => image.role === "scene") && referenceImages[0])
            referenceImages[0].role = "scene";
          const director = planned.visualDirection;
          const normalExpectation = story.comicPremise?.normalExpectation;
          const invertedReality = story.comicPremise?.invertedReality;
          const plan: SceneReferencePlan = {
            version: 1,
            storyMechanism:
              director?.storyMechanism ||
              (normalExpectation && invertedReality
                ? `${normalExpectation} → ${invertedReality}`
                : story.mechanism ||
                  story.outcome ||
                  "Giữ đúng diễn biến và điểm lộ của kịch bản."),
            audienceMustSee: [
              ...(director?.audienceMustSee || []),
              story.comicPremise?.visibleContrast || story.payoff,
              ...requirements
                .filter((item) => item.importance === "critical")
                .map((item) => item.description),
            ].filter(Boolean),
            characterKnowledge: director?.characterKnowledge?.length
              ? director.characterKnowledge.map(
                  (item) =>
                    `${item.characterId}: biết ${item.knows}; chưa được lộ trước ${item.mustNotRevealBefore}`,
                )
              : (story.wants || []).map(
                  (want) => `${want.characterId}: ${want.want}`,
                ),
            requirements,
            referenceImages,
          };
          return validateSceneReferencePlan(plan);
        })(),
      },
      characterIds,
      maxProviderSeconds,
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
      storyboard,
      imagePrompt: `${first.imagePrompt}\nKhung đầu sạch của đoạn đối đáp: có đủ ${names} từ ảnh chuẩn, vị trí và hướng nhìn rõ theo trục đối thoại, đúng tỷ lệ vóc dáng. Chưa diễn ra hành động hoặc kết quả ở nhịp sau. Không lưới, nhãn giao diện, mũi tên, phụ đề hoặc nhiều bản sao nhân vật; chữ/số thật trên đạo cụ chỉ được giữ khi referencePlan yêu cầu.`,
      motionPrompt: beats.map((beat) => `${beat.startSeconds.toFixed(2)}–${beat.endSeconds.toFixed(2)}s: ${beat.motion}`).join("\n"),
      performanceDirection: storyboard.performanceDirection,
      referencePlan: storyboard.referencePlan,
    };
  });
  return { title: planned.title, summary: planned.summary, scenes };
}
