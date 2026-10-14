import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { MAX_WATERMARK_BYTES, validateWatermarkImage } from "@/lib/watermark-image";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { id } = await params;
  const { data: project, error } = await supabase.from("projects")
    .select("id,user_id,workspace_version").eq("id", id).maybeSingle();
  if (error || !project) return NextResponse.json({ error: "Không tìm thấy kênh, hoặc bạn không còn quyền vào kênh này." }, { status: 404 });
  // Brand settings are owner-managed, matching the projects UPDATE policy.
  if (project.user_id !== user.id)
    return NextResponse.json({ error: "Chỉ chủ kênh mới đổi được logo." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_WATERMARK_BYTES + 65_536)
    return NextResponse.json({ error: "Logo tối đa 3 MB." }, { status: 413 });
  try {
    const form = await request.formData();
    if (Number(form.get("workspaceVersion")) !== project.workspace_version)
      return NextResponse.json({ error: "Kênh vừa thay đổi. Tải lại trang nhé." }, { status: 409 });
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_WATERMARK_BYTES)
      return NextResponse.json({ error: "Chọn ảnh logo tối đa 3 MB nhé." }, { status: 400 });
    const normalized = await validateWatermarkImage(Buffer.from(await file.arrayBuffer()));
    const path = `${user.id}/${project.id}/${project.workspace_version}/${randomUUID()}.png`;
    const bucket = supabase.storage.from("watermarks");
    const { error: uploadError } = await bucket.upload(path, normalized.bytes, {
      contentType: "image/png", cacheControl: "31536000", upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: "Chưa lưu được logo. Bạn thử lại nhé." }, { status: 502 });
    return NextResponse.json({ url: bucket.getPublicUrl(path).data.publicUrl, width: normalized.width, height: normalized.height });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chưa đọc được ảnh logo. Chọn ảnh khác nhé." }, { status: 400 });
  }
}
