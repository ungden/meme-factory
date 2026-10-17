import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BattleRun } from "./contracts";
import { briefFixture, input, shotsFixture } from "./test-fixtures";
import { initReview } from "./review";

const mocks = vi.hoisted(() => ({ model: vi.fn(), key: vi.fn(), access: vi.fn(), limit: vi.fn(), download: vi.fn(), row: vi.fn(), eq: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: mocks.model }; } }));
vi.mock("@/lib/server-secrets", () => ({ getGeminiApiKey: mocks.key }));
vi.mock("@/lib/short-film/server", () => ({ access: mocks.access, fail: (error: { status?: number }) => Response.json({ error: "Lỗi" }, { status: error.status || 500 }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit, RATE_LIMITS: { promptAssistMinute: { limit: 8, windowSeconds: 60 }, promptAssistDay: { limit: 60, windowSeconds: 86400 } }, rateLimitMessage: () => "Chờ rồi thử lại" }));
import { assistPrompt, buildAssistContext, normalizeAssistRequest, suggestBattleChanges, validateSuggestions } from "./assist";
import { POST } from "../../app/api/projects/[id]/battle-rap/suggest/route";

const runId = "11111111-1111-4111-8111-111111111111";
const answer = { summary: "Gợi ý dựa trên bản đang chọn.", suggestions: [
  { title: "Phản đòn vào điểm yếu", change: "Viết lại câu kết lượt hai để lật nghĩa lời thách đấu ở lượt đầu.", reason: "Giữ trận đấu có đối đáp." },
  { title: "Khoảng dừng sau đòn", change: "Thêm một khoảng dừng ngắn sau punchline để thấy đối thủ phản ứng.", reason: "Khán giả có thời gian bắt ý." },
  { title: "Nhấn hình tượng", change: "Đưa chi tiết đặc trưng của nhân vật vào lời thay cho câu khoe sức mạnh chung chung.", reason: "Tăng dấu ấn của cặp nhân vật." },
] };
const query = { select: () => query, eq: mocks.eq, maybeSingle: mocks.row };
const admin = { from: mocks.from, storage: { from: () => ({ download: mocks.download }) } } as unknown as SupabaseClient;
function runFixture(): BattleRun {
  return { id: runId, project_id: "project", created_by: "user", workspace_version: 4, input,
    state: { review: { ...initReview(), revision: 3, stage: "cast", approved: ["lyrics", "music", "storyboard"] }, brief: briefFixture(), storyboard: { shots: shotsFixture() }, images: { "cast-A": "project/battle-rap/run/cast-A.png", "cast-B": "project/battle-rap/run/cast-B.png" }, blocks: [{ id: "block-1", start: 0, end: 15, generateSeconds: 15 }] },
    status: "awaiting_review", phase: "references", budget_points: 600, points_used: 10, refunded_points: 0, error: null, lease_owner: null, lease_expires_at: null, created_at: "", updated_at: "" };
}
function request(body: unknown) { return new NextRequest("http://localhost/api/projects/project/battle-rap/suggest", { method: "POST", body: JSON.stringify(body) }); }
const params = { params: Promise.resolve({ id: "project" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.model.mockResolvedValue({ text: JSON.stringify(answer) });
  mocks.key.mockResolvedValue("test-key");
  mocks.download.mockResolvedValue({ data: new Blob(["pixels"], { type: "image/png" }), error: null });
  mocks.eq.mockImplementation(() => query);
  mocks.from.mockImplementation(() => query);
  mocks.row.mockResolvedValue({ data: runFixture(), error: null });
  mocks.access.mockResolvedValue({ admin, user: { id: "user" }, project: { id: "project", workspace_version: 4 } });
  mocks.limit.mockResolvedValue({ allowed: true, resetIn: 60 });
});

describe("battle rap suggestion contracts", () => {
  it("bounds caller input and requires a revision for a stored run", () => {
    expect(normalizeAssistRequest({ idea: "  Lạc Long Quân vs Âu Cơ  " })).toEqual({ idea: "Lạc Long Quân vs Âu Cơ", question: "" });
    expect(() => normalizeAssistRequest({ idea: "x".repeat(4001) })).toThrow();
    expect(() => normalizeAssistRequest({ runId })).toThrow(/Tải lại/);
    expect(() => normalizeAssistRequest({ runId: "../other", revision: 3 })).toThrow(/Mã bài/);
    expect(() => normalizeAssistRequest({ assetKey: "image:cast-A" })).toThrow(/Chưa chọn/);
    expect(() => normalizeAssistRequest({ question: "x".repeat(1601) })).toThrow();
  });

  it("requires a matching project, run and revision before reading any image", () => {
    const run = runFixture(), input = normalizeAssistRequest({ runId, revision: 3, assetKey: "image:cast-A" });
    expect(() => buildAssistContext("other", run, input)).toThrow(/Không tìm thấy/);
    expect(() => buildAssistContext("project", run, { ...input, revision: 2 })).toThrow(/vừa được cập nhật/);
    expect(() => buildAssistContext("project", run, { ...input, runId: "another" })).toThrow(/Không tìm thấy/);
    expect(() => buildAssistContext("project", null, input)).toThrow(/Không tìm thấy/);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("only advises current stage assets and rejects paths outside the authorized project", () => {
    const run = runFixture(), input = normalizeAssistRequest({ runId, revision: 3, assetKey: "image:stage" });
    expect(() => buildAssistContext("project", run, input)).toThrow(/không thuộc bước/);
    input.assetKey = "image:cast-A";
    run.state.images!["cast-A"] = "other/battle-rap/run/cast.png";
    expect(() => buildAssistContext("project", run, input)).toThrow(/Ảnh không thuộc/);
    run.status = "running";
    expect(() => buildAssistContext("project", run, input)).toThrow(/Chờ tới bước/);
  });

  it("bases image feedback on only the authorized selected image, ignoring supplied URLs", async () => {
    const input = normalizeAssistRequest({ runId, revision: 3, assetKey: "image:cast-A", imageUrl: "http://private.internal/", question: "Trang phục có thể chỉnh gì?" });
    const result = await suggestBattleChanges(admin, "project", runFixture(), input);
    expect(result.basis).toBe("image");
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith("project/battle-rap/run/cast-A.png");
    const call = mocks.model.mock.calls[0][0];
    expect(call.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: Buffer.from("pixels").toString("base64") } });
    expect(call.contents[0].parts[0].text).toContain("Trang phục có thể chỉnh gì?");
    expect(call.contents[0].parts[0].text).toContain("NGUỒN THAM KHẢO");
    expect(call.contents[0].parts[0].text).not.toContain("private.internal");
    expect(call.config.systemInstruction).toContain("không đáng tin cậy");
  });

  it("rejects oversized or non-image files before calling the model", async () => {
    const input = normalizeAssistRequest({ runId, revision: 3, assetKey: "image:cast-A" });
    mocks.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(8 * 1024 ** 2 + 1)], { type: "image/png" }) });
    await expect(suggestBattleChanges(admin, "project", runFixture(), input)).rejects.toThrow(/8 MB/);
    mocks.download.mockResolvedValueOnce({ data: new Blob(["audio"], { type: "audio/mp4" }) });
    await expect(suggestBattleChanges(admin, "project", runFixture(), input)).rejects.toThrow(/PNG/);
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it.each(["music", "clips"] as const)("labels %s feedback as context-only and never sends audiovisual files", async stage => {
    const run = runFixture(); run.state.review!.stage = stage; run.state.review!.approved = ["lyrics"];
    const input = normalizeAssistRequest({ runId, revision: 3, ...(stage === "clips" ? { assetKey: "video:block-1" } : {}) });
    const result = await suggestBattleChanges(admin, "project", run, input);
    expect(result.basis).toBe("content");
    expect(mocks.download).not.toHaveBeenCalled();
    const parts = mocks.model.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain("KHÔNG có hình ảnh, audio hay video");
    expect(parts[0].text).toContain("Không bịa lỗi của tài sản chưa được quan sát");
  });

  it("proposes initial ideas and completed-MV packaging without starting generation", async () => {
    const idea = await suggestBattleChanges(admin, "project", null, normalizeAssistRequest({ idea: "Rồng và tiên" }));
    expect(idea.suggestions).toHaveLength(3);
    expect(mocks.model.mock.calls[0][0].contents[0].parts[0].text).toContain("ba ý tưởng đối đầu");
    const run = runFixture(); run.status = "completed";
    const context = buildAssistContext("project", run, normalizeAssistRequest({ runId, revision: 3 }));
    expect(context.stage).toBe("final");
    expect(assistPrompt(context, "content")).toContain("tiêu đề/mô tả/câu dẫn");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("enforces exactly three distinct bounded options and a server-chosen basis", () => {
    expect(validateSuggestions({ ...answer, basis: "fake" }, "content").basis).toBe("content");
    expect(() => validateSuggestions({ ...answer, suggestions: answer.suggestions.slice(1) }, "content")).toThrow(/ba gợi ý/);
    expect(() => validateSuggestions({ ...answer, suggestions: [answer.suggestions[0], answer.suggestions[0], answer.suggestions[0]] }, "content")).toThrow(/khác nhau/);
    expect(() => validateSuggestions({ ...answer, summary: "x".repeat(601) }, "content")).toThrow(/quá dài/);
  });
});

describe("battle rap suggestion API authorization", () => {
  it("filters by authorized project and current workspace before generating a suggestion", async () => {
    const response = await POST(request({ runId, revision: 3 }), params);
    expect(response.status).toBe(200);
    expect(mocks.eq.mock.calls).toEqual([["id", runId], ["project_id", "project"], ["workspace_version", 4]]);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("battle_rap_runs");
    expect((await response.json()).basis).toBe("content");
  });

  it("does not call the model for signed-out users, missing runs or stale revisions", async () => {
    mocks.access.mockRejectedValueOnce({ status: 401 });
    expect((await POST(request({ idea: "x" }), params)).status).toBe(401);
    mocks.row.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request({ runId, revision: 3 }), params)).status).toBe(404);
    expect((await POST(request({ runId, revision: 2 }), params)).status).toBe(409);
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("enforces both rate limits before any model or image call", async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: true, resetIn: 0 }).mockResolvedValueOnce({ allowed: false, resetIn: 7200 });
    const response = await POST(request({ runId, revision: 3, assetKey: "image:cast-A" }), params);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7200");
    expect(mocks.limit).toHaveBeenCalledTimes(2);
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
