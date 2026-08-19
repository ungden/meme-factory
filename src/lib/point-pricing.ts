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

// ============================================
// Margin guard
// ============================================
//
// A flat price is only safe if it covers the *worst* call that price can face.
// The charge happens before the route knows how many references or which provider
// a request will end up using, so the guard is expressed against the ceiling each
// action can reach rather than against one particular call.

import {
  AI_PRICE_MARKUP_MULTIPLIER,
  AI_PRICING_USD_VND,
  BILLING_POINT_FLOOR_VND,
} from "./ai-pricing";

/**
 * Worst-case provider cost for an action, in USD.
 *
 * Reference counts come from the caps the deterministic router actually enforces
 * (14 for Google, 4 identity images for a character pack), not from a guess.
 */
export const WORST_CASE_QUOTES = {
  // A text meme may route to gpt-image-2; medium there is cheaper than Gemini 1K,
  // so Gemini with a full reference set is the expensive branch.
  meme: estimateImageGenerationPrice({
    model: "gemini-3.1-flash-image",
    resolution: "1K",
    inputImageCount: 14,
    inputTextTokens: 4_000,
  }),
  character: estimateImageGenerationPrice({
    model: "gemini-3.1-flash-image",
    resolution: "1K",
    inputImageCount: 4,
    inputTextTokens: 3_000,
  }),
  background: estimateImageGenerationPrice({
    model: "gemini-3.1-flash-image",
    resolution: "2K",
    inputImageCount: 0,
    inputTextTokens: 2_000,
  }),
} as const;

/** Every point sold is worth at least this much, from the cheapest bulk package. */
export const POINT_VALUE_FLOOR_VND = BILLING_POINT_FLOOR_VND;

export interface MarginCheck {
  action: PointAction;
  points: number;
  /** VND the sale brings in, valued at the cheapest package rate. */
  revenueVnd: number;
  worstCostVnd: number;
  /** Revenue divided by cost. 1.5 is the target. */
  marginMultiplier: number;
  coversCost: boolean;
  meetsTarget: boolean;
  /** Smallest price that still hits the target markup. */
  minimumPoints: number;
}

export function checkMargin(action: PointAction, points: number): MarginCheck {
  const quote = action === "content" ? null : WORST_CASE_QUOTES[action];
  const worstCostVnd = quote ? quote.providerCostUsd * AI_PRICING_USD_VND : 0;
  const revenueVnd = points * POINT_VALUE_FLOOR_VND;
  const minimumPoints = quote
    ? Math.max(1, Math.ceil((worstCostVnd * AI_PRICE_MARKUP_MULTIPLIER) / POINT_VALUE_FLOOR_VND))
    : 0;

  return {
    action,
    points,
    revenueVnd: Math.round(revenueVnd),
    worstCostVnd: Math.round(worstCostVnd),
    marginMultiplier: worstCostVnd === 0 ? Infinity : revenueVnd / worstCostVnd,
    coversCost: revenueVnd >= worstCostVnd,
    meetsTarget: points >= minimumPoints,
    minimumPoints,
  };
}

/** Cheapest price per action that still clears the target markup. */
export function minimumSafePoints(action: PointAction): number {
  return checkMargin(action, 0).minimumPoints;
}

/** Shape check for a price table coming from the database. */
export function parsePointCosts(raw: unknown): Record<PointAction, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const parsed = { ...POINT_COSTS };

  for (const action of Object.keys(POINT_COSTS) as PointAction[]) {
    const value = source[action];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return null;
    }
    parsed[action] = value;
  }
  return parsed;
}
