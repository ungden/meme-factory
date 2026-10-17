import { NextRequest, NextResponse } from "next/server";
import { callbackToken, battleAdmin, checked } from "@/lib/battle-rap/server";
import { tokenMatches } from "@/lib/internal-auth";

/** Callback chỉ khôi phục mã theo dõi; kết quả luôn được đọc lại bằng khoá server. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(stepId) || !tokenMatches(new URL(request.url).searchParams.get("token"), callbackToken(stepId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json(), admin = battleAdmin();
    const id = body.data?.task_id || body.data?.taskId || body.data?.id || body.id;
    if (typeof id !== "string" || id.length > 200) return NextResponse.json({ ok: true });
    const step = await checked(admin.from("battle_rap_steps").select("run_id,provider_id,status").eq("id", stepId).single());
    if (!step) return NextResponse.json({ error: "Không tìm thấy lượt." }, { status: 404 });
    if (step.provider_id && step.provider_id !== id) return NextResponse.json({ error: "Kết quả không khớp lượt." }, { status: 409 });
    if (["submitting", "uncertain"].includes(step.status)) {
      await checked(admin.from("battle_rap_steps").update({ provider_id: id, status: "processing", updated_at: new Date().toISOString() }).eq("id", stepId).in("status", ["submitting", "uncertain"]));
      await checked(admin.from("battle_rap_runs").update({ status: "queued", error: null, updated_at: new Date().toISOString() }).eq("id", step.run_id).eq("status", "needs_review").eq("settled", false));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("battle callback failed", error);
    return NextResponse.json({ error: "Chưa lưu được kết quả." }, { status: 500 });
  }
}
