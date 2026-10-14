import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));

const { updateSession } = await import("./middleware");

function request(path: string, cookie?: string) {
  return new NextRequest(`https://aida.vn${path}`, { headers: cookie ? { cookie } : {} });
}

describe("updateSession", () => {
  beforeEach(() => {
    getUser.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  it("khách chưa đăng nhập vào trang công khai: không hỏi Supabase", async () => {
    const response = await updateSession(request("/pricing"));
    expect(response.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("khách chưa đăng nhập vào trang trong app: về đăng nhập, giữ đường quay lại", async () => {
    const response = await updateSession(request("/projects?output=x"));
    expect(response.headers.get("location")).toBe("https://aida.vn/login?next=%2Fprojects%3Foutput%3Dx");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("route API tự kiểm phiên nên không bị kiểm lần hai", async () => {
    await updateSession(request("/api/home", "sb-abc-auth-token=x"));
    expect(getUser).not.toHaveBeenCalled();
  });

  it("có cookie phiên thì vẫn kiểm và chuyển hướng khi phiên hỏng", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(request("/projects", "sb-abc-auth-token=x"));
    expect(getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("https://aida.vn/login?next=%2Fprojects");
  });
});
