import { it, expect } from "vitest";
import { signClipQuote, verifyClipQuote } from "./clip-quote-auth";
it("binds clip price, speaker/text, output and expiry while tolerating JSONB key order", () => {
  const value = { outputId: "one", customerPoints: 20, expiresAt: "date", config: { image: undefined, mode: "text" }, dubbing: { voiceProfileVersion: "v1", text: "Đi thôi" } };
  const signature = signClipQuote(value, "fixture-secret");
  const reordered = { dubbing: { text: "Đi thôi", voiceProfileVersion: "v1" }, config: { mode: "text" }, expiresAt: "date", customerPoints: 20, outputId: "one" };
  expect(verifyClipQuote(reordered, signature, "fixture-secret")).toBe(true);
  for (const change of [{customerPoints:0},{outputId:"two"},{expiresAt:"later"},{dubbing:{voiceProfileVersion:"v2",text:"Đi thôi"}}]) expect(verifyClipQuote({...value,...change},signature,"fixture-secret")).toBe(false);
  expect(verifyClipQuote(value,"bad","fixture-secret")).toBe(false);
});
