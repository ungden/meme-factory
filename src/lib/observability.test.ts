import { describe, expect, it } from "vitest";
import { parseSentryDsn, sentryEnvelope } from "../../scripts/observability.mjs";

describe("parseSentryDsn", () => {
  it("tách key và dựng endpoint envelope", () => {
    expect(parseSentryDsn("https://abc123@o1.ingest.sentry.io/456")).toEqual({
      url: "https://o1.ingest.sentry.io/api/456/envelope/",
      key: "abc123",
    });
  });

  it("trả null khi DSN thiếu hoặc sai", () => {
    expect(parseSentryDsn(undefined)).toBeNull();
    expect(parseSentryDsn("")).toBeNull();
    expect(parseSentryDsn("không-phải-url")).toBeNull();
    // Thiếu public key.
    expect(parseSentryDsn("https://o1.ingest.sentry.io/456")).toBeNull();
    // Thiếu project id.
    expect(parseSentryDsn("https://abc123@o1.ingest.sentry.io")).toBeNull();
  });
});

describe("sentryEnvelope", () => {
  it("ghép 3 dòng JSON đúng thứ tự header/kiểu/sự kiện", () => {
    const body = sentryEnvelope(
      { type: "Error", value: "hỏng rồi", stack: "Error: hỏng rồi\n at x" },
      { scope: "worker", tags: { runId: "r1" }, environment: "production" },
    );
    const [header, itemType, event] = body.trim().split("\n").map((line: string) => JSON.parse(line));
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(itemType).toEqual({ type: "event" });
    expect(event.event_id).toBe(header.event_id);
    expect(event.exception.values[0]).toEqual({ type: "Error", value: "hỏng rồi" });
    expect(event.tags).toEqual({ runId: "r1" });
    expect(event.logger).toBe("worker");
    expect(event.environment).toBe("production");
    expect(event.extra.stack).toContain("Error: hỏng rồi");
  });
});
