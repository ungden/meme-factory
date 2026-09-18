import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import {
  healthReport,
  missingEnv,
  workerCheck,
  type HealthCheck,
} from "@/lib/health";

// Health phải phản ánh đúng lúc này, không được cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/health — 200 khi phục vụ được, 503 khi không.
 *
 * Công khai (không token) để Railway, Vercel và uptime monitor gọi được. Vì
 * vậy phần trả về chỉ nói "mục nào hỏng", không nói giá trị cấu hình.
 *
 * `?strict=worker` tính cả nhịp thở của worker vào kết quả; mặc định worker chỉ
 * được báo cáo, không làm cả app đỏ (app vẫn phục vụ web khi worker chết).
 */
export async function GET(request: Request) {
  const checks: HealthCheck[] = [];

  const missing = missingEnv(process.env);
  checks.push({
    name: "config",
    ok: missing.length === 0,
    detail: missing.length ? `thiếu ${missing.join(", ")}` : undefined,
  });

  let workerSeenAt: string | null = null;
  if (missing.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    checks.push({ name: "database", ok: false, detail: "chưa cấu hình" });
  } else {
    const started = Date.now();
    try {
      const admin = getSupabaseAdmin();
      const { error } = await admin.from("system_settings").select("key").limit(1);
      if (error) throw new Error(error.message);
      checks.push({ name: "database", ok: true, detail: `${Date.now() - started}ms` });
      const { data } = await admin
        .from("system_settings")
        .select("value")
        .eq("key", "worker_heartbeat")
        .maybeSingle();
      const value = (data?.value ?? {}) as Record<string, string>;
      workerSeenAt = value.wavespeed ?? null;
    } catch (error) {
      checks.push({
        name: "database",
        ok: false,
        detail: error instanceof Error ? error.message.slice(0, 120) : "không truy vấn được",
      });
    }
  }

  // Worker chết thì web vẫn phục vụ được, nên mặc định nó chỉ được báo cáo.
  // `?strict=worker` dành cho uptime monitor muốn đỏ khi worker im lặng.
  const worker = workerCheck(workerSeenAt);
  if (new URL(request.url).searchParams.get("strict") === "worker") checks.push(worker);

  const report = healthReport(checks);
  return NextResponse.json(
    {
      ok: report.ok,
      time: new Date().toISOString(),
      release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || null,
      worker: { ok: worker.ok, detail: worker.detail },
      checks: report.checks,
    },
    { status: report.status, headers: { "cache-control": "no-store" } },
  );
}
