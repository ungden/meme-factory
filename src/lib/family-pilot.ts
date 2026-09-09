import { familyProfile, validateStory, type Story } from "./family-catalogue";
import type { FilmCast } from "./short-film/contracts";
export const familyPersonalities: Record<string, string> = {
  "Bánh Bao":
    "Chị thích chủ trì, sắp xếp và thể hiện vai lớn: có thể lo việc nhà hoặc làm người hỏi/khách mời trong parody. Diễn nghiêm túc, có thể sốt ruột hay mềm lòng; không chỉ biết giục bố mẹ.",
  "Đậu Đỏ":
    "Em trực tiếp, có góc nhìn riêng và có thể chủ động hỏi hoặc trả lời rất tỉnh bơ trong vai người lớn. Có sở thích/đạo cụ trẻ con tạo tương phản; có thể phụ chị lo nhà, không luôn ngây ngô hay thua chị.",
  Bố: "Bố ham vui, có lúc cần hai bé gọi dậy, giục đúng giờ, nhắc đồ; trì hoãn và mè nheo rất trẻ con nhưng thương gia đình.",
  Mẹ: "Mẹ có sở thích và khiếu hài; có lúc nhờ hai bé lo hộ, dặn kỹ hoặc xin thêm chút như trẻ con. Không cố định là trọng tài khôn nhất nhà.",
};
export const familySpeechStyles: Record<string, string> = {
  "Bánh Bao": "Giọng bé gái đã chọn. Đối đáp đời thường khi ở nhà; khi parody dùng cách hỏi/trả lời đúng format, tự tin và nghiêm túc. Câu dài/ngắn theo ý nói, không cần giải thích mình đang diễn.",
  "Đậu Đỏ": "Giọng bé trai đã chọn. Hỏi việc cụ thể, đáp tỉnh bơ hoặc giữ phong thái người lớn trong parody. Có thể chủ trì/phản biện, không ép câu vài từ hay luôn hiểu nghĩa đen; giữ cách xưng hô phù hợp người nghe/vai đang diễn.",
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
