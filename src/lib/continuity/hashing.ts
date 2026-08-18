import { createHash } from "node:crypto";

export function hashBase64(value: string) {
  return createHash("sha256").update(Buffer.from(value, "base64")).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function manifestHash(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
