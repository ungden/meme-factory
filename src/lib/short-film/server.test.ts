import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilmTask } from "./contracts";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/supabase/request-auth", () => ({ getRequestUser: vi.fn() }));

const task = (overrides: Partial<FilmTask>): FilmTask =>
  ({
    id: "task",
    kind: "image",
    scene_id: null,
    scene_version: null,
    plan_version: 1,
    status: "completed",
    input: {},
    result: null,
    error: null,
    approved_at: null,
    created_at: "2026-09-10T00:00:00Z",
    ...overrides,
  }) as FilmTask;

/**
 * Mimics the two PostgREST queries tasksForPlan issues. `filtered` is what the
 * accepted-only query returns; `recent` is the newest page.
 */
function adminReturning(recent: FilmTask[], acceptedOnly: FilmTask[]) {
  return {
    from: () => {
      let isAcceptedQuery = false;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        or: () => {
          isAcceptedQuery = true;
          return builder;
        },
        order: () => builder,
        limit: () =>
          Promise.resolve({
            data: isAcceptedQuery ? acceptedOnly : recent,
            error: null,
          }),
      };
      return builder;
    },
  };
}

const project = { id: "project-1", workspace_version: 2 };

describe("tasksForPlan", () => {
  async function run(recent: FilmTask[], acceptedOnly: FilmTask[]) {
    const { tasksForPlan } = await import("./server");
    return tasksForPlan(
      { project, admin: adminReturning(recent, acceptedOnly) } as never,
      "plan-1",
    );
  }

  it("includes an approved task missing from the newest page", async () => {
    const approved = task({
      id: "approved-old",
      approved_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
    });
    const recent = [
      task({ id: "recent-a", created_at: "2026-09-12T00:00:00Z" }),
      task({ id: "recent-b", created_at: "2026-09-11T00:00:00Z" }),
    ];
    const ids = (await run(recent, [approved])).map((t) => t.id);
    expect(ids).toContain("approved-old");
    expect(ids).toHaveLength(3);
  });

  it("does not duplicate a task present in both queries", async () => {
    const shared = task({
      id: "shared",
      auto_accepted_at: "2026-09-12T00:00:00Z",
      created_at: "2026-09-12T00:00:00Z",
    });
    const ids = (await run([shared], [shared])).map((t) => t.id);
    expect(ids).toEqual(["shared"]);
  });

  it("returns newest first", async () => {
    const older = task({ id: "older", created_at: "2026-09-01T00:00:00Z" });
    const newer = task({ id: "newer", created_at: "2026-09-14T00:00:00Z" });
    const ids = (await run([newer], [older])).map((t) => t.id);
    expect(ids).toEqual(["newer", "older"]);
  });
});

