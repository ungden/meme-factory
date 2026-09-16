import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { verifyWaveSpeedWebhook } from "./wavespeed";

const SECRET = "supersecret";
const BODY = JSON.stringify({ data: { id: "prediction-1", status: "completed" } });

function sign(
  id: string,
  timestamp: string | number,
  body = BODY,
  secret = SECRET,
) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("hex");
}

function headers(overrides: Record<string, string | null> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const base: Record<string, string | null> = {
    "webhook-id": "hook-1",
    "webhook-timestamp": String(now),
    "webhook-signature": `v3,${sign("hook-1", now)}`,
    ...overrides,
  };
  const value = new Headers();
  for (const [key, entry] of Object.entries(base))
    if (entry !== null) value.set(key, entry);
  return value;
}

beforeEach(() => {
  process.env.WAVESPEED_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.WAVESPEED_WEBHOOK_SECRET;
});

describe("verifyWaveSpeedWebhook", () => {
  it("accepts a correctly signed, fresh delivery", () => {
    expect(verifyWaveSpeedWebhook(headers(), BODY)).toBe(true);
  });

  it("accepts a secret configured with the whsec_ prefix", () => {
    process.env.WAVESPEED_WEBHOOK_SECRET = `whsec_${SECRET}`;
    expect(verifyWaveSpeedWebhook(headers(), BODY)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      verifyWaveSpeedWebhook(
        headers({
          "webhook-timestamp": String(now),
          "webhook-signature": `v3,${sign("hook-1", now, BODY, "wrong")}`,
        }),
        BODY,
      ),
    ).toBe(false);
  });

  it("rejects a body that changed after signing", () => {
    expect(verifyWaveSpeedWebhook(headers(), `${BODY} tampered`)).toBe(false);
  });

  it.each(["webhook-id", "webhook-timestamp", "webhook-signature"])(
    "rejects a delivery missing %s",
    (header) => {
      expect(verifyWaveSpeedWebhook(headers({ [header]: null }), BODY)).toBe(
        false,
      );
    },
  );

  // The replay window is 300s in each direction.
  it.each([
    ["301 seconds old", -301, false],
    ["299 seconds old", -299, true],
    ["301 seconds ahead", 301, false],
    ["299 seconds ahead", 299, true],
  ])("treats a timestamp %s as valid=%s", (_label, offset, expected) => {
    const stamp = Math.floor(Date.now() / 1000) + (offset as number);
    expect(
      verifyWaveSpeedWebhook(
        headers({
          "webhook-timestamp": String(stamp),
          "webhook-signature": `v3,${sign("hook-1", stamp)}`,
        }),
        BODY,
      ),
    ).toBe(expected);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyWaveSpeedWebhook(
        headers({ "webhook-timestamp": "not-a-number" }),
        BODY,
      ),
    ).toBe(false);
  });

  // A length mismatch must be caught before timingSafeEqual, which throws on
  // differently sized buffers.
  it("rejects a truncated signature without throwing", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() =>
      verifyWaveSpeedWebhook(
        headers({
          "webhook-timestamp": String(now),
          "webhook-signature": `v3,${sign("hook-1", now).slice(0, 20)}`,
        }),
        BODY,
      ),
    ).not.toThrow();
  });

  // Buffer.from(x, "hex") silently truncates non-hex input, so a base64
  // signature degrades to a short buffer and is refused by the length check.
  // Locking current behaviour: the provider's encoding cannot be confirmed from
  // here, and guessing wrong either breaks ingestion or weakens authentication.
  it("rejects a non-hex signature", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      verifyWaveSpeedWebhook(
        headers({
          "webhook-timestamp": String(now),
          "webhook-signature": `v3,${Buffer.from(sign("hook-1", now), "hex").toString("base64")}`,
        }),
        BODY,
      ),
    ).toBe(false);
  });

  it("refuses to verify when no secret is configured", () => {
    delete process.env.WAVESPEED_WEBHOOK_SECRET;
    expect(() => verifyWaveSpeedWebhook(headers(), BODY)).toThrow(
      /WEBHOOK_SECRET/,
    );
  });
});
