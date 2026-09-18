/**
 * Bọc kiểu cho `scripts/observability.mjs` để code ứng dụng dùng.
 *
 * Dùng chung một lõi với worker: cùng định dạng log, cùng đích Sentry, nên một
 * sự cố nhìn giống nhau dù xảy ra ở Vercel hay Railway.
 */
import { reportError as report } from "../../scripts/observability.mjs";

export type ErrorContext = {
  /** Vùng phát sinh, ví dụ "webhook.wavespeed" hoặc "short-film.production". */
  scope?: string;
  /** Khoá lọc trong Sentry: runId, taskId, projectId, userId… */
  tags?: Record<string, string | number | null | undefined>;
  extra?: Record<string, unknown>;
  level?: "error" | "warning" | "info";
};

export function reportError(error: unknown, context: ErrorContext = {}): Promise<void> {
  return report(error, context) as Promise<void>;
}
