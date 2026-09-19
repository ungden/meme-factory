import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { authorizeInternal } from "@/lib/internal-auth";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sau chừng này mà một lượt tạo ảnh vẫn chưa kết thúc thì nó sẽ không kết thúc nữa. */
const STALE_MINUTES = 30;
const BATCH = 25;

/**
 * POST /api/internal/refund-sweeper — hoàn điểm cho những lượt tạo ảnh chết giữa chừng.
 *
 * `api/ai/generate-image` trừ điểm trước rồi hoàn trong khối catch của chính
 * request đó. Nếu tiến trình chết — hết thời gian của hàm serverless, deploy
 * ngay lúc đó, OOM — khối catch không bao giờ chạy và người dùng mất điểm mà
 * không nhận được gì. Không có cách nào sửa việc này bên trong request; phải có
 * một vòng quét bên ngoài.
 *
 * Mỗi lượt được chốt trong một RPC có row lock: kiểm job/output/film task,
 * hoàn sổ điểm và đánh dấu failed cùng một transaction.  Worker phim có lease
 * trên `short_film_tasks`, nên không bao giờ đi qua đường này.
 */
export async function POST(request: NextRequest) {
  if (!authorizeInternal(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60000).toISOString();

  try {
    const { data: jobs, error } = await admin
      .from("generation_jobs")
      .select("id")
      .in("status", ["queued", "running"])
      .in("provider", ["google", "openai"])
      .gt("estimated_points", 0)
      .lt("created_at", staleBefore)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);

    let refunded = 0;
    for (const job of jobs || []) {
      const { data: result, error: settleError } = await admin.rpc(
        "settle_stale_image_generation_job",
        { _job_id: job.id, _stale_before: staleBefore },
      );
      if (settleError) {
        await reportError(new Error(settleError.message), {
          scope: "refund.sweeper",
          tags: { jobId: String(job.id) },
        });
        continue;
      }
      if (result?.settled) refunded += 1;
    }

    return NextResponse.json({ scanned: jobs?.length || 0, refunded });
  } catch (error) {
    await reportError(error, { scope: "refund.sweeper" });
    return NextResponse.json({ error: "Không quét được lượt tạo bỏ dở." }, { status: 500 });
  }
}
