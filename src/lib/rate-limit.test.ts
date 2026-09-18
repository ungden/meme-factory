import { describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "./rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

function admin(response: { data?: unknown; error?: { message: string } }) {
  return { rpc: vi.fn(async () => response) } as unknown as SupabaseClient;
}

describe("checkRateLimit", () => {
  it("đọc kết quả từ RPC", async () => {
    const client = admin({ data: { allowed: false, remaining: 0, reset_in: 42 } });
    await expect(checkRateLimit(client, RATE_LIMITS.generateImage, "user-1")).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetIn: 42,
    });
  });

  it("ghép khoá theo hành động và chủ thể", async () => {
    const client = admin({ data: { allowed: true, remaining: 29, reset_in: 60 } });
    await checkRateLimit(client, RATE_LIMITS.generateImage, "user-1");
    expect(client.rpc).toHaveBeenCalledWith("rate_limit_hit", {
      _key: "generate-image:user-1",
      _limit: 30,
      _window_seconds: 60,
    });
  });

  it("cho qua khi bảng đếm hỏng — chặn nhầm tệ hơn bỏ lọt", async () => {
    const client = admin({ error: { message: "mất kết nối" } });
    await expect(checkRateLimit(client, RATE_LIMITS.buyPoints, "user-1")).resolves.toEqual({
      allowed: true,
      remaining: RATE_LIMITS.buyPoints.limit,
      resetIn: 0,
    });
  });
});

describe("rateLimitMessage", () => {
  it("nói bằng giây khi dưới một phút, bằng phút khi lâu hơn", () => {
    expect(rateLimitMessage({ allowed: false, remaining: 0, resetIn: 12 })).toContain("12 giây");
    expect(rateLimitMessage({ allowed: false, remaining: 0, resetIn: 300 })).toContain("5 phút");
  });
});
