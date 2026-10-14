import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  events: [] as string[],
  spend: vi.fn(),
  rpc: vi.fn(),
  persist: vi.fn(),
  prior: vi.fn(),
  runMemeImage: vi.fn(),
  jobInsertError: null as null | { code?: string; message: string },
}));

vi.mock("@/lib/supabase/request-auth", () => ({
  getRequestUser: vi.fn(async () => ({
    user: { id: "user-1" },
    supabase: {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: { id: "project-1", name: "Kênh", user_id: "user-1" } }),
        };
        return builder;
      },
    },
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: (name: string, args: unknown) => {
      h.events.push(`rpc:${name}`);
      return h.rpc(name, args);
    },
    from: (table: string) => {
      const builder = {
        insert: async () => {
          h.events.push(`${table}:insert`);
          return { error: h.jobInsertError };
        },
        update: (payload: { status?: string }) => {
          h.events.push(`${table}:update:${payload.status ?? ""}`);
          return builder;
        },
        eq: async () => ({ error: null }),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { generateImage: {} },
  checkRateLimit: async () => ({ allowed: true }),
  rateLimitMessage: () => "",
}));
vi.mock("@/lib/point-pricing.server", () => ({
  getPointCost: async () => 40,
  assertPriceCoversCost: async () => undefined,
}));
vi.mock("@/lib/project-points", () => ({
  spendProjectPoints: (...args: unknown[]) => {
    h.events.push("spend");
    return h.spend(...args);
  },
}));
vi.mock("@/lib/meme-image", () => ({
  planMemeImage: () => ({
    useOpenAi: false,
    recipe: {
      creationKind: "meme",
      workflowVersion: "v",
      provider: "google",
      model: "m",
      policy: "balanced",
      prompt: "p",
      references: [],
      droppedReferences: [],
      manifestHash: "h",
      output: {},
    },
    priceEstimate: { providerCostUsd: 0.01, effectiveDate: "2026-01-01", markupMultiplier: 1.3, sourceUrl: "" },
  }),
  runMemeImage: (...args: unknown[]) => {
    h.events.push("draw");
    return h.runMemeImage(...args);
  },
}));
vi.mock("@/lib/ai-pricing", async (load) => ({
  ...(await load<typeof import("@/lib/ai-pricing")>()),
  calculateGoogleImageActualCost: () => 0.01,
}));
vi.mock("@/lib/meme-draw", async (load) => ({
  ...(await load<typeof import("@/lib/meme-draw")>()),
  readDrawPrior: (...args: unknown[]) => h.prior(...args),
  persistDrawnMeme: (...args: unknown[]) => {
    h.events.push("persist");
    return h.persist(...args);
  },
}));

import { POST } from "./route";

const ID = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";

function draw(extra: Record<string, unknown> = {}) {
  return POST(
    new Request("https://aida.vn/api/ai/generate-image", {
      method: "POST",
      body: JSON.stringify({
        type: "meme",
        project_id: "project-1",
        headline: "Em rảnh không?",
        format: "1:1",
        request_id: ID,
        save: { original_idea: "Sếp nhắn", generated_content: { headline: "Em rảnh không?" }, has_watermark: true },
        ...extra,
      }),
    }) as never,
  );
}

describe("generate-image for a hand-made meme", () => {
  beforeEach(() => {
    h.events.length = 0;
    h.jobInsertError = null;
    h.spend.mockReset().mockResolvedValue({ ok: true, projectPoints: 60, toppedUp: 0 });
    h.rpc.mockReset().mockResolvedValue({ data: {}, error: null });
    h.persist.mockReset().mockResolvedValue({ id: "meme-1", image_url: "https://cdn.test/memes/a.png" });
    h.prior.mockReset().mockResolvedValue({ meme: null, job: null, paid: false });
    h.runMemeImage.mockReset().mockResolvedValue({ image: "aW1n", usage: null });
  });

  it("saves to the library before marking the job done, so a crash in between is refunded by the sweeper", async () => {
    const response = await draw();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ meme_id: "meme-1", image_url: "https://cdn.test/memes/a.png", generation_request_id: ID });
    expect(h.events).toEqual(["spend", "generation_jobs:insert", "draw", "persist", "generation_jobs:update:completed"]);
    expect(h.spend.mock.calls[0][1]).toMatchObject({ requestId: ID, cost: 40 });
  });

  it("returns the already saved meme for a resent id without charging", async () => {
    h.prior.mockResolvedValue({ meme: { id: "meme-1", image_url: "https://cdn.test/memes/a.png" }, job: { status: "completed" }, paid: true });
    const response = await draw();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ replayed: true, meme_id: "meme-1", pointsUsed: 0 });
    expect(h.events).toEqual([]);
  });

  it("refuses to reuse an id that was charged before", async () => {
    h.prior.mockResolvedValue({ meme: null, job: { status: "failed" }, paid: true });
    const response = await draw();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("REQUEST_USED");
    expect(h.events).toEqual([]);
  });

  it("does not refund when a parallel request with the same id already owns the job", async () => {
    h.jobInsertError = { code: "23505", message: "duplicate key" };
    const response = await draw();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("DRAW_IN_PROGRESS");
    expect(h.events).not.toContain("rpc:atomic_refund_project_points");
  });

  it("refunds and says how much when the drawing fails", async () => {
    h.runMemeImage.mockRejectedValue(new Error("Không nhận được kết quả"));
    const response = await draw();
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ error: "Chưa nhận được ảnh. Bạn thử lại nhé.", refundedPoints: 40 });
    expect(h.events).toContain("rpc:atomic_refund_project_points");
    expect(h.events).not.toContain("persist");
  });

  it("still returns the paid image when saving fails, without refunding", async () => {
    h.persist.mockRejectedValue(new Error("MEME_INSERT_FAILED:rls"));
    const response = await draw();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.image).toBe("aW1n");
    expect(body.meme_id).toBeUndefined();
    expect(h.events).not.toContain("rpc:atomic_refund_project_points");
  });

  it("draws without saving when the caller does not ask for it (mobile app)", async () => {
    const response = await draw({ request_id: undefined, save: undefined });
    expect(response.status).toBe(200);
    expect(h.prior).not.toHaveBeenCalled();
    expect(h.events).not.toContain("persist");
  });
});
