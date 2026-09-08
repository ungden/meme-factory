import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params; const { supabase, user } = await getRequestUser(request); if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: batch } = await supabase.from("video_batches").select("*, video_batch_items(*, video_plans(id, version, status))").eq("id", batchId).maybeSingle();
  if (!batch || batch.project_id === null) return NextResponse.json({ error: "Không tìm thấy lô video." }, { status: 404 });
  if (!batch.quote_expires_at || new Date(batch.quote_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Báo giá lô đã hết hạn. Hãy báo giá lại từng kế hoạch trước.", code: "QUOTE_EXPIRED" }, { status: 409 });
  const items = (batch.video_batch_items ?? []).filter((item: { selected: boolean }) => item.selected);
  if (!items.length) return NextResponse.json({ error: "Lô không có video được chọn." }, { status: 400 });
  const cookie = request.headers.get("cookie"); if (!cookie) return NextResponse.json({ error: "Không đọc được phiên đăng nhập để chạy lô." }, { status: 401 });
  await supabase.from("video_batches").update({ status: "running" }).eq("id", batch.id).eq("status", "quoted");
  const results: Array<{ planId: string; jobId?: string; error?: string }> = [];
  for (const item of items) {
    const plan = item.video_plans as { id: string; version: number } | null; if (!plan) { results.push({ planId: item.video_plan_id, error: "Kế hoạch không còn tồn tại." }); continue; }
    const response = await fetch(new URL(`/api/projects/${id}/video-plans/${plan.id}/run`, request.url), { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ expectedVersion: item.plan_version }) });
    const json = await response.json().catch(() => ({})); results.push(response.ok ? { planId: plan.id, jobId: json.jobId } : { planId: plan.id, error: json.error || "Không gửi được kế hoạch." });
  }
  const hasFailure = results.some((result) => result.error); await supabase.from("video_batches").update({ status: hasFailure ? "partial" : "running" }).eq("id", batch.id);
  return NextResponse.json({ batchId: batch.id, results }, { status: 202 });
}
