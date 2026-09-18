import { describe, expect, it } from "vitest";
import { authorizeInternal, tokenMatches } from "./internal-auth";

describe("tokenMatches", () => {
  it("chỉ chấp nhận token trùng khớp", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abd")).toBe(false);
    expect(tokenMatches("ab", "abc")).toBe(false);
    expect(tokenMatches("abcd", "abc")).toBe(false);
  });

  it("từ chối khi thiếu một trong hai vế", () => {
    expect(tokenMatches(null, "abc")).toBe(false);
    expect(tokenMatches("abc", undefined)).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
  });
});

describe("authorizeInternal", () => {
  it("đọc Bearer token và đối chiếu với biến môi trường", () => {
    const previous = process.env.VIDEO_WORKER_TOKEN;
    process.env.VIDEO_WORKER_TOKEN = "secret-token";
    try {
      const request = (value: string | null) =>
        new Request("https://aida.vn/api/internal/x", {
          headers: value === null ? {} : { authorization: value },
        });
      expect(authorizeInternal(request("Bearer secret-token"))).toBe(true);
      expect(authorizeInternal(request("Bearer wrong-token1"))).toBe(false);
      expect(authorizeInternal(request("secret-token"))).toBe(false);
      expect(authorizeInternal(request(null))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.VIDEO_WORKER_TOKEN;
      else process.env.VIDEO_WORKER_TOKEN = previous;
    }
  });

  it("từ chối tất cả khi chưa đặt token", () => {
    const previous = process.env.VIDEO_WORKER_TOKEN;
    delete process.env.VIDEO_WORKER_TOKEN;
    try {
      expect(
        authorizeInternal(new Request("https://aida.vn/api/internal/x", { headers: { authorization: "Bearer anything" } })),
      ).toBe(false);
    } finally {
      if (previous !== undefined) process.env.VIDEO_WORKER_TOKEN = previous;
    }
  });
});
