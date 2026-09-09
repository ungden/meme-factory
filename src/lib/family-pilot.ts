import { familyProfile, validateStory, type Story } from "./family-catalogue";
import type { FilmCast } from "./short-film/contracts";
export const familyPersonalities: Record<string, string> = {
  "Bánh Bao":
    "Chị thích đứng ra lo và sắp xếp việc nhà, giục người lớn như một phụ huynh tí hon; có thể sốt ruột, mềm lòng hoặc nhờ em giúp.",
  "Đậu Đỏ":
    "Em trực tiếp, thấy việc bị sót và phải chạy lo cùng chị; nhìn như bé nhỏ nhưng có thể nhắc bố mẹ rất thực tế. Có sở thích trẻ con, không luôn là người ngây ngô/thua chị.",
  Bố: "Bố ham vui, có lúc cần hai bé gọi dậy, giục đúng giờ, nhắc đồ; trì hoãn và mè nheo rất trẻ con nhưng thương gia đình.",
  Mẹ: "Mẹ có sở thích và khiếu hài; có lúc nhờ hai bé lo hộ, dặn kỹ hoặc xin thêm chút như trẻ con. Không cố định là trọng tài khôn nhất nhà.",
};
export const familySpeechStyles: Record<string, string> = {
  "Bánh Bao": "Giọng bé gái đã chọn; lời dặn/giục đời thường như phụ huynh tí hon. Có thể nói dài để nhắc việc, rồi mềm lòng trước bố mẹ mè nheo; không cần xưng sếp hay lập hợp đồng.",
  "Đậu Đỏ": "Giọng bé trai đã chọn; hỏi việc cụ thể, nhắc đồ bị sót và phụ chị lo cho người lớn. Có thể càu nhàu, thở dài hoặc giục rất nghiêm túc dù còn bé xíu; không ép câu vài từ hoặc luôn hiểu nghĩa đen.",
  Bố: "Xưng bố/con, có lúc xin thêm chút, quên đồ, đòi món mình thích hoặc nài nỉ con. Lời rất thường, không luôn chống chế vì bị bắt quả tang.",
  Mẹ: "Xưng mẹ/con, có lúc dặn hai bé lo hộ, trì hoãn, nhờ thêm việc hoặc mè nheo đáng yêu. Không luôn bắt bài và chốt bài học; giọng giữ nguyên phiên bản đã chọn.",
};
export type PilotEpisode = {
  key: string;
  title: string;
  group: string;
  series: string;
  setting: string;
  situation: string;
  mechanism: string;
  outcome: string;
  setup: string;
  payoff: string;
  turns: string[][];
  reaction?: string;
  wants?: Record<string, string>;
};
export function buildFamilyPilot(cast: FilmCast[], pilot: PilotEpisode[]) {
  const role = (name: string) => {
    const c = cast.find((c) => c.name === name);
    if (!c) throw new Error(`Thiếu nhân vật ${name}`);
    return c;
  };
  Object.keys(familyPersonalities).forEach(role);
  const profile = familyProfile(
    cast.map((c) => ({
      characterId: c.characterId,
      name: c.name,
      personality: familyPersonalities[c.name],
      speechStyle: familySpeechStyles[c.name],
    })),
  );
  const stories: Story[] = [];
  const plans = pilot.map((e) => {
    const ids = [...new Set(e.turns.map((t) => role(t[0]).characterId))];
    const story = validateStory(
      {
        series: e.series,
        situation: e.situation,
        mechanism: e.mechanism,
        outcome: e.outcome,
        setup: e.setup,
        payoff: e.payoff,
        wants: ids.map((id, i) => ({
          characterId: id,
          want:
            e.wants?.[cast.find((c) => c.characterId === id)!.name] ||
            (i === 0 ? e.situation : e.outcome),
        })),
        beats: [
          { purpose: "hook", description: e.setup },
          ...e.turns
            .slice(1, -1)
            .filter((_, i) => i % 2 === 1)
            .slice(0, 4)
            .map((turn) => ({ purpose: "turn" as const, description: turn[1] })),
          { purpose: "payoff", description: e.payoff },
          ...(e.reaction
            ? [{ purpose: "reaction" as const, description: e.reaction }]
            : []),
        ],
        caption: e.title,
        dialogue: e.turns.map((t) => ({
          characterId: role(t[0]).characterId,
          text: t[1],
          action: t[2],
        })),
      },
      profile,
      ids,
      stories,
    );
    stories.push(story);
    const scenes: Array<{
      characterIds: string[];
      speakerCharacterId: string | null;
      dialogue: string;
      action: string;
      setting: string;
      camera: string;
      durationSeconds: number;
      imagePrompt: string;
      motionPrompt: string;
      followsPrevious: boolean;
    }> = e.turns.map((t, index) => {
      const c = role(t[0]);
      const adjacent = [...e.turns.slice(index + 1), ...e.turns.slice(0, index)]
        .map((turn) => role(turn[0]))
        .find((candidate) => candidate.characterId !== c.characterId);
      const characterIds = [c.characterId, adjacent?.characterId].filter(
        (id): id is string => !!id,
      );
      return {
        characterIds,
        speakerCharacterId: c.characterId,
        dialogue: t[1],
        action: t[2],
        setting: e.setting,
        camera:
          "Trung cận ngang tầm mắt người nói; giữ người nghe trong khung khi biểu cảm của họ làm câu thoại tự nhiên hơn.",
        durationSeconds: Math.max(4, Math.ceil(t[1].split(/\s+/).length / 2.6)),
        imagePrompt: `${e.setting}. ${c.name} chuẩn bị nói, ${t[2].toLocaleLowerCase("vi")}.${adjacent ? ` ${adjacent.name} ở cạnh và đang lắng nghe.` : ""} Theo đúng ảnh chuẩn từng người. Không chữ, không bố cục lưới.`,
        motionPrompt: `${c.name} là người duy nhất nói: ${t[2]}. ${adjacent ? `${adjacent.name} chỉ nghe và phản ứng tự nhiên.` : ""} Giữ hướng nhìn và nhận diện từ ảnh đầu.`,
        followsPrevious: false,
      };
    });
    if (e.reaction)
      scenes.push({
        characterIds: ids,
        speakerCharacterId: null,
        dialogue: "",
        action: e.reaction,
        setting: e.setting,
        camera: "Trung cảnh cố định vừa đủ người và đạo cụ; giữ trục không gian",
        durationSeconds: 4,
        imagePrompt: `${e.setting}. ${ids.map((id) => cast.find((c) => c.characterId === id)!.name).join(", ")} đúng ảnh chuẩn. ${e.reaction}. Không người khác, không chữ, không lưới.`,
        motionPrompt: e.reaction,
        followsPrevious: false,
      });
    return {
      catalogueKey: `family-v1-${e.key}`,
      title: e.title,
      brief: e.situation,
      caption: story.caption,
      story,
      group: e.group,
      targetDurationSeconds: 35,
      format: "9:16",
      resolution: "720p",
      audioMode: "native",
      subtitles: true,
      trimSpeech: true,
      scenes,
    };
  });
  return { profile, plans };
}
