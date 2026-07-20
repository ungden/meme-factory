// ============================================
// Point Pricing System — AIDA
// ============================================

import { estimateImageGenerationPrice } from "./ai-pricing";

// Giá được tính từ Standard API cost × 1.5 và quy đổi theo gói point rẻ
// nhất (499đ/point), để cả gói doanh nghiệp vẫn đạt mức cộng 50%.
export const POINT_ACTION_QUOTES = {
  character: estimateImageGenerationPrice({
    model: "gemini-3.1-flash-image",
    resolution: "1K",
    inputImageCount: 4,
    inputTextTokens: 2_000,
  }),
  meme: estimateImageGenerationPrice({
    model: "gemini-3.1-flash-image",
    resolution: "1K",
    inputImageCount: 14,
    inputTextTokens: 2_500,
  }),
  background: estimateImageGenerationPrice({
    model: "gemini-3.1-flash-image",
    resolution: "2K",
    inputImageCount: 0,
    inputTextTokens: 1_500,
  }),
} as const;

export type PointAction = "character" | "meme" | "background" | "content";

export const POINT_COSTS: Record<PointAction, number> = {
  content: 0,     // Miễn phí
  character: POINT_ACTION_QUOTES.character.customerPoints,
  background: POINT_ACTION_QUOTES.background.customerPoints,
  meme: POINT_ACTION_QUOTES.meme.customerPoints,
};

export const POINT_LABELS: Record<PointAction, string> = {
  content: "Tạo nội dung AI",
  character: "Tạo ảnh nhân vật",
  background: "Tạo background AI",
  meme: "Tạo ảnh meme AI",
};

// Free trial — đủ tạo ít nhất một ảnh 1K theo bảng giá hiện tại.
export const FREE_TRIAL_POINTS = POINT_COSTS.meme;

// Gói nạp points
export interface PointPackage {
  id: string;
  name: string;
  points: number;
  price: number;       // VNĐ
  pricePerPoint: number; // VNĐ
  bonus: string;       // % bonus text
  popular?: boolean;
}

export const POINT_PACKAGES: PointPackage[] = [
  {
    id: "trial",
    name: "Dùng thử",
    points: 10,
    price: 10000,
    pricePerPoint: 1000,
    bonus: "",
  },
  {
    id: "basic",
    name: "Cơ bản",
    points: 50,
    price: 45000,
    pricePerPoint: 900,
    bonus: "+11%",
  },
  {
    id: "popular",
    name: "Phổ biến",
    points: 120,
    price: 99000,
    pricePerPoint: 825,
    bonus: "+21%",
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    points: 300,
    price: 199000,
    pricePerPoint: 663,
    bonus: "+51%",
  },
  {
    id: "enterprise",
    name: "Doanh nghiệp",
    points: 1000,
    price: 499000,
    pricePerPoint: 499,
    bonus: "+100%",
  },
];

// Helper: format VNĐ
export function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

// Helper: lấy cost cho action type
export function getPointCost(action: PointAction): number {
  return POINT_COSTS[action];
}

// Helper: check đủ points
export function hasEnoughPoints(currentPoints: number, action: PointAction): boolean {
  return currentPoints >= POINT_COSTS[action];
}
