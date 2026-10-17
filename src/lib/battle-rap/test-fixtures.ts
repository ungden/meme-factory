import type { BattleBrief, BattleInput, Cue, Shot } from "./contracts";
import { normalizeInput, validateBrief } from "./contracts";

// Dữ liệu cố định để thử hợp đồng, không gọi dịch vụ sinh nội dung.
export const input: BattleInput = normalizeInput({ idea: "Nhân vật Đỏ đấu nhân vật Xanh", targetSeconds: 90 });
export function briefFixture(): BattleBrief {
  const speakers = ["MC", "A", "B", "A", "B", "MC"];
  return validateBrief({ concept: "Hai nhân vật đối đáp trên sân khấu.", conflict: "Ai giữ được bình tĩnh?", suno: { title: "Đỏ gặp Xanh", style: "Boom bap, 96 BPM, two distinct rap voices, live crowd, DJ scratch" }, cast: ["A", "B", "MC", "DJ"].map(role => ({ role, name: role, identity: `${role} distinct outfit, full body, handheld microphone`, personality: "Confident and playful", voice: "Distinct clear voice" })), stage: { description: "A crowded arena", layout: "A left, B right, MC flank, DJ rear", lighting: "Warm spotlights", crowd: "Dense excited crowd", visualStyle: "Live action cinematic" }, sections: speakers.map((speaker, index) => ({ tag: `${index === 0 || index === 5 ? "Intro" : "Verse"} ${index + 1}: ${speaker}, spoken`, lines: [{ id: `line-${index + 1}`, speaker, text: ["Sẵn sàng chưa", "Đỏ ra sân rồi", "Xanh đáp trả ngay", "Đỏ vẫn ở đây", "Xanh chẳng ngại đâu", "Khán giả chọn nào"][index] }] })) });
}
export function cuesFixture(): Cue[] {
  return briefFixture().sections.flatMap(s => s.lines).map((line, i) => ({ start: i * 3, end: i * 3 + 2, text: line.text, speaker: line.speaker, lineId: line.id }));
}
export function shotsFixture(): Shot[] {
  return ["wide", "opponent", "crowd", "dj", "mc", "wide"].map((type, i) => ({ id: `shot-${i + 1}`, blockId: i < 5 ? "block-1" : "block-2", start: i * 3, end: i * 3 + 3, type: type as Shot["type"], performer: "none", cast: ["A", "B", "MC", "DJ"], cueIds: [`line-${i + 1}`], camera: "Steady medium shot", action: "Crowd follows the battle", continuity: "A left, B right", description: "Khán giả theo dõi trận đấu." }));
}
