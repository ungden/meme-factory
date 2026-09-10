import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/admin", () => ({ supabaseAdmin: { rpc } }));
vi.mock("@/lib/supabase/request-auth", () => ({
  getRequestUser: vi.fn(async () => ({
    user: { id: "actor" },
    supabase: { from },
  })),
}));
import { POST } from "./route";

describe("content output review", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    rpc.mockResolvedValue({ data: { productionRunsClosed: 1 }, error: null });
    from.mockImplementation(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: { id: "output", review_version: 3, status: "completed" },
          error: null,
        })),
        single: vi.fn(async () => ({
          data: { id: "output", review_version: 3, status: "approved" },
          error: null,
        })),
      };
      return builder;
    });
  });

  it("records the decision and closes its production run atomically", async () => {
    const response = await POST(
      new Request("https://aida.vn/api/content-outputs/output/approve", {
        method: "POST",
        body: JSON.stringify({ status: "approved" }),
      }) as never,
      { params: Promise.resolve({ id: "output" }) },
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("review_content_output", {
      p_output: "output",
      p_actor: "actor",
      p_status: "approved",
      p_note: null,
      p_expected_version: 3,
    });
  });
});
