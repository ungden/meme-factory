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
  reaction: string;
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
          { purpose: "turn", description: e.turns[2][1] },
          { purpose: "turn", description: e.turns[4][1] },
          { purpose: "payoff", description: e.payoff },
          { purpose: "reaction", description: e.reaction },
        ],
        caption: `${e.title}. Nhà bạn đã từng có cuộc thương lượng như thế này chưa?`,
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
    }> = e.turns.map((t) => {
      const c = role(t[0]);
      return {
        characterIds: [c.characterId],
        speakerCharacterId: c.characterId,
        dialogue: t[1],
        action: t[2],
        setting: e.setting,
        camera:
          "Cận trung ngang tầm mắt người nói, máy cố định; hướng nhìn về người đối thoại ngoài khung, giữ trục máy.",
        durationSeconds: Math.max(4, Math.ceil(t[1].split(/\s+/).length / 2.6)),
        imagePrompt: `${e.setting}. Một mình ${c.name} trong khung hình, ${t[2].toLocaleLowerCase("vi")}. Ảnh đầu trước khi nói. Theo ảnh chuẩn ${c.name}: ${c.description}. Không chữ, không bố cục lưới, không người khác. Ánh sáng mềm, giữ đạo cụ và vị trí qua các shot.`,
        motionPrompt: `${c.name}: ${t[2]}. Một lượt nói, cử chỉ tiết chế, nhường nhịp cho câu sau; giữ hướng nhìn và nhận diện từ ảnh đầu.`,
        followsPrevious: false,
      };
    });
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
      audioMode: "fixed",
      subtitles: true,
      trimSpeech: false,
      scenes,
    };
  });
  return { profile, plans };
}