describe("modelPrice", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.WAVESPEED_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("converts a provider price into whole points", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ data: { price: 0.1 } }),
    ) as never;
    const { modelPrice } = await import("./server");
    expect(await modelPrice("model", {})).toBeGreaterThan(0);
  });

  it("sends an abort signal so a hung provider cannot pin the request", async () => {
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit) => {
        void _url;
        void init;
        return Response.json({ data: { price: 0.1 } });
      },
    );
    globalThis.fetch = fetchMock as never;
    const { modelPrice } = await import("./server");
    await modelPrice("model", {});
    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty("signal");
  });

  it.each([
    ["a non-OK response", () => new Response("nope", { status: 500 })],
    ["a zero price", () => Response.json({ data: { price: 0 } })],
    ["a non-numeric price", () => Response.json({ data: { price: "x" } })],
  ])("refuses to quote on %s", async (_label, make) => {
    globalThis.fetch = vi.fn(async () => make()) as never;
    const { modelPrice } = await import("./server");
    await expect(modelPrice("model", {})).rejects.toThrow();
  });

  it("fails fast once the request's pricing budget is spent", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { price: 0.1 } }));
    globalThis.fetch = fetchMock as never;
    const { modelPrice } = await import("./server");
    await expect(
      modelPrice("model", {}, Date.now() - 1),
    ).rejects.toThrow(/chậm/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * quotePlan decides every charge in the product. These cover its refusals —
 * the parts that protect money — rather than the happy path, which needs a
 * whole plan's worth of media state.
 */
describe("quotePlan gates", () => {
  const scene = {
    id: "scene-1",
    version: 1,
    scene_index: 0,
    dialogue: "",
    image_prompt: "",
    motion_prompt: "",
    cast_snapshot: [],
    storyboard: null,
    performance_direction: null,
  };
  const plan = {
    id: "plan-1",
    version: 2,
    format: "16:9",
    resolution: "720p",
    audio_mode: "dubbed",
    video_model: "bytedance/seedance-2.5/text-to-video",
    script_review: { version: 2, reviewed_at: "2026-09-12T00:00:00Z" },
    story: null,
    video_plan_scenes: [scene],
  };

  /**
   * Admin double for channel_profiles (count + latest) and production runs.
   * A PostgREST builder is both chainable AND awaitable, so this one is too —
   * the head/count query awaits the chain itself rather than a terminal call.
   */
  function quoteAdmin(options: { profileCount?: number; runPassed?: boolean } = {}) {
    return {
      rpc: vi.fn(),
      from: (table: string) => {
        const settled = {
          count: options.profileCount ?? 0,
          data: null as unknown,
          error: null,
        };
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () =>
            table === "short_film_production_runs"
              ? {
                  data: options.runPassed
                    ? { id: "run-1", snapshot: { scriptCheck: "passed" } }
                    : null,
                  error: null,
                }
              : { data: null, error: null },
          then: (resolve: (value: unknown) => unknown) => resolve(settled),
        };
        return builder;
      },
    };
  }

  function quoteAccess(options?: { profileCount?: number; runPassed?: boolean }) {
    return {
      project: { id: "project-1", workspace_version: 3 },
      user: { id: "user-1" },
      admin: quoteAdmin(options),
    } as never;
  }

  const body = (extra: Record<string, unknown> = {}) => ({
    workspaceVersion: 3,
    expectedVersion: 2,
    stage: "prepare",
    ...extra,
  });

  it("refuses a stale workspace before touching anything else", async () => {
    const { quotePlan } = await import("./quote");
    await expect(
      quotePlan(quoteAccess(), plan as never, body({ workspaceVersion: 2 })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a plan version the caller did not expect", async () => {
    const { quotePlan } = await import("./quote");
    await expect(
      quotePlan(quoteAccess(), plan as never, body({ expectedVersion: 1 })),
    ).rejects.toMatchObject({ status: 409 });
  });

  // The first/last-frame route is gone; asking for it must say so, not 500.
  it("answers 410 for the retired frame stage", async () => {
    const { quotePlan } = await import("./quote");
    await expect(
      quotePlan(quoteAccess(), plan as never, body({ stage: "frame" })),
    ).rejects.toMatchObject({ status: 410 });
  });

  it.each(["prepare", "video"])(
    "refuses stage %s while the plan is still native audio",
    async (stage) => {
      const { quotePlan } = await import("./quote");
      await expect(
        quotePlan(
          quoteAccess(),
          { ...plan, audio_mode: "native" } as never,
          body({ stage }),
        ),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  // A project with a channel profile is a managed series: its script has to be
  // reviewed before any media is paid for.
  it("refuses unreviewed media prep when the project has a channel profile", async () => {
    const { quotePlan } = await import("./quote");
    await expect(
      quotePlan(
        quoteAccess({ profileCount: 1 }),
        { ...plan, script_review: null } as never,
        body(),
      ),
    ).rejects.toThrow(/Duyệt bản kịch bản/);
  });

  it("accepts an automatic run whose script check already passed", async () => {
    const { quotePlan } = await import("./quote");
    // Gets past the review gate, then stops for a different reason.
    await expect(
      quotePlan(
        quoteAccess({ profileCount: 1, runPassed: true }),
        { ...plan, script_review: null } as never,
        body({ productionRunId: "run-1" }),
      ),
    ).rejects.not.toThrow(/Duyệt bản kịch bản/);
  });

  it("refuses when the selected scene ids match nothing in the plan", async () => {
    const { quotePlan } = await import("./quote");
    await expect(
      quotePlan(quoteAccess(), plan as never, body({ sceneIds: ["ghost"] })),
    ).rejects.toThrow(/Chọn cảnh/);
  });

  // The coherence gate stops a plan that mixes a new script's dialogue with the
  // previous episode's prompts and cast.
  it("refuses an incoherent plan with the per-scene explanation", async () => {
    const { quotePlan } = await import("./quote");
    const incoherent = {
      ...plan,
      video_plan_scenes: [
        { ...scene, dialogue: "Có thoại", speaker_character_id: "nobody" },
      ],
    };
    await expect(
      quotePlan(quoteAccess(), incoherent as never, body()),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("perScene", () => {
  const scene = (id: string) => ({ id }) as never;

  it("runs the scenes concurrently rather than one after another", async () => {
    const { perScene } = await import("./quote");
    let running = 0;
    let peak = 0;
    await perScene([scene("a"), scene("b"), scene("c")], async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return [];
    });
    expect(peak).toBe(3);
  });

  it("flattens results in scene order", async () => {
    const { perScene } = await import("./quote");
    const result = await perScene(
      [scene("a"), scene("b"), scene("c")],
      async (s) => {
        // Finish out of order on purpose.
        await new Promise((r) => setTimeout(r, s.id === "a" ? 15 : 1));
        return [s.id];
      },
    );
    expect(result).toEqual(["a", "b", "c"]);
  });

  /**
   * The point of the helper. With a bare Promise.all the surfaced error is
   * whichever scene rejected first in wall-clock time, so the same broken plan
   * could report "Cảnh 1" or "Cảnh 3" depending on the network.
   */
  it("reports the first failure by scene order, not by timing", async () => {
    const { perScene } = await import("./quote");
    await expect(
      perScene([scene("a"), scene("b"), scene("c")], async (s) => {
        if (s.id === "c") throw new Error("Cảnh 3 hỏng");
        if (s.id === "a") {
          await new Promise((r) => setTimeout(r, 20));
          throw new Error("Cảnh 1 hỏng");
        }
        return [];
      }),
    ).rejects.toThrow("Cảnh 1 hỏng");
  });

  it("returns an empty list when every scene contributes nothing", async () => {
    const { perScene } = await import("./quote");
    expect(await perScene([scene("a"), scene("b")], async () => [])).toEqual([]);
  });
});

// Lưu lại một tập do AI làm mà không sửa gì từng tăng version mọi cảnh: jsonb
// sắp lại khoá và cột performance_direction được ghi null cho cảnh storyboard.
describe("scene hash input", () => {
  it("matches a saved scene regardless of key order and derived direction", async () => {
    const { sceneHashInput } = await import("./server");
    const { manifestHash } = await import("@/lib/continuity/hashing");
    const direction = { lane: "cinematic_emotion", hook: "Bố cõng con." };
    const storyboard = { version: 2, performanceDirection: direction, beats: [{ dialogue: "", action: "Cõng con", segmentId: "abc" }] };
    const saved = { dialogue: "", action: "Cõng con", performance_direction: null, storyboard, cast_snapshot: [{ name: "Bố", characterId: "bo" }], source_mode: "manual" };
    const sent = { source_mode: "manual", cast_snapshot: [{ characterId: "bo", name: "Bố" }], storyboard: { beats: [{ action: "Cõng con", dialogue: "" }], performanceDirection: { hook: "Bố cõng con.", lane: "cinematic_emotion" }, version: 2 }, performance_direction: direction, action: "Cõng con", dialogue: "" };
    expect(manifestHash(sceneHashInput(saved))).toBe(manifestHash(sceneHashInput(sent)));
    expect(manifestHash(sceneHashInput(saved))).not.toBe(manifestHash(sceneHashInput({ ...sent, action: "Bế con" })));
  });
});
