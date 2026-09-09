import { createHmac, timingSafeEqual } from "node:crypto";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function signClipQuote(value: unknown, secret = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (!secret) throw new Error("Thiếu khoá xác thực báo giá.");
  return createHmac("sha256", secret).update("aida:clip-quote:v1:").update(JSON.stringify(canonical(value))).digest("hex");
}
export function verifyClipQuote(value: unknown, signature: unknown, secret = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signClipQuote(value, secret), "hex"));
}
