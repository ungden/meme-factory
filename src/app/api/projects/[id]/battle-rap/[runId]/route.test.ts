import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleRun } from "@/lib/battle-rap/contracts";
import { briefFixture, input } from "@/lib/battle-rap/test-fixtures";
import { initReview, recordVariant } from "@/lib/battle-rap/review";

const mock = vi.hoisted(() => ({ run: null as BattleRun | null, receipt: false, rpc: vi.fn(), signed: vi.fn(), fund: vi.fn(), configured: vi.fn(), steps: [] as { step_key: string; points: number }[] }));
vi.mock("@/lib/short-film/server", () => ({
  FilmError: class extends Error { constructor(message: string, public status = 400) { super(message); } },
  fail: (error: { message: string; status?: number }) => Response.json({ error: error.message }, { status: error.status || 500 }),
  access: async () => ({ user: { id: "owner" }, project: { id: "project", user_id: "owner", workspace_version: 1 }, admin: {
    rpc: mock.rpc,
    from: (table: string) => {
      const data = () => table === "battle_rap_runs" ? mock.run : table === "battle_rap_review_actions" ? (mock.receipt ? { request_id: "existing" } : null) : table === "project_wallets" ? { points: 1000 } : mock.steps;
      const result = () => ({ data: data(), error: null });
      const query = { select: () => query, eq: () => query, order: async () => result(), maybeSingle: async () => result(), single: async () => result() };
      return query;
    },
  } }),
}));
vi.mock("@/lib/battle-rap/server", () => ({
  checked: async (promise: PromiseLike<{ data: unknown; error: { message: string } | null }>) => { const result = await promise; if (result.error) throw new Error(result.error.message); return result.data; },
  reconcileLocalResults: vi.fn(), signMedia: mock.signed,
}));
vi.mock("@/lib/project-points", () => ({ ensureProjectPoints: mock.fund }));
vi.mock("@/lib/gemini-image", () => ({ IMAGE_MODEL: "gemini-3.1-flash-image" }));
vi.mock("@/lib/battle-rap/suno", () => ({ sunoConfigured: mock.configured }));
import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "project", runId: "run" }) };
const key = "12345678-1234-4234-8234-123456789012";
function post(body: Record<string, unknown>) {
  return POST(new Request("https://example.invalid/api", { method: "POST", body: JSON.stringify(body) }) as never, params);
}
function runFixture(): BattleRun {
  return { id: "run", project_id: "project", created_by: "owner", workspace_version: 1, input, state: { review: initReview(), brief: briefFixture() }, phase: "music", status: "awaiting_review", budget_points: 600, points_used: 10, refunded_points: 0, error: null, lease_owner: null, lease_expires_at: null, created_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z" };
}
describe("battle review API", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mock.run = runFixture(); mock.receipt = false; mock.steps = [];
    mock.rpc.mockResolvedValue({ data: null, error: null }); mock.fund.mockResolvedValue({ ok: true }); mock.configured.mockReturnValue(true);
    mock.signed.mockImplementation(async (_admin: unknown, _project: string, path: string) => { if (!path.startsWith("project/")) throw new Error("External media"); return `https://storage.example.invalid/${path}?signed`; });
  });
  it("approves through the atomic review RPC with its revision and request key", async () => {
    const result = await post({ action: "approveStage", revision: 0, idempotencyKey: key, musicMode: "upload" });
    expect(result.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("edit_battle_rap_review", expect.objectContaining({ p_revision: 0, p_request: key, p_workspace: 1, p_phase: "music", p_status: "awaiting_music", p_state: expect.objectContaining({ review: expect.objectContaining({ revision: 1, approved: ["lyrics"] }) }) }));
  });
  it("replays an acknowledged request even after the worker has advanced", async () => {
    mock.receipt = true; mock.run!.status = "running"; mock.run!.state.review!.revision = 3;
    expect((await post({ action: "approveStage", revision: 0, idempotencyKey: key, musicMode: "upload" })).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledOnce();
  });
  it("rejects stale selections and malformed request keys before writing", async () => {
    expect((await post({ action: "approveStage", revision: 9, idempotencyKey: key })).status).toBe(409);
    expect((await post({ action: "approveStage", revision: 0, idempotencyKey: "bad" })).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("does not fund or resume a review gate", async () => {
    expect((await post({ action: "resume", idempotencyKey: key })).status).toBe(409);
    expect(mock.fund).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("uploads music through the same revision check and rejects another run's file", async () => {
    mock.run!.status = "awaiting_music";
    expect((await post({ action: "attachMusic", revision: 0, idempotencyKey: key, path: `project/battle-rap/other/input/${key}.audio` })).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect((await post({ action: "attachMusic", revision: 0, idempotencyKey: key, path: `project/battle-rap/run/input/${key}.audio`, srt: "timed lyrics" })).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("edit_battle_rap_review", expect.objectContaining({ p_phase: "ingest", p_status: "queued", p_state: expect.objectContaining({ rawTiming: "timed lyrics", review: expect.objectContaining({ revision: 1 }) }) }));
  });
  it("returns conflicts from the database after a concurrent change", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "BATTLE_REVIEW_STALE" } });
    const result = await post({ action: "approveStage", revision: 0, idempotencyKey: key, musicMode: "upload" });
    expect(result.status).toBe(409); expect((await result.json()).error).toContain("cập nhật");
  });
  it("previews only stored media and returns per-asset cost estimates", async () => {
    const state = mock.run!.state;
    state.music = { sourceUrl: "https://provider.example.invalid/master", path: "project/music.m4a", duration: 30 };
    state.clips = { "block-1": "https://provider.example.invalid/clip" };
    state.clipFiles = { "block-1": "project/clip.mp4" };
    state.excerpts = { "block-1": "project/excerpt.m4a" };
    state.references = [{ id: "cast-A", dependsOn: [], prompt: "Portrait" }];
    recordVariant(state, "image:cast-A", "project/cast.png");
    mock.steps = [{ step_key: "video:block-1:v2", points: 35 }];
    const result = await GET(new Request("https://example.invalid/api") as never, params);
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.media.clips["block-1"]).toContain("storage.example.invalid");
    expect(body.media.excerpts["block-1"]).toContain("storage.example.invalid");
    expect(body.media.variants["image:cast-A"][0].url).toContain("storage.example.invalid");
    expect(body.reviewPricing["image:cast-A"]).toBeGreaterThan(0);
    expect(body.reviewPricing["video:block-1"]).toBe(35);
    expect(JSON.stringify(body)).not.toContain("provider.example.invalid");
  });
});
