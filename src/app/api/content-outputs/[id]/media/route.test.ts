import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { maybeSingle, sign, getUser } = vi.hoisted(() => ({ maybeSingle: vi.fn(), sign: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/request-auth", () => ({ getRequestUser: getUser }));
vi.mock("@/lib/admin", () => ({ getSupabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: sign }) } }) }));
import { GET } from "./route";
const read = (query = "") => GET(new NextRequest(`https://aida.vn/api/content-outputs/output/media${query}`), { params: Promise.resolve({ id: "output" }) });

describe("private media endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ user: { id: "user" }, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } });
    sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.invalid/private.mp4" }, error: null });
  });
  it("rejects a readable output row pointing at another project's media", async () => {
    maybeSingle.mockResolvedValue({ data: { media_url: "other-project/film.mp4", content_sets: { project_id: "own-project" } } });
    expect((await read()).status).toBe(403);
    expect(sign).not.toHaveBeenCalled();
  });
  it("checks poster ownership too", async () => {
    maybeSingle.mockResolvedValue({ data: { media_url: "own-project/film.mp4", poster_url: "other-project/poster.jpg", content_sets: { project_id: "own-project" } } });
    expect((await read("?artifact=poster")).status).toBe(403);
    expect(sign).not.toHaveBeenCalled();
  });
  it("signs the selected project poster with a private redirect", async () => {
    maybeSingle.mockResolvedValue({ data: { poster_url: "own-project/poster.jpg", content_sets: { project_id: "own-project" } } });
    const response = await read("?artifact=poster");
    expect(response.status).toBe(307);
    expect(sign).toHaveBeenCalledWith("own-project/poster.jpg", 60, undefined);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("requires a session before looking up or signing any media", async () => {
    getUser.mockResolvedValue({ user: null });
    expect((await read()).status).toBe(401);
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
});
