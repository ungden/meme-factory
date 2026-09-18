import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "content-media";
/** Chữ người dùng phải gõ để xác nhận — cùng chữ với nút trong giao diện. */
export const DELETE_CONFIRMATION = "XOA TAI KHOAN";

/**
 * Xoá mọi file media của một dự án.
 *
 * Storage không xoá theo thư mục, phải liệt kê rồi xoá từng đường dẫn. Đệ quy
 * có giới hạn độ sâu để một cấu trúc bất thường không biến việc này thành vòng
 * lặp vô tận trong một request.
 */
async function removeProjectMedia(admin: SupabaseClient, prefix: string, depth = 0): Promise<number> {
  if (depth > 4) return 0;
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return 0;
  const files = data.filter((entry) => entry.id).map((entry) => `${prefix}/${entry.name}`);
  const folders = data.filter((entry) => !entry.id).map((entry) => `${prefix}/${entry.name}`);
  let removed = 0;
  if (files.length) {
    await admin.storage.from(BUCKET).remove(files);
    removed += files.length;
  }
  for (const folder of folders) removed += await removeProjectMedia(admin, folder, depth + 1);
  return removed;
}

/**
 * POST /api/account/delete — xoá vĩnh viễn tài khoản và dữ liệu của nó.
 *
 * Không thể hoàn tác, nên đòi người dùng gõ đúng một câu xác nhận thay vì chỉ
 * bấm một nút. Thứ tự: media → dữ liệu trong Postgres (RPC `purge_user_data`) →
 * tài khoản đăng nhập. Nếu RPC báo còn ràng buộc chưa gỡ được thì dừng lại và
 * báo lỗi, chứ không để tài khoản nửa xoá nửa còn.
 */
export async function POST(request: NextRequest) {
  const { user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (String(body?.confirm || "").trim().toUpperCase() !== DELETE_CONFIRMATION)
    return NextResponse.json(
      { error: `Nhập đúng "${DELETE_CONFIRMATION}" để xác nhận xoá.` },
      { status: 400 },
    );

  const admin = getSupabaseAdmin();
  try {
    const { data: projects } = await admin.from("projects").select("id").eq("user_id", user.id);
    for (const project of projects || []) await removeProjectMedia(admin, String(project.id));

    const { data: purge, error: purgeError } = await admin.rpc("purge_user_data", { _user_id: user.id });
    if (purgeError) throw new Error(purgeError.message);
    const blocked = (purge as { blocked?: string[] } | null)?.blocked ?? [];
    if (blocked.length)
      throw new Error(`Còn dữ liệu chưa gỡ được: ${blocked.join(", ")}`);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    await reportError(error, { scope: "account.delete", tags: { userId: user.id } });
    return NextResponse.json(
      { error: "Chưa xoá được tài khoản. Chúng tôi đã ghi nhận lỗi này — viết cho support@aida.vn để được xử lý." },
      { status: 500 },
    );
  }
}
