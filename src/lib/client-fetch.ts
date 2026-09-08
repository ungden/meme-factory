"use client";

type CacheEntry<T> = { value?: T; expiresAt: number; pending?: Promise<T> };

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Small in-memory cache for private same-session reads. It deliberately never
 * uses a shared HTTP cache: every API still authenticates and applies RLS.
 */
export async function fetchJsonCached<T>(
  url: string,
  ttlMs: number,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(url) as CacheEntry<T> | undefined;
  if (existing?.value !== undefined && existing.expiresAt > now)
    return existing.value;
  if (existing?.pending) return existing.pending;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
  const pending = fetch(url, { signal: controller.signal, cache: "no-store" })
    .then(async (response) => {
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(json.error || `Request failed (${response.status})`);
      cache.set(url, { value: json as T, expiresAt: Date.now() + ttlMs });
      return json as T;
    })
    .catch((error) => {
      cache.delete(url);
      throw error;
    })
    .finally(() => window.clearTimeout(timeoutId));

  cache.set(url, { expiresAt: 0, pending });
  return pending;
}

export function invalidateClientCache(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function clearClientCache() {
  cache.clear();
}

/** Refresh the project balance after a known financial state change. */
export function notifyProjectBalanceChanged() {
  for (const key of cache.keys()) {
    if (key.startsWith("/api/projects/") && key.endsWith("/wallet"))
      cache.delete(key);
  }
  window.dispatchEvent(new Event("aida:project-balance-changed"));
}
