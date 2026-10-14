import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  jobs: new Map<string, Record<string, unknown>>(),
  jobUpdates: [] as Array<{ id: unknown; patch: Record<string, unknown> }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/point-pricing.server", () => ({ getPointCost: async () => 5, assertPriceCoversCost: async () => undefined }));
vi.mock("@/lib/admin", () => ({
  getSupabaseAdmin: () => ({
    // Giống atomic_deduct_project_points: mã đã có giao dịch thì trả "đã trừ" mà không trừ nữa.
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ name, args });
      return { data: { success: true, points: 10 }, error: null };
    },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (h.jobs.has(String(row.id))) return { error: { code: "23505", message: "duplicate key" } };
        h.jobs.set(String(row.id), row);
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_column: string, id: unknown) => {
          h.jobUpdates.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  }),
}));

const { chargedCharacterImage, DuplicateRequestError } = await import("./charged-image");

const base = {
  project: { id: "p1", user_id: "u1", name: "Kênh" },
  actorUserId: "u1",
  description: "ảnh thêm",
  workflowVersion: "test",
  model: "m",
  provider: "google" as const,
  prompt: "prompt",
  references: [],
  estimate: { providerCostUsd: 0 } as never,
  requestedOutput: {},
};

describe("chargedCharacterImage với mã của trình duyệt", () => {
  beforeEach(() => {
    h.rpcCalls = [];
    h.jobs = new Map();
    h.jobUpdates = [];
  });

  it("trừ điểm bằng đúng mã trình duyệt gửi", async () => {
    const { requestId } = await chargedCharacterImage({ ...base, requestId: "req-1", generate: async () => ({}) });
    expect(requestId).toBe("req-1");
    expect(h.rpcCalls[0]).toMatchObject({ name: "atomic_deduct_project_points", args: { _request_id: "req-1" } });
  });

  it("lần gọi trùng mã không vẽ, không hoàn, không đánh dấu hỏng job của lần kia", async () => {
    h.jobs.set("req-1", { id: "req-1", status: "running" });
    const generate = vi.fn(async () => ({}));
    await expect(chargedCharacterImage({ ...base, requestId: "req-1", generate })).rejects.toBeInstanceOf(DuplicateRequestError);
    expect(generate).not.toHaveBeenCalled();
    expect(h.rpcCalls.map((call) => call.name)).not.toContain("atomic_refund_project_points");
    expect(h.jobUpdates).toHaveLength(0);
  });

  it("không gửi mã thì mỗi lần là một lượt mới như trước", async () => {
    const one = await chargedCharacterImage({ ...base, generate: async () => ({}) });
    const two = await chargedCharacterImage({ ...base, generate: async () => ({}) });
    expect(one.requestId).not.toBe(two.requestId);
  });

  it("vẽ hỏng thì vẫn hoàn theo đúng mã", async () => {
    await expect(
      chargedCharacterImage({
        ...base,
        requestId: "req-2",
        generate: async () => {
          throw new Error("provider down");
        },
      }),
    ).rejects.toThrow("provider down");
    expect(h.rpcCalls.at(-1)).toMatchObject({ name: "atomic_refund_project_points", args: { _request_id: "req-2" } });
  });
});
