import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { draftId } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data, error } = await supabase.from("workspace_drafts").select("*").eq("id", draftId).eq("created_by", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy bản nháp." }, { status: 404 });
  return NextResponse.json({ draft: data });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { draftId } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  const expectedVersion = Number(body.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || typeof body.payload !== "object" || !body.payload) return NextResponse.json({ error: "Bản nháp không hợp lệ." }, { status: 400 });
  const { data, error } = await supabase.from("workspace_drafts").update({ payload: body.payload, content_set_id: typeof body.content_set_id === "string" ? body.content_set_id : null, content_output_id: typeof body.content_output_id === "string" ? body.content_output_id : null, version: expectedVersion + 1 }).eq("id", draftId).eq("created_by", user.id).eq("version", expectedVersion).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Bản nháp đã thay đổi ở nơi khác. Hãy tải lại." }, { status: 409 });
  return NextResponse.json({ draft: data });
}
