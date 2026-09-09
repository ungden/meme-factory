import { describe, it, expect } from "vitest";
import { parseSepayPayment, validSepayKey } from "./sepay-payment";
const valid = { id: 912345, transferType: "in", transferAmount: 10000, accountNumber: "123456", content: "nap TL1234ABCD" };
describe("SePay payment boundary", () => {
  it("accepts a complete incoming payment with the configured bank", () => {
    expect(parseSepayPayment(valid, ["123456"])).toEqual({ eventId: "912345", orderPrefix: "1234abcd", amount: 10000, accounts: ["123456"] });
  });
  it.each([
    { transferType: "out" }, { transferType: undefined }, { transferAmount: 0 },
    { transferAmount: -1 }, { transferAmount: "10000oops" }, { transferAmount: 10000.2 },
    { transferAmount: Infinity }, { id: undefined }, { id: "not-an-id" },
    { accountNumber: "other-bank" }, { content: "no code" },
    { content: "TL1234ABCD TL9876ABCD" }, { content: "XTL1234ABCD" },
    { content: "TL1234ABCDE" }, { content: "no code", description: "TL1234ABCD" },
  ])("does not credit malformed or ambiguous payment %j", (change) => {
    expect(parseSepayPayment({ ...valid, ...change }, ["123456"])).toBeNull();
  });
  it("allows the same order code repeated and virtual accounts", () => {
    expect(parseSepayPayment({ ...valid, code: "TL1234ABCD", subAccount: "VA123" }, ["VA123"])?.accounts).toEqual(["VA123"]);
  });
  it("requires the exact webhook key without logging it", () => {
    expect(validSepayKey("Apikey test-only", "test-only")).toBe(true);
    expect(validSepayKey("Apikey test-onlx", "test-only")).toBe(false);
    expect(validSepayKey("Bearer test-only", "test-only")).toBe(false);
    expect(validSepayKey(null, "test-only")).toBe(false);
  });
});
