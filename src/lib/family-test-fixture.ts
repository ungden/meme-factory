import type { PilotEpisode } from "./family-pilot";

/**
 * Một tập mẫu viết theo đúng chuẩn mới: 14 lượt đối đáp, trung vị 4 từ, luật
 * chơi được đẩy ba lần rồi quay lại cắn chính người đặt ra nó.
 *
 * Bộ mẫu cũ có 6 lượt, trung vị 11 từ ("Chị muốn chọn trò này trước, em thấy
 * thế nào nhỉ?"). Nó đi qua mọi cổng kiểm tra, nên nó cũng chính là thứ bản
 * nháp học theo. Đổi bộ mẫu là một phần của việc sửa, không phải việc dọn test.
 */
const turns = [
  ["Bánh Bao", "Em ăn xong chưa?", "Xếp bát vào bồn", "base_reality"],
  ["Đậu Đỏ", "Rồi. Ngon lắm.", "Vỗ bụng", "base_reality"],
  ["Bánh Bao", "Từ mai nhà mình thu phí.", "Dán tờ giấy lên tủ lạnh", "unusual_thing"],
  ["Đậu Đỏ", "Thu gì cơ?", "Ngẩng lên", "frame"],
  ["Bánh Bao", "Mở tủ lạnh: một cái kẹo.", "Chỉ vào tờ giấy", "heighten"],
  ["Đậu Đỏ", "Em có kẹo đâu.", "Lục túi quần", "explore"],
  ["Bánh Bao", "Thì em nợ chị.", "Ghi vào sổ", "explore"],
  ["Đậu Đỏ", "Nợ á?", "Trợn mắt", "frame"],
  ["Bánh Bao", "Uống nước: hai cái.", "Lật sang trang mới", "heighten"],
  ["Đậu Đỏ", "Thở thì sao?", "Bĩu môi", "heighten"],
  ["Bánh Bao", "Thở miễn phí. Chị tốt mà.", "Gật đầu hài lòng", "explore"],
  ["Đậu Đỏ", "Vậy em nín thở.", "Phồng má nín", "heighten"],
  ["Bánh Bao", "Nín cũng được. Kẹo vẫn nợ.", "Chìa tay đòi", "explore"],
  ["Đậu Đỏ", "Chị mở tủ kìa.", "Chỉ tay, Bánh Bao đứng hình", "button"],
];
export const testPilot: PilotEpisode[] = Array.from({ length: 12 }, (_, i) => ({
  key: String(i),
  title: `Fixture ${i}`,
  group: i < 8 ? "siblings" : i < 11 ? "child_parent" : "family",
  series: "Luật của tụi con",
  setting: "Bếp nhà, cạnh tủ lạnh",
  situation: `Tình huống kiểm thử ${i}`,
  mechanism: "Luật do chị đặt ra rồi tự vướng",
  outcome: "Chị là người mở tủ trước",
  setup: "Chị dán bảng giá lên tủ lạnh",
  payoff: "Chính chị nợ tiền tủ lạnh",
  turns,
  reaction: "Bánh Bao rút tay khỏi cánh tủ",
}));
