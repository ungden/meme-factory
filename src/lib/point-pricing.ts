// ============================================
// Point Pricing System — AIDA
// ============================================

// Bảng giá point cho từng tính năng
// Cost tham chiếu: gemini-3.1-flash-image-preview (Paid Tier)
// - Character pose (1K): 1120 tokens × $60/1M = $0.067/ảnh ≈ 1.709đ
// - Meme/Background (2K): 1680 tokens × $60/1M = $0.101/ảnh ≈ 2.576đ
// - Content gen (text only, gemini-2.0-flash): ~5-10đ (gần 0)

export type PointAction = "character" | "meme" | "background" | "content";

export const POINT_COSTS: Record<PointAction, number> = {
  content: 0,     // Miễn phí
  character: 3,   // 3 points — tạo ảnh nhân vật (1K)
  background: 4,  // 4 points — tạo background (2K)
  meme: 5,        // 5 points — tạo meme hoàn chỉnh (2K)
};

export const POINT_LABELS: Record<PointAction, string> = {
  content: "Tạo nội dung AI",
  character: "Tạo ảnh nhân vật",
  background: "Tạo background AI",
  meme: "Tạo ảnh meme AI",
};

// Free trial — tặng khi đăng ký mới
export const FREE_TRIAL_POINTS = 5;

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
