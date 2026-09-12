import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), upload: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/supabase/request-auth", () => ({ getRequestUser: mocks.auth }));
import { POST } from "./route";
const project = { id: "project-1", user_id: "owner", workspace_version: 2 };
const request = (file: Uint8Array, version = 2) => {
  const form = new FormData();
  form.append("file", new File([file as BlobPart], "logo.png", { type: "image/png" }));
  form.append("workspaceVersion", String(version));
  return new NextRequest("http://localhost/api/projects/project-1/watermark", { method: "POST", body: form });
};
const params = { params: Promise.resolve({ id: "project-1" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue({ data: project });
  mocks.upload.mockResolvedValue({ error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.project };
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: {
    from: () => query,
    storage: { from: () => ({ upload: mocks.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }) }) },
  } });
});
describe("watermark upload access and validation", () => {
  it("rejects signed-out requests", async () => {
    mocks.auth.mockResolvedValue({ user: null });
    expect((await POST(request(new Uint8Array()), params)).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects other projects and read-only members", async () => {
    mocks.project.mockResolvedValueOnce({ data: null });
    expect((await POST(request(new Uint8Array()), params)).status).toBe(404);
    mocks.project.mockResolvedValueOnce({ data: { ...project, user_id: "other" } });
    expect((await POST(request(new Uint8Array()), params)).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects stale workspace and opaque logo before storage", async () => {
    expect((await POST(request(new Uint8Array(), 1), params)).status).toBe(409);
    const opaque = await sharp({ create: { width: 32, height: 32, channels: 4, background: "white" } }).png().toBuffer();
    expect((await POST(request(opaque), params)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("uploads validated logo under owner/project/workspace without overwriting", async () => {
    const logo = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 16, height: 16, channels: 4, background: "red" } }).png().toBuffer() }]).png().toBuffer();
    const response = await POST(request(logo), params);
    expect(response.status).toBe(200);
    expect(mocks.upload.mock.calls[0][0]).toMatch(/^owner\/project-1\/2\/.+\.png$/);
    expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
  });
});
