import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  if (!['image', 'video'].includes(body.kind) || !['1:1', '4:5', '9:16', '16:9'].includes(body.format)) return NextResponse.json({ error: "Đầu ra không hợp lệ." }, { status: 400 });
  const { data: set } = await supabase.from("content_sets").select("id").eq("id", id).maybeSingle();
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ nội dung." }, { status: 404 });
  const { data, error } = await supabase.from("content_outputs").insert({
    content_set_id: id,
    kind: body.kind,
    format: body.format,
    caption: typeof body.caption === "string" ? body.caption : null,
    script: typeof body.script === "string" ? body.script : null,
    poster_url: typeof body.poster_url === "string" ? body.poster_url : null,
    media_url: typeof body.media_url === "string" ? body.media_url : null,
    status: body.kind === "image" && typeof body.media_url === "string" ? "completed" : "draft",
    duration_seconds: body.kind === "video" ? Number(body.duration_seconds ?? 15) : null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ output: data }, { status: 201 });
}
