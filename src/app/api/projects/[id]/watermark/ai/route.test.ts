import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/request-auth", () => ({ getRequestUser: mocks.auth }));
vi.mock("@/lib/admin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server-secrets", () => ({ hasOpenAiApiKey: () => true }));
import { POST } from "./route";
import { POST as run } from "./[jobId]/route";
const project = { id: "p", user_id: "owner", workspace_version: 2 };
const params = { params: Promise.resolve({ id: "p" }) };
const runParams = { params: Promise.resolve({ id: "p", jobId: "q" }) };
function request(version = 2) { const body = new FormData(); body.append("mode", "generate"); body.append("prompt", "Logo Bánh Bao"); body.append("workspaceVersion", String(version)); return new NextRequest("http://localhost/api", { method: "POST", body }); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.project.mockResolvedValue({ data: project }); mocks.rpc.mockResolvedValue({ data: "quote-id" });
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.project };
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: { from: () => query } });
});
describe("watermark quote and acceptance", () => {
  it("quotes without accepting, charging or calling provider", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(request(), params);
    expect(await response.json()).toMatchObject({ id: "quote-id", maxPoints: 11 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("quote_watermark_ai", expect.objectContaining({ p_model: "gpt-image-1.5", p_points: 11, p_user: "owner", p_project: "p", p_input: null }));
    expect(fetchMock).not.toHaveBeenCalled(); fetchMock.mockRestore();
  });
  it("rejects stale workspace, outsiders, members and signed-out sessions before billing", async () => {
    expect((await POST(request(1), params)).status).toBe(409);
    mocks.project.mockResolvedValueOnce({ data: null }); expect((await POST(request(), params)).status).toBe(404);
    mocks.project.mockResolvedValueOnce({ data: { ...project, user_id: "another" } }); expect((await POST(request(), params)).status).toBe(403);
    mocks.auth.mockResolvedValue({ user: null }); expect((await POST(request(), params)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("accepts the immutable quote id, ignores client-supplied price and returns 202", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "q", status: "queued" } });
    const response = await run(new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify({ workspaceVersion: 2, points: 0, prompt: "tampered" }) }), runParams);
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("accept_watermark_ai", { p_id: "q", p_project: "p", p_user: "owner", p_workspace: 2 });
  });
  it("reports insufficient balance without claiming success", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "INSUFFICIENT_POINTS" } });
    expect((await run(new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify({ workspaceVersion: 2 }) }), runParams)).status).toBe(402);
  });
});
