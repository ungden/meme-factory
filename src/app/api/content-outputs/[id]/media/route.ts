import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { isProjectMediaPath } from "@/lib/project-media-path";

/** Returns a short-lived private-media URL after the normal project RLS check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: output } = await supabase.from("content_outputs").select("media_url, poster_url, content_sets!inner(project_id)").eq("id", id).maybeSingle();
  const path = request.nextUrl.searchParams.get("artifact") === "poster" ? output?.poster_url : output?.media_url;
  if (!output || !path) return NextResponse.json({ error: "Media chưa sẵn sàng." }, { status: 404 });
  // Output rows are editable by project collaborators. Their media path cannot
  // authorize admin signing of an object from another project's namespace.
  const parent = output.content_sets as unknown as { project_id: string };
  if (!isProjectMediaPath(parent.project_id, path))
    return NextResponse.json({ error: "Media không thuộc dự án." }, { status: 403 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await getSupabaseAdmin().storage.from("content-media").createSignedUrl(path, 60, download ? { download: true } : undefined);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Không tạo được URL phát video." }, { status: 500 });
  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
