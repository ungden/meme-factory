import { BILLING_POINT_FLOOR_VND } from "./ai-pricing";
import { FREE_TRIAL_POINTS, POINT_COSTS, POINT_PACKAGES } from "./point-pricing";

/**
 * "Một điểm mua được gì" — bảng ví dụ cho trang giá công khai.
 *
 * Giá ảnh lấy thẳng từ bảng tính điểm nên không bao giờ lệch với lúc trừ tiền.
 * Giá phim thì không có công thức tĩnh: WaveSpeed báo giá theo từng lượt, phụ
 * thuộc độ dài và số cảnh. Con số ở đây là khoảng đo được từ các tập đã sản
 * xuất thật trên Seedance 2.0 Fast (357 điểm/22 giây và 637 điểm/32 giây), và
 * được ghi rõ là ước lượng thay vì cam kết.
 */
export const FILM_POINTS_RANGE = { min: 350, max: 700, seconds: 30 } as const;

export type PricingExample = {
  label: string;
  /** Số điểm, hoặc khoảng điểm cho thứ không có giá cố định. */
  points: number | { min: number; max: number };
  note?: string;
};

export const PRICING_EXAMPLES: PricingExample[] = [
  { label: "Một meme cho bài đăng", points: POINT_COSTS.meme },
  { label: "Một ảnh nhân vật mới", points: POINT_COSTS.character },
  { label: "Một ảnh nền / bìa", points: POINT_COSTS.background },
  {
    label: `Một phim ngắn ~${FILM_POINTS_RANGE.seconds} giây`,
    points: { min: FILM_POINTS_RANGE.min, max: FILM_POINTS_RANGE.max },
    note: "Tuỳ số cảnh, độ dài, lồng tiếng và kiểm tra; báo giá chính xác cùng trần chi hiện trước khi bắt đầu.",
  },
  { label: "Viết lời cho bài đăng", points: 0 },
];

/**
 * Chi phí một ngày "tự làm mỗi ngày" — ví dụ trên trang giá.
 *
 * Tính từ đúng giá meme và khoảng giá phim ở trên, nên đổi giá ở một chỗ thì
 * ví dụ đổi theo. Phim không có giá cố định nên kết quả là một khoảng.
 */
export function autopilotDayEstimate(plan: { films: number; memes: number }) {
  const films = Math.max(0, Math.floor(plan.films));
  const memes = Math.max(0, Math.floor(plan.memes));
  const memePoints = memes * POINT_COSTS.meme;
  return {
    films,
    memes,
    min: films * FILM_POINTS_RANGE.min + memePoints,
    max: films * FILM_POINTS_RANGE.max + memePoints,
  };
}

/** Số ảnh làm được bằng điểm tặng — câu trả lời cho "miễn phí thì được gì?". */
export function trialImageCount(): number {
  return Math.floor(FREE_TRIAL_POINTS / POINT_COSTS.meme);
}

export function pointsToVnd(points: number): number {
  return points * BILLING_POINT_FLOOR_VND;
}

/**
 * Gói nạp nhỏ nhất đủ bù phần thiếu.
 *
 * Người đang thiếu 12 điểm không cần nghe về gói 1.000 điểm; họ cần một con số
 * và một nút. Thiếu nhiều hơn mọi gói thì trả gói lớn nhất.
 */
export function suggestPackage(shortfallPoints: number) {
  const needed = Math.max(1, Math.ceil(shortfallPoints));
  const sorted = [...POINT_PACKAGES].sort((a, b) => a.points - b.points);
  return sorted.find((pkg) => pkg.points >= needed) ?? sorted[sorted.length - 1];
}
