import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function watermarkAiAccess(request: NextRequest, id: string) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé." }, { status: 401 }) };
  const { data: project, error } = await supabase.from("projects").select("id,user_id,workspace_version").eq("id", id).maybeSingle();
  if (error || !project) return { error: NextResponse.json({ error: "Không tìm thấy kênh, hoặc bạn không còn quyền vào kênh này." }, { status: 404 }) };
  if (project.user_id !== user.id) return { error: NextResponse.json({ error: "Chỉ chủ kênh mới đổi được logo." }, { status: 403 }) };
  return { project, user };
}
export function watermarkAiError(message: string) {
  const known: Record<string, [string, number]> = {
    INSUFFICIENT_POINTS: ["Kênh không đủ điểm. Nạp thêm rồi bấm lại nhé.", 402],
    QUOTE_EXPIRED: ["Giá đã hết hạn. Bấm Xem giá lại nhé; bạn chưa bị trừ điểm.", 409],
    JOB_ACTIVE: ["Đang có một logo làm dở. Xem tiến độ bên dưới nhé.", 409],
    WORKSPACE_FORBIDDEN: ["Kênh vừa thay đổi, hoặc bạn không còn quyền. Tải lại trang nhé.", 409],
    QUOTE_NOT_FOUND: ["Không tìm thấy giá này. Bấm Xem giá lại nhé.", 404],
    RATE_LIMIT: ["Hôm nay bạn đã xem giá 30 lần. Mai thử lại nhé.", 429],
  };
  const value = Object.entries(known).find(([key]) => message.includes(key))?.[1];
  const code = Object.keys(known).find((key) => message.includes(key));
  // Trả kèm mã để trang mở hộp Cần thêm điểm thay vì chỉ hiện chữ.
  return NextResponse.json(
    { error: value?.[0] || "Chưa làm được lúc này. Tải lại trang rồi thử lại nhé.", ...(code ? { code } : {}) },
    { status: value?.[1] || 500 },
  );
}
