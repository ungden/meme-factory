import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/internal-auth";
import { reportError } from "@/lib/observability";

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

  const origin = new URL(request.url).origin;
  const endpoints = ["/api/internal/short-film-production/advance", "/api/internal/wavespeed/reconcile"];
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
        if (!response.ok) throw new Error(`${response.status} ${payload.error || ""}`.trim());
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
