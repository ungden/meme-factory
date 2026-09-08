import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { MAX_BATCH_PLANS } from "@/lib/multiscene-video";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function projectForRef(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], ref: string) { const query = supabase.from("projects").select("id").limit(1); return UUID.test(ref) ? query.eq("id", ref).maybeSingle() : query.eq("slug", ref).maybeSingle(); }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, user } = await getRequestUser(request); if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: project } = await projectForRef(supabase, id); if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const { data, error } = await supabase.from("video_batches").select("*, video_batch_items(*, video_plans(id, title, status))").eq("project_id", project.id).order("updated_at", { ascending: false }).limit(24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ batches: data ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, user } = await getRequestUser(request); if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: project } = await projectForRef(supabase, id); if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const body: { planIds?: unknown; title?: unknown } = await request.json().catch(() => ({})); const planIds = [...new Set(Array.isArray(body.planIds) ? body.planIds.filter((value: unknown): value is string => typeof value === "string") : [])];
  if (!planIds.length || planIds.length > MAX_BATCH_PLANS) return NextResponse.json({ error: `Một lô cần từ 1 đến ${MAX_BATCH_PLANS} video.` }, { status: 400 });
  const { data: plans, error: plansError } = await supabase.from("video_plans").select("id, title, version, status, quote_snapshot, quote_expires_at").eq("project_id", project.id).in("id", planIds);
  if (plansError || (plans ?? []).length !== planIds.length) return NextResponse.json({ error: "Một hoặc nhiều kế hoạch không thuộc dự án." }, { status: 400 });
  const now = Date.now(); const invalid = (plans ?? []).find((plan) => plan.status !== "quoted" || !plan.quote_expires_at || new Date(plan.quote_expires_at).getTime() <= now || !(plan.quote_snapshot as { totals?: { customerPoints?: number } } | null)?.totals?.customerPoints);
  if (invalid) return NextResponse.json({ error: `Kế hoạch “${invalid.title}” chưa có báo giá còn hiệu lực.` }, { status: 409 });
  const totals = (plans ?? []).reduce((total, plan) => { const quote = plan.quote_snapshot as { totals: { customerPoints: number; providerCostUsd: number } }; return { customerPoints: total.customerPoints + quote.totals.customerPoints, providerCostUsd: total.providerCostUsd + quote.totals.providerCostUsd }; }, { customerPoints: 0, providerCostUsd: 0 });
  const expiresAt = new Date(Math.min(...(plans ?? []).map((plan) => new Date(plan.quote_expires_at).getTime()))).toISOString();
  const { data: batch, error } = await supabase.from("video_batches").insert({ project_id: project.id, title: typeof body.title === "string" ? body.title.trim().slice(0, 160) || `Lô ${plans?.length} video` : `Lô ${plans?.length} video`, status: "quoted", quote_snapshot: { totals, planIds }, quote_expires_at: expiresAt, created_by: user.id }).select().single();
  if (error || !batch) return NextResponse.json({ error: error?.message || "Không tạo được lô video." }, { status: 500 });
  const { data: items, error: itemsError } = await supabase.from("video_batch_items").insert((plans ?? []).map((plan) => ({ video_batch_id: batch.id, video_plan_id: plan.id, plan_version: plan.version, quote_snapshot: plan.quote_snapshot }))).select();
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  return NextResponse.json({ batch: { ...batch, video_batch_items: items }, totals, expiresAt }, { status: 201 });
}
