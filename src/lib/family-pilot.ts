import { familyProfile, validateStory, type Story } from "./family-catalogue";
import type { FilmCast } from "./short-film/contracts";
export const familyPersonalities: Record<string, string> = {
  "Bánh Bao":
    "Chị thích chủ trì, nói có lý lẽ, muốn được công nhận là lớn; đôi lúc quá tự tin tự mắc bẫy.",
  "Đậu Đỏ":
    "Em trực tiếp, quan tâm lợi ích trước mắt, hiểu lời theo nghĩa riêng; khi ngây thơ khi bất ngờ tinh ý.",
  Bố: "Hay hưởng ứng trò con, có ham thích và lý do trẻ con; đồng minh, giấu chuyện nhỏ hoặc bị bắt bài.",
  Mẹ: "Quan sát tốt, thực tế, có khiếu hài, chơi cùng con; đổi điều kiện hoặc mở tình huống, không luôn xử phạt.",
};
export const familySpeechStyles: Record<string, string> = {
  "Bánh Bao":
    "Chị gái, thích chủ trì và được coi là lớn. Có thể đặt luật, giải thích kế hoạch và mặc cả rất nghiêm túc để được việc của mình; khi cách đầu không hiệu quả thì tìm lý lẽ khác. Khẩu ngữ Việt, không cố nói thông minh trong mọi câu.",
  "Đậu Đỏ":
    "Em trai, để ý lợi ích trước mắt và những chỗ chị bỏ sót. Có thể hỏi thẳng, cãi lý, phân tích hay làm quân sư như người lớn khi muốn đạt điều gì đó. Không giới hạn ở câu vài từ hoặc luôn hiểu nghĩa đen; có thể dẫn dắt cuộc đối đáp và cũng có lúc tự mắc bẫy. Giữ diện mạo và giọng bé trai đã chọn.",
  Bố: "Xưng bố/con, đời thường, ham vui. Có mong muốn riêng, biết thương lượng, rủ rê hoặc nài nỉ; có thể chủ động bày trò, không luôn là người bị bắt quả tang.",
  Mẹ: "Xưng mẹ/con, thực tế và có khiếu hài. Có thể tham gia kế hoạch, mặc cả, nhờ vả hoặc bị con bắt lý; không luôn đóng vai trọng tài bắt bài hay kết luận đạo lý.",
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
