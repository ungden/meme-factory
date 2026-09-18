/**
 * Báo lỗi có cấu trúc, không phụ thuộc SDK.
 *
 * Hai runtime cùng cần nó: Next trên Vercel và worker trên Railway. SDK
 * `@sentry/nextjs` kéo theo bước build riêng cho một việc duy nhất là "gửi một
 * sự kiện lỗi", nên ở đây tự gửi envelope — đúng giao thức Sentry, không phụ
 * thuộc, chạy được ở cả hai nơi.
 *
 * Không có SENTRY_DSN thì vẫn in một dòng JSON ra log (Vercel/Railway đều giữ
 * log), nên gắn `reportError` vào chỗ nào cũng an toàn.
 */

/**
 * Tách DSN dạng https://<key>@<host>/<projectId>.
 *
 * @param {string | undefined} dsn
 * @returns {{ url: string, key: string } | null}
 */
export function parseSentryDsn(dsn) {
  if (!dsn) return null;
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (!parsed.username || !projectId) return null;
    return {
      url: `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`,
      key: parsed.username,
    };
  } catch {
    return null;
  }
}

/** @param {unknown} error */
function describe(error) {
  if (error instanceof Error)
    return {
      type: error.name || "Error",
      value: error.message || String(error),
      stack: error.stack || null,
    };
  if (typeof error === "string") return { type: "Error", value: error, stack: null };
  try {
    return { type: "Error", value: JSON.stringify(error), stack: null };
  } catch {
    return { type: "Error", value: String(error), stack: null };
  }
}

function eventId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Dựng envelope Sentry. Tách riêng để kiểm thử được mà không cần gửi mạng.
 *
 * @param {ReturnType<typeof describe>} failure
 * @param {{ tags?: Record<string, string>, extra?: Record<string, unknown>, level?: string, scope?: string, environment?: string, release?: string }} options
 */
export function sentryEnvelope(failure, options = {}) {
  const id = eventId();
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: options.level || "error",
    logger: options.scope || "aida",
    environment: options.environment || "development",
    ...(options.release ? { release: options.release } : {}),
    exception: { values: [{ type: failure.type, value: failure.value }] },
    tags: options.tags || {},
    extra: { ...(options.extra || {}), ...(failure.stack ? { stack: failure.stack } : {}) },
  };
  return (
    [
      JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n") + "\n"
  );
}

/**
 * Ghi lỗi ra log và gửi lên Sentry nếu có DSN. Không bao giờ ném.
 *
 * @param {unknown} error
 * @param {{ scope?: string, tags?: Record<string, string | number | null | undefined>, extra?: Record<string, unknown>, level?: "error" | "warning" | "info" }} [context]
 * @returns {Promise<void>}
 */
export async function reportError(error, context = {}) {
  const failure = describe(error);
  const tags = Object.fromEntries(
    Object.entries(context.tags || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  const line = {
    level: context.level || "error",
    scope: context.scope || "app",
    message: failure.value,
    type: failure.type,
    ...tags,
  };
  // Một dòng JSON: Vercel và Railway đều tìm kiếm được theo trường.
  console.error(JSON.stringify(line));
  if (failure.stack) console.error(failure.stack);

  const target = parseSentryDsn(process.env.SENTRY_DSN);
  if (!target) return;
  try {
    await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=aida/1.0, sentry_key=${target.key}`,
      },
      body: sentryEnvelope(failure, {
        ...context,
        tags,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Báo lỗi hỏng thì cũng chỉ là báo lỗi; log ở trên đã giữ nội dung.
  }
}
