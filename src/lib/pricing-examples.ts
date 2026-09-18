import { BILLING_POINT_FLOOR_VND } from "./ai-pricing";
import { FREE_TRIAL_POINTS, POINT_COSTS } from "./point-pricing";

/**
 * "Một điểm mua được gì" — bảng ví dụ cho trang giá công khai.
 *
 * Giá ảnh lấy thẳng từ bảng tính điểm nên không bao giờ lệch với lúc trừ tiền.
 * Giá phim thì không có công thức tĩnh: WaveSpeed báo giá theo từng lượt, phụ
 * thuộc độ dài và số cảnh. Con số ở đây là khoảng đo được từ các tập đã sản
 * xuất thật trên Seedance 2.0 Fast (293 và 418 điểm cho hai tập ~30 giây), và
 * được ghi rõ là ước lượng thay vì cam kết.
 */
export const FILM_POINTS_RANGE = { min: 300, max: 450, seconds: 30 } as const;

export type PricingExample = {
  label: string;
  /** Số điểm, hoặc khoảng điểm cho thứ không có giá cố định. */
  points: number | { min: number; max: number };
  note?: string;
};

export const PRICING_EXAMPLES: PricingExample[] = [
  { label: "Một ảnh cho bài đăng", points: POINT_COSTS.meme },
  { label: "Một ảnh nhân vật mới", points: POINT_COSTS.character },
  { label: "Một ảnh nền / bìa", points: POINT_COSTS.background },
  {
    label: `Một phim ngắn ~${FILM_POINTS_RANGE.seconds} giây`,
    points: { min: FILM_POINTS_RANGE.min, max: FILM_POINTS_RANGE.max },
    note: "Tuỳ số cảnh và độ dài; báo giá chính xác hiện trước khi bắt đầu.",
  },
  { label: "Viết nội dung, caption", points: 0, note: "Miễn phí" },
];

/** Số ảnh làm được bằng điểm tặng — câu trả lời cho "miễn phí thì được gì?". */
export function trialImageCount(): number {
  return Math.floor(FREE_TRIAL_POINTS / POINT_COSTS.meme);
}

export function pointsToVnd(points: number): number {
  return points * BILLING_POINT_FLOOR_VND;
}
