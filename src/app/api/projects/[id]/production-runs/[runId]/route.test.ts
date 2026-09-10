import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
const run = {
  id: "run",
  project_id: "project",
  workspace_version: 4,
  status: "budget_blocked",
  updated_at: "2026-09-10T00:00:00Z",
};
vi.mock("@/lib/short-film/server", () => ({
  FilmError: class FilmError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  fail: (error: { message?: string; status?: number }) =>
    Response.json({ error: error.message }, { status: error.status || 500 }),
  access: vi.fn(async () => ({
    user: { id: "owner" },
    project: { id: "project", user_id: "owner", workspace_version: 4 },
    admin: {
      from: () => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: run, error: null })),
        };
        return builder;
      },
      rpc,
    },
  })),
}));
import { PATCH } from "./route";

describe("production run resume", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { ...run, status: "running" }, error: null });
  });

  it("updates the accepted caps in the guarded resume transition", async () => {
    const response = await PATCH(
      new Request("https://aida.vn/api/projects/project/production-runs/run", {
        method: "PATCH",
        body: JSON.stringify({ action: "resume", maxPointsPerFilm: 900, maxPointsPerDay: 1800 }),
      }) as never,
      { params: Promise.resolve({ id: "project", runId: "run" }) },
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("control_film_production_run_v2", expect.objectContaining({
      p_max_film: 900,
      p_max_day: 1800,
    }));
  });
});
