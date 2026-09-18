import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/internal-auth";
import { reportError } from "@/lib/observability";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/tick — lưới an toàn cho worker Railway.
 *
 * Toàn bộ lịch sản xuất từng treo trên một container Railway duy nhất: nó chết
 * là mọi tập phim đứng im mà không ai biết. Cron này gọi đúng các endpoint nội
 * bộ mà worker vẫn gọi, nên khi worker sống thì đây chỉ là một nhịp thừa
 * (lease và idempotency lo phần trùng), còn khi worker chết thì phim vẫn chạy.
 *
 * Gọi qua HTTP thay vì gọi hàm trực tiếp để mỗi endpoint giữ ngân sách thời
 * gian riêng: cron có bỏ chờ thì hàm kia vẫn chạy nốt ở lần gọi của nó.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = process.env.VIDEO_WORKER_TOKEN;
  if (!token)
    return NextResponse.json({ error: "Thiếu VIDEO_WORKER_TOKEN." }, { status: 503 });

  // Không dùng origin của lời gọi: cron của Vercel gọi vào URL của bản deploy,
  // URL đó nằm sau Deployment Protection, nên hàm tự gọi chính mình và nhận 401.
  const origin = SITE_URL;
  const endpoints = [
    "/api/internal/short-film-production/advance",
    "/api/internal/wavespeed/reconcile",
    "/api/internal/refund-sweeper",
  ];
  const results = await Promise.all(
    endpoints.map(async (path) => {
      try {
        const response = await fetch(`${origin}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(45000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          // Chỉ lấy `error` khi nó là chuỗi: một lớp chặn ở giữa (Deployment
          // Protection) trả về `{error: {...}}`, và nối thẳng vào chuỗi sẽ cho
          // "[object Object]" — đúng cái đã làm mất một buổi truy lỗi.
          const detail = typeof payload.error === "string" ? payload.error : "";
          throw new Error(`${response.status} ${detail}`.trim());
        }
        return { path, ok: true, processed: Number(payload.processed || 0) };
      } catch (error) {
        // Hết giờ chờ là bình thường: endpoint vẫn chạy tiếp ở lần gọi của nó.
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        if (!timedOut) await reportError(error, { scope: "cron.tick", tags: { path } });
        return { path, ok: timedOut, processed: 0, detail: timedOut ? "đang chạy tiếp" : "lỗi" };
      }
    }),
  );
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
