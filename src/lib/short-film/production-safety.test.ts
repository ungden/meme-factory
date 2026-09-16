import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilmPlan } from "./contracts";

vi.mock("server-only", () => ({}));

const { quotePlan, tasksForPlan, readPlan, savePlan } = vi.hoisted(() => ({
  quotePlan: vi.fn(),
  tasksForPlan: vi.fn(),
  readPlan: vi.fn(),
  savePlan: vi.fn(),
}));
vi.mock("./server", () => ({ tasksForPlan, readPlan, savePlan }));
vi.mock("./quote", () => ({ quotePlan }));
vi.mock("./automatic-qa", () => ({
  checkProductionScript: vi.fn(),
  checkTechnicalTask: vi.fn(),
  checkVisualTask: vi.fn(),
  visualEvidencePath: vi.fn(),
}));

const scene = {
  id: "scene-1",
  version: 1,
  scene_index: 0,
  dialogue: "",
  cast_snapshot: [],
} as unknown as FilmPlan["video_plan_scenes"][number];

const plan = {
  id: "plan-1",
  version: 3,
  audio_mode: "dubbed",
  video_plan_scenes: [scene],
} as unknown as FilmPlan;

const baseRun = {
  id: "run-1",
  project_id: "project-1",
  workspace_version: 2,
  plan_id: "plan-1",
  plan_version: 3,
  source: "manual",
  intent: "",
  guests: [],
  status: "running",
  phase: "prepare",
  snapshot: { scriptCheck: "passed" },
  input_snapshot: { plan },
  created_by: "user-1",
  lease_owner: "owner-1",
};

type RpcArgs = Record<string, unknown> | undefined;
type RpcResult = { data: unknown; error: { message: string } | null };
type RpcMock = (name: string, args?: RpcArgs) => Promise<RpcResult>;

/** Patches applied through checkpoint_film_production_run, in call order. */
function patches(rpc: ReturnType<typeof vi.fn<RpcMock>>) {
  return rpc.mock.calls
    .filter(([name]) => name === "checkpoint_film_production_run")
    .map(([, args]) => (args?.p_patch || {}) as { status?: string; error?: string });
}

function makeAdmin(rpc: ReturnType<typeof vi.fn<RpcMock>>) {
  return {
    rpc,
    from: () => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => ({
          data: {
            id: "project-1",
            user_id: "user-1",
            name: "QA",
            workspace_version: 2,
          },
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tasksForPlan.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("paid stage acceptance", () => {
  it("does not spend points when the lease is lost while quoting", async () => {
    vi.useFakeTimers();
    const rpc = vi.fn<RpcMock>(async (name) => {
      // The heartbeat is what discovers the stolen lease.
      if (name === "heartbeat_film_production_run")
        return { data: null, error: { message: "RUN_LEASE_LOST" } };
      return { data: { ok: true }, error: null };
    });
    // quotePlan goes to the network and takes real time. That is exactly the
    // window in which another worker can claim the run; the lease check before
    // it has already gone stale by the time the spend happens.
    quotePlan.mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
      return { id: "quote-1", points: 12 };
    });

    const { advanceProductionRun } = await import("./production");
    await advanceProductionRun(
      makeAdmin(rpc) as never,
      { ...baseRun } as never,
    );

    const called = rpc.mock.calls.map(([name]) => name);
    expect(called).toContain("heartbeat_film_production_run");
    expect(called).not.toContain("accept_film_quote");
  });

  it("accepts the quote when the lease is still held", async () => {
    const rpc = vi.fn<RpcMock>(async () => ({ data: { ok: true }, error: null }));
    quotePlan.mockResolvedValue({ id: "quote-1", points: 12 });

    const { advanceProductionRun } = await import("./production");
    await advanceProductionRun(
      makeAdmin(rpc) as never,
      { ...baseRun } as never,
    );

    expect(rpc.mock.calls.map(([name]) => name)).toContain("accept_film_quote");
  });

  it("parks the run as budget_blocked on an exact budget code", async () => {
    const rpc = vi.fn<RpcMock>(async (name) => {
      if (name === "accept_film_quote")
        return { data: null, error: { message: "PRODUCTION_BUDGET_EXCEEDED" } };
      return { data: { ok: true }, error: null };
    });
    quotePlan.mockResolvedValue({ id: "quote-1", points: 12 });

    const { advanceProductionRun } = await import("./production");
    await advanceProductionRun(
      makeAdmin(rpc) as never,
      { ...baseRun } as never,
    );

    const blocked = patches(rpc).find((p) => p.status === "budget_blocked");
    expect(blocked).toBeDefined();
    // The stored value stays the machine code — it is the forensic trail, and
    // the UI translates it. It must not be raw Postgres prose either way.
    expect(blocked?.error).toBe("PRODUCTION_BUDGET_EXCEEDED");
  });

  it("treats a non-budget failure as a real error, not a budget stop", async () => {
    const rpc = vi.fn<RpcMock>(async (name) => {
      if (name === "accept_film_quote")
        // Previously matched by includes("BUDGET") and mis-parked as a budget stop.
        return { data: null, error: { message: "RUN_QUOTE_MISMATCH" } };
      return { data: { ok: true }, error: null };
    });
    quotePlan.mockResolvedValue({ id: "quote-1", points: 12 });

    const { advanceProductionRun } = await import("./production");
    await advanceProductionRun(
      makeAdmin(rpc) as never,
      { ...baseRun } as never,
    );

    const statuses = patches(rpc).map((p) => p.status);
    expect(statuses).toContain("needs_review");
    expect(statuses).not.toContain("budget_blocked");
  });
});
