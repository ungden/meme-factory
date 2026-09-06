import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const status = body.status === "rejected" ? "rejected" : "approved";
  const { data: output } = await supabase.from("content_outputs").select("id, review_version, status").eq("id", id).maybeSingle();
  if (!output) return NextResponse.json({ error: "Không tìm thấy đầu ra." }, { status: 404 });
  if (!['completed', 'approved', 'rejected'].includes(output.status)) return NextResponse.json({ error: "Chỉ có thể duyệt đầu ra đã tạo xong." }, { status: 409 });
  const { error: reviewError } = await supabase.from("content_output_reviews").insert({ content_output_id: id, reviewer_id: user.id, status, note: typeof body.note === "string" ? body.note : null, version: output.review_version });
  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 });
  const { data, error } = await supabase.from("content_outputs").update({ status, approved_at: status === "approved" ? new Date().toISOString() : null, approved_by: status === "approved" ? user.id : null }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ output: data });
}
