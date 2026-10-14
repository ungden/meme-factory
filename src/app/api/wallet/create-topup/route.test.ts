import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { createTopup: {} },
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  rateLimitMessage: () => "",
}));
vi.mock("@/lib/admin", () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: async () => ({ count: 0 }) }) }),
      insert: (row: unknown) => {
        insert(row);
        return { select: () => ({ single: async () => ({ data: { id: "abcdef12-0000-4000-8000-000000000000" }, error: null }) }) };
      },
    }),
  },
}));
vi.stubEnv("SEPAY_BANK_ACCOUNT", "123");
const { POST } = await import("./route");

const call = (body: unknown) =>
  POST(new Request("https://aida.vn/api/wallet/create-topup", {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

describe("tạo lần nạp", () => {
  beforeEach(() => insert.mockReset());

  it("nạp để mua gói: lấy giá gói làm số tiền và ghi gói vào đơn", async () => {
    const response = await call({ packageId: "basic", amount: 1 });
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000, buy_package_id: "basic", buy_points: 100 }));
    expect((await response.json()).points).toBe(100);
  });

  it("nạp tiền thường không kèm gói", async () => {
    await call({ amount: 20000 });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("buy_package_id");
  });

  it("gói không có thật thì không tạo đơn", async () => {
    const response = await call({ packageId: "khong-co" });
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
