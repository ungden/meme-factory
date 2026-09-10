import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
const purchaseKey = "123e4567-e89b-42d3-a456-426614174000";
vi.mock("@/lib/admin", () => ({ supabaseAdmin: {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: "test-user" } }, error: null })) }, rpc,
} }));
import { POST } from "./route";

describe("point package price consent", () => {
  beforeEach(() => rpc.mockReset());
  it.each([
    { packageId: "basic" },
    { packageId: "basic", expectedPrice: 45000, expectedPoints: 50 },
    { packageId: "basic", expectedPrice: 50000, expectedPoints: 999 },
  ])("rejects stale or missing displayed price before touching money", async (body) => {
    const response = await POST(new Request("https://aida.vn/api/wallet/buy-points", {
      method: "POST", headers: { authorization: "Bearer fixture" }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses server package values when the displayed price matches", async () => {
    rpc.mockResolvedValue({ data: { success: true, points: 100, balance: 0 }, error: null });
    const response = await POST(new Request("https://aida.vn/api/wallet/buy-points", {
      method: "POST", headers: { authorization: "Bearer fixture" },
      body: JSON.stringify({ packageId: "basic", expectedPrice: 50000, expectedPoints: 100, idempotencyKey: purchaseKey }),
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("buy_points_idempotent", expect.objectContaining({ p_key: purchaseKey, p_price: 50000, p_points: 100 }));
  });
  it("requires a stable purchase id before touching money", async () => {
    const response = await POST(new Request("https://aida.vn/api/wallet/buy-points", {
      method: "POST", headers: { authorization: "Bearer fixture" },
      body: JSON.stringify({ packageId: "basic", expectedPrice: 50000, expectedPoints: 100 }),
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
