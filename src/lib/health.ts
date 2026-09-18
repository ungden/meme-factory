/**
 * Kiểm tra sức khoẻ tiến trình: đủ cấu hình chưa, database còn trả lời không,
 * worker còn thở không.
 *
 * Tách phần thuần logic ra khỏi route để kiểm thử được và để
 * `scripts/railway-worker-entrypoint.mjs` có một hợp đồng rõ ràng: 200 là
 * chạy được, 503 là không.
 */

export type HealthCheck = {
  name: string;
  ok: boolean;
  /** Ngắn gọn, không chứa bí mật — health là endpoint công khai. */
  detail?: string;
};

/** Thiếu bất kỳ biến nào ở đây là hệ thống không phục vụ đủ một luồng chính. */
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "WAVESPEED_API_KEY",
  "WAVESPEED_WEBHOOK_SECRET",
  "VIDEO_WORKER_TOKEN",
] as const;

/** Giá trị giả dùng cho build/preview cũng phải bị coi là thiếu. */
function present(value: string | undefined): boolean {
  if (!value) return false;
  const text = value.trim();
  if (!text) return false;
  return !/placeholder|changeme|your[-_]?key/i.test(text);
}

export function missingEnv(
  env: Record<string, string | undefined>,
  names: readonly string[] = REQUIRED_ENV,
): string[] {
  return names.filter((name) => !present(env[name]));
}

/** Worker được coi là sống nếu vừa báo về trong ngưỡng này. */
export const WORKER_STALE_AFTER_MS = 5 * 60 * 1000;

export function workerCheck(
  lastSeen: string | null | undefined,
  now: number = Date.now(),
  staleAfterMs: number = WORKER_STALE_AFTER_MS,
): HealthCheck {
  if (!lastSeen) return { name: "worker", ok: false, detail: "chưa từng báo về" };
  const seenAt = Date.parse(lastSeen);
  if (Number.isNaN(seenAt)) return { name: "worker", ok: false, detail: "mốc thời gian không đọc được" };
  const ageSeconds = Math.round((now - seenAt) / 1000);
  return ageSeconds * 1000 > staleAfterMs
    ? { name: "worker", ok: false, detail: `im lặng ${ageSeconds}s` }
    : { name: "worker", ok: true, detail: `${ageSeconds}s trước` };
}

export function healthReport(checks: HealthCheck[]): {
  ok: boolean;
  status: number;
  checks: HealthCheck[];
} {
  const ok = checks.every((check) => check.ok);
  return { ok, status: ok ? 200 : 503, checks };
}
