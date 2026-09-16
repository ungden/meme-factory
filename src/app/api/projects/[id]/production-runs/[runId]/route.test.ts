import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, actor } = vi.hoisted(() => ({
  rpc: vi.fn(),
  actor: { id: "owner" },
}));
const run = {
  id: "run",
  project_id: "project",
  workspace_version: 4,
  status: "budget_blocked",
  max_points_per_film: 500,
  max_points_per_day: 1000,
  updated_at: "2026-09-10T00:00:00Z",
};
vi.mock("@/lib/short-film/server", () => ({
  FilmError: class FilmError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  fail: (error: { message?: string; status?: number }) =>
    Response.json({ error: error.message }, { status: error.status || 500 }),
  access: vi.fn(async () => ({
    user: { id: actor.id },
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

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://aida.vn/api/projects/project/production-runs/run", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: "project", runId: "run" }) },
  );
}

describe("production run resume", () => {
  beforeEach(() => {
    rpc.mockReset();
    actor.id = "owner";
    rpc.mockResolvedValue({ data: { ...run, status: "running" }, error: null });
  });

  it("updates the accepted caps in the guarded resume transition", async () => {
    const response = await patch({
      action: "resume",
      maxPointsPerFilm: 900,
      maxPointsPerDay: 1800,
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "control_film_production_run_v2",
      expect.objectContaining({ p_max_film: 900, p_max_day: 1800 }),
    );
  });

  it("resumes with the stored caps when no budget is supplied", async () => {
    const response = await patch({ action: "resume" });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "control_film_production_run_v2",
      expect.objectContaining({ p_max_film: null, p_max_day: null }),
    );
  });

  // Half a budget used to skip both the validation and hasBudgetUpdate, so the
  // run silently resumed on its OLD caps and the API still answered 200.
  it.each([
    { maxPointsPerFilm: 900 },
    { maxPointsPerDay: 1800 },
    { maxPointsPerFilm: 900, maxPointsPerDay: "1800" },
  ])("rejects a half-specified budget %o without calling the RPC", async (budget) => {
    const response = await patch({ action: "resume", ...budget });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a day cap below the per-film cap", async () => {
    const response = await patch({
      action: "resume",
      maxPointsPerFilm: 900,
      maxPointsPerDay: 100,
    });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets a non-owner lower the caps, matching the RPC's own rule", async () => {
    actor.id = "member";
    const response = await patch({
      action: "resume",
      maxPointsPerFilm: 100,
      maxPointsPerDay: 200,
    });
    expect(response.status).toBe(200);
  });

  it("still requires the owner to raise a cap", async () => {
    actor.id = "member";
    const response = await patch({
      action: "resume",
      maxPointsPerFilm: 500,
      maxPointsPerDay: 5000,
    });
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("control RPC failures", () => {
  beforeEach(() => {
    rpc.mockReset();
    actor.id = "owner";
  });

  // includes("CONFLICT") gave 400 for a missing run and a forbidden actor.
  it.each([
    ["RUN_NOT_FOUND", 404],
    ["RUN_CONTROL_FORBIDDEN", 403],
    ["OWNER_REQUIRED", 403],
    ["RUN_VERSION_CONFLICT", 409],
    ["RUN_ACTION_INVALID", 409],
    ["BUDGET_BELOW_COMMITTED", 400],
    ["SOMETHING_UNMAPPED", 400],
  ])("maps %s to HTTP %i", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    const response = await patch({ action: "resume" });
    expect(response.status).toBe(status);
  });

  it("answers in Vietnamese instead of the raw code", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "BUDGET_BELOW_COMMITTED" },
    });
    const body = await (await patch({ action: "resume" })).json();
    expect(body.error).not.toMatch(/[A-Z][A-Z0-9]*_[A-Z0-9]+/);
    expect(body.error).toContain("cam kết");
  });
});
