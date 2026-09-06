import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";

/** Returns a short-lived private-media URL after the normal project RLS check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: output } = await supabase.from("content_outputs").select("media_url").eq("id", id).maybeSingle();
  if (!output?.media_url) return NextResponse.json({ error: "Video chưa sẵn sàng." }, { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await getSupabaseAdmin().storage.from("content-media").createSignedUrl(output.media_url, 60, download ? { download: true } : undefined);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Không tạo được URL phát video." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
