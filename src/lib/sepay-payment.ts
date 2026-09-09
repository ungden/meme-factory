import { timingSafeEqual } from "node:crypto";

export function validSepayKey(header: string | null, expected: string) {
  if (!header?.startsWith("Apikey ") || !expected) return false;
  const actual = Buffer.from(header.slice(7));
  const key = Buffer.from(expected);
  return actual.length === key.length && timingSafeEqual(actual, key);
}

export function parseSepayPayment(payload: unknown, configuredAccounts: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (p.transferType !== "in") return null;
  const amount = typeof p.transferAmount === "string" && /^\d+$/.test(p.transferAmount)
    ? Number(p.transferAmount) : p.transferAmount;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) return null;
  const eventId = typeof p.id === "number" && Number.isSafeInteger(p.id) ? String(p.id)
    : typeof p.id === "string" ? p.id : "";
  if (!/^[0-9]{1,30}$/.test(eventId)) return null;
  const codes = new Set([p.code, p.content].flatMap((value) =>
    typeof value === "string" ? [...value.matchAll(/\bTL([a-f0-9]{8})\b/gi)].map((m) => m[1].toLowerCase()) : []));
  if (codes.size !== 1) return null;
  const accounts = [p.accountNumber, p.subAccount]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim()).filter((v) => v && configuredAccounts.includes(v));
  if (!accounts.length) return null;
  return { eventId, orderPrefix: [...codes][0], amount, accounts };
}
