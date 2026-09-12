import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function watermarkAiAccess(request: NextRequest, id: string) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Hãy đăng nhập lại." }, { status: 401 }) };
  const { data: project, error } = await supabase.from("projects").select("id,user_id,workspace_version").eq("id", id).maybeSingle();
  if (error || !project) return { error: NextResponse.json({ error: "Không có quyền xem dự án." }, { status: 404 }) };
  if (project.user_id !== user.id) return { error: NextResponse.json({ error: "Chỉ chủ dự án được tạo watermark." }, { status: 403 }) };
  return { project, user };
}
export function watermarkAiError(message: string) {
  const known: Record<string, [string, number]> = {
    INSUFFICIENT_POINTS: ["Dự án chưa đủ điểm. Hãy bổ sung điểm rồi thử lại báo giá này.", 402],
    QUOTE_EXPIRED: ["Báo giá đã hết hạn. Hãy xem giá mới.", 409],
    JOB_ACTIVE: ["Dự án đang có một lượt AI watermark chưa hoàn tất. Hãy xem tiến trình bên dưới.", 409],
    WORKSPACE_FORBIDDEN: ["Dự án đã thay đổi hoặc bạn đã hết quyền. Hãy tải lại trang.", 409],
    QUOTE_NOT_FOUND: ["Không tìm thấy báo giá.", 404],
    RATE_LIMIT: ["Tối đa 30 lượt báo giá mỗi ngày. Hãy thử lại ngày mai.", 429],
  };
  const value = Object.entries(known).find(([key]) => message.includes(key))?.[1];
  return NextResponse.json({ error: value?.[0] || "Chưa xử lý được tác vụ. Hãy thử tải lại tiến trình." }, { status: value?.[1] || 500 });
}
