import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BattleRun } from "./contracts";
import { briefFixture, cuesFixture, input, shotsFixture } from "./test-fixtures";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ generateJson: vi.fn(), image: vi.fn(), submitMusic: vi.fn(), pollMusic: vi.fn(), timing: vi.fn(), sunoConfigured: vi.fn(), submitVideo: vi.fn(), pollVideo: vi.fn(), quote: vi.fn() }));
vi.mock("../family-script-director", () => ({ generateJson: mocks.generateJson }));
vi.mock("../gemini-image", () => ({ generateFilmReferenceView: mocks.image, IMAGE_MODEL: "gemini-3.1-flash-image" }));
vi.mock("../admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("../wavespeed", () => ({ getWaveSpeedPrediction: mocks.pollVideo, quoteReferenceVideo: mocks.quote, submitReferenceVideo: mocks.submitVideo }));
vi.mock("./suno", () => ({ submitMusic: mocks.submitMusic, pollMusic: mocks.pollMusic, timestampedLyrics: mocks.timing, sunoConfigured: mocks.sunoConfigured }));
import { advanceBattleRun } from "./server";

function runFixture(): BattleRun {
  return { id: "30000000-0000-4000-8000-000000000001", project_id: "20000000-0000-4000-8000-000000000001", workspace_version: 1, created_by: "10000000-0000-4000-8000-000000000001", input: structuredClone(input), state: {}, phase: "writing", status: "running", budget_points: 600, points_used: 0, refunded_points: 0, error: null, lease_owner: "40000000-0000-4000-8000-000000000001", lease_expires_at: new Date(Date.now() + 300000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

function adminFixture(run: BattleRun) {
  const steps = new Map<string, { id: string; step_key: string; status: string; points: number; result: unknown; provider_id?: string; created_at: string }>();
  const admin = {
    from(table: string) {
      let key = "";
      const chain = { select() { return chain; }, eq(column: string, value: string) { if (column === "step_key") key = value; return chain; },
        async single() { return { data: { id: run.project_id, user_id: run.created_by, workspace_version: run.workspace_version, project_members: [] }, error: null }; },
        async maybeSingle() { return { data: table === "battle_rap_steps" ? steps.get(key) || null : null, error: null }; } };
      return chain;
    },
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://media.example.invalid/${path}` }, error: null }), download: async () => ({ data: new Blob(["reference"], { type: "image/png" }), error: null }), upload: async () => ({ data: { path: "ok" }, error: null }) }) },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "heartbeat_battle_rap_run") return { data: true, error: null };
      if (name === "begin_battle_rap_step") {
        const key = String(args.p_key), prior = steps.get(key);
        if (prior && prior.status !== "failed") return { data: [prior], error: null };
        if (run.points_used + Number(args.p_points) > run.budget_points) return { data: null, error: { message: "BATTLE_BUDGET_EXCEEDED" } };
        const step = { id: crypto.randomUUID(), step_key: key, status: "submitting", points: Number(args.p_points), result: null, created_at: new Date().toISOString() };
        steps.set(key, step); run.points_used += step.points;
        return { data: [step], error: null };
      }
      if (name === "save_battle_rap_step") {
        const step = steps.get(String(args.p_key))!;
        if (args.p_status === "failed" && step.status !== "failed") { run.points_used -= step.points; step.points = 0; }
        step.status = String(args.p_status); step.result = args.p_result;
        if (args.p_provider) step.provider_id = String(args.p_provider);
      }
      if (name === "checkpoint_battle_rap_run") {
        run.phase = args.p_phase as BattleRun["phase"]; run.status = args.p_status as BattleRun["status"];
        run.error = args.p_error as string | null;
      }
      return { data: null, error: null };
    }),
  };
  return { admin: admin as unknown as SupabaseClient, steps };
}

describe("resumable battle rap production", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SUNO_GENERATION_COST_USD", "0.1");
    vi.stubEnv("VIDEO_WORKER_TOKEN", "unit-test-worker-token");
    vi.stubEnv("AIDA_PUBLIC_BASE_URL", "https://example.invalid");
    mocks.sunoConfigured.mockReturnValue(true);
    mocks.generateJson.mockImplementation(async (prompt: string) => {
      if (!prompt.includes("Frozen battle bible")) return briefFixture();
      const blocks = JSON.parse(prompt.split("Blocks (absolute seconds measured on the ACTUAL chosen audio): ")[1].split("\n")[0]) as { id: string; start: number; end: number }[];
      return { shots: shotsFixture().map((shot, index) => index < 5 ? { ...shot, start: blocks[0].start + (blocks[0].end - blocks[0].start) * index / 5, end: blocks[0].start + (blocks[0].end - blocks[0].start) * (index + 1) / 5 } : { ...shot, start: blocks[1].start, end: blocks[1].end }) };
    });
    mocks.image.mockResolvedValue({ image: "data:image/png;base64,aW1hZ2U=" });
    mocks.submitMusic.mockResolvedValue("music-task-1");
    mocks.pollMusic.mockResolvedValue({ taskId: "music-task-1", audioId: "track-1", sourceUrl: "https://provider.example.invalid/master.mp3", duration: 18 });
    mocks.timing.mockResolvedValue(cuesFixture());
    mocks.quote.mockResolvedValue(2);
    mocks.submitVideo.mockResolvedValue({ id: "video-task-1" });
    mocks.pollVideo.mockResolvedValue({ status: "completed", outputs: ["https://provider.example.invalid/clip.mp4"] });
  });
  it("takes one idea through writing, music, timing, refs and video without regenerating completed work", async () => {
    const run = runFixture(), { admin } = adminFixture(run);
    const tick = async () => { run.status = "running"; await advanceBattleRun(admin, run); expect(run.status).not.toBe("failed"); };
    await tick(); expect(run.phase).toBe("music");
    await tick(); expect(mocks.submitMusic).toHaveBeenCalledTimes(1);
    await tick(); expect(run.phase).toBe("ingest");
    // Worker media đo file thật ở ingest; ở kiểm thử orchestration chỉ thay kết quả đo.
    run.state.music!.path = `${run.project_id}/master.m4a`; run.phase = "timing";
    await tick(); expect(run.phase).toBe("storyboard");
    await tick(); expect(run.phase).toBe("references");
    for (let i = 0; i < 8; i++) await tick();
    expect(run.phase).toBe("excerpts");
    expect(mocks.image).toHaveBeenCalledTimes(7);
    expect(run.state.images?.["cast-A"]).toBeTruthy();
    run.state.excerpts = Object.fromEntries(run.state.blocks!.map(b => [b.id, `${run.project_id}/${b.id}.m4a`]));
    run.phase = "video";
    await tick(); await tick(); await tick(); await tick(); await tick();
    expect(run.phase).toBe("render");
    expect(mocks.submitVideo).toHaveBeenCalledTimes(2);
    expect(mocks.submitMusic).toHaveBeenCalledTimes(1);
    expect(mocks.submitVideo.mock.calls[0][1].reference_images).toHaveLength(6);
    expect(mocks.submitVideo.mock.calls[0][1].reference_audios).toBeUndefined();
    const before = mocks.image.mock.calls.length;
    run.phase = "references"; run.state.images = {};
    await tick();
    expect(mocks.image).toHaveBeenCalledTimes(before);
  });
  it("waits for an uploaded Suno track when automatic music is not configured", async () => {
    const run = runFixture(), { admin } = adminFixture(run);
    mocks.sunoConfigured.mockReturnValue(false);
    await advanceBattleRun(admin, run);
    run.status = "running"; await advanceBattleRun(admin, run);
    expect(run.status).toBe("awaiting_music");
    expect(run.state.brief?.suno.lyrics).toContain("Đỏ ra sân rồi");
    expect(mocks.submitMusic).not.toHaveBeenCalled();
  });
  it("never resubmits an uncertain provider request", async () => {
    const run = runFixture(); run.phase = "music"; run.state.brief = briefFixture();
    const { admin, steps } = adminFixture(run);
    mocks.submitMusic.mockRejectedValue(new Error("Network timeout after submission"));
    await advanceBattleRun(admin, run);
    expect(run.status).toBe("needs_review");
    expect(steps.get("music")?.status).toBe("uncertain");
    run.status = "running"; await advanceBattleRun(admin, run);
    expect(mocks.submitMusic).toHaveBeenCalledTimes(1);
  });
  it("stops before a paid call when the budget would be exceeded", async () => {
    const run = runFixture(); run.phase = "music"; run.state.brief = briefFixture(); run.budget_points = 1;
    const { admin } = adminFixture(run);
    await advanceBattleRun(admin, run);
    expect(run.status).toBe("needs_review");
    expect(mocks.submitMusic).not.toHaveBeenCalled();
    expect(run.points_used).toBe(0);
  });
  it("does not resubmit when a provider is merely pending", async () => {
    const run = runFixture(); run.phase = "music"; run.state.brief = briefFixture();
    const { admin } = adminFixture(run);
    mocks.pollMusic.mockResolvedValue(null);
    for (let i = 0; i < 4; i++) { run.status = "running"; await advanceBattleRun(admin, run); }
    expect(mocks.submitMusic).toHaveBeenCalledTimes(1);
    expect(mocks.pollMusic).toHaveBeenCalledTimes(3);
  });
  it("asks for real timing instead of inventing subtitles for uploaded music", async () => {
    const run = runFixture(); run.phase = "timing"; run.state.brief = briefFixture(); run.state.music = { path: `${run.project_id}/master.mp3`, duration: 18 };
    const { admin } = adminFixture(run);
    await advanceBattleRun(admin, run);
    expect(run.status).toBe("awaiting_lyrics");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });
});
