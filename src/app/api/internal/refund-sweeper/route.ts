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
 * An toàn khi chạy lại: `atomic_refund_project_points` chống gọi trùng theo
 * request_id, và chỉ những lượt KHÔNG có output nào mới được hoàn — một lượt đã
 * tạo ra ảnh là một lượt đã dùng tiền thật của provider.
 */
export async function POST(request: NextRequest) {
  if (!authorizeInternal(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60000).toISOString();

  try {
    const { data: jobs, error } = await admin
      .from("generation_jobs")
      .select("id, project_id, created_by, estimated_points, creation_kind, lease_expires_at")
      .in("status", ["queued", "running"])
      .in("provider", ["google", "openai"])
      .gt("estimated_points", 0)
      .lt("created_at", staleBefore)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);

    let refunded = 0;
    for (const job of jobs || []) {
      // Worker phim giữ lease trên chính bảng này; đừng đụng vào lượt đang chạy.
      if (job.lease_expires_at && Date.parse(String(job.lease_expires_at)) > Date.now()) continue;

      const { count } = await admin
        .from("generation_outputs")
        .select("id", { count: "exact", head: true })
        .eq("generation_job_id", job.id);
      if ((count ?? 0) > 0) continue;

      const points = Number(job.estimated_points || 0);
      const { error: refundError } = await admin.rpc("atomic_refund_project_points", {
        _project_id: job.project_id,
        _actor_user_id: job.created_by,
        _cost: points,
        _description: `Hoàn ${points} điểm — lượt tạo không hoàn tất`,
        _request_id: job.id,
        _ai_action: "refund",
        _metadata: { reason: "sweeper_stale_job", creation_kind: job.creation_kind },
      });
      if (refundError) {
        await reportError(new Error(refundError.message), {
          scope: "refund.sweeper",
          tags: { jobId: String(job.id), projectId: String(job.project_id) },
        });
        continue;
      }

      await admin
        .from("generation_jobs")
        .update({
          status: "failed",
          error: { code: "ABANDONED", message: `Lượt tạo không hoàn tất sau ${STALE_MINUTES} phút.` },
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      refunded += 1;
    }

    return NextResponse.json({ scanned: jobs?.length || 0, refunded });
  } catch (error) {
    await reportError(error, { scope: "refund.sweeper" });
    return NextResponse.json({ error: "Không quét được lượt tạo bỏ dở." }, { status: 500 });
  }
}
