import type { PilotEpisode } from "./family-pilot";
const turns = [
  [
    "Bánh Bao",
    "Chị muốn chọn trò này trước, em thấy thế nào nhỉ?",
    "Đưa hộp trò chơi",
  ],
  [
    "Đậu Đỏ",
    "Em muốn chọn trò kia trước, mình đổi lượt được không?",
    "Chỉ hộp còn lại",
  ],
  [
    "Bánh Bao",
    "Mình thử chọn bằng chiếc thẻ này, mỗi người một mặt.",
    "Giơ thẻ lên",
  ],
  ["Đậu Đỏ", "Hai mặt đều giống nhau mà chị, phải vẽ thêm chứ.", "Lật mặt sau"],
  ["Bánh Bao", "Vậy em vẽ mặt này, chị vẽ mặt kia để chọn.", "Đưa bút"],
  [
    "Đậu Đỏ",
    "Thế mình đang chơi vẽ rồi, em chọn chơi tiếp nhé!",
    "Ngồi xuống vẽ",
  ],
];
export const testPilot: PilotEpisode[] = Array.from({ length: 12 }, (_, i) => ({
  key: String(i),
  title: `Fixture ${i}`,
  group: i < 8 ? "siblings" : i < 11 ? "child_parent" : "family",
  series: "Luật của tụi con",
  setting: "Phòng chơi",
  situation: `Tình huống kiểm thử ${i}`,
  mechanism: "Quy tắc thay đổi",
  outcome: "Cùng vẽ trên thẻ",
  setup: "Hai mặt giống nhau",
  payoff: "Vẽ đã thành trò chơi",
  turns,
  reaction: "Đưa bút cho nhau",
}));
