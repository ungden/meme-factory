import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError } from "./observability";

/**
 * Giới hạn số lượt gọi cho những endpoint tốn tiền hoặc tốn quota.
 *
 * Nguyên tắc: hỏng thì cho qua. Một sự cố ở bảng đếm không được biến thành sự
 * cố của cả sản phẩm — chặn nhầm người dùng thật tệ hơn là bỏ lọt vài lượt gọi.
 */

export type RateLimitRule = {
  /** Tên hành động, ví dụ "generate-image". */
  action: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = { allowed: boolean; remaining: number; resetIn: number };

/** Các mức giới hạn dùng chung, để đọc ở một chỗ thay vì rải trong từng route. */
export const RATE_LIMITS = {
  generateImage: { action: "generate-image", limit: 30, windowSeconds: 60 },
  suggestCharacters: { action: "suggest-characters", limit: 10, windowSeconds: 60 },
  createTopup: { action: "create-topup", limit: 10, windowSeconds: 600 },
  buyPoints: { action: "buy-points", limit: 20, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export async function checkRateLimit(
  admin: SupabaseClient,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc("rate_limit_hit", {
      _key: `${rule.action}:${subject}`,
      _limit: rule.limit,
      _window_seconds: rule.windowSeconds,
    });
    if (error) throw new Error(error.message);
    const payload = (data || {}) as { allowed?: boolean; remaining?: number; reset_in?: number };
    return {
      allowed: payload.allowed !== false,
      remaining: Number(payload.remaining ?? 0),
      resetIn: Number(payload.reset_in ?? rule.windowSeconds),
    };
  } catch (error) {
    await reportError(error, { scope: "rate-limit", tags: { action: rule.action }, level: "warning" });
    return { allowed: true, remaining: rule.limit, resetIn: 0 };
  }
}

/** Câu báo cho người dùng, nói rõ phải chờ bao lâu. */
export function rateLimitMessage(result: RateLimitResult): string {
  const seconds = Math.max(1, Math.ceil(result.resetIn));
  if (seconds < 60) return `Bạn thao tác hơi nhanh. Thử lại sau ${seconds} giây nhé.`;
  return `Bạn thao tác hơi nhanh. Thử lại sau ${Math.ceil(seconds / 60)} phút nhé.`;
}
