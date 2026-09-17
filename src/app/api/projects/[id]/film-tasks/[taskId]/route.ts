import { NextRequest, NextResponse } from "next/server";
import { access, checkVersion, fail, FilmError } from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    const body = await r.json();
    checkVersion(a, body);
    const { data: t } = await a.admin
      .from("short_film_tasks")
      .select("*")
      .eq("id", p.taskId)
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .single();
    if (!t || t.status !== "completed")
      throw new FilmError("Kết quả chưa sẵn sàng để duyệt.");
    if (body.action === "regenerate") {
      // Kết quả đã xong nhưng sai (người khác mặt, đi giày khi kịch bản chân
      // trần…). Trước đây chỉ có "duyệt", nên phải sửa tay trong database. Tách
      // task khỏi lượt chạy và đánh lỗi: lượt chạy tiếp tục sẽ thấy công đoạn
      // còn thiếu, báo giá và tạo lại; kết quả cũ vẫn giữ để đối chiếu.
      if (t.approved_at || t.auto_accepted_at)
        throw new FilmError("Kết quả đã được duyệt, không thể yêu cầu tạo lại.", 409);
      if (!["image", "frame", "tts", "video", "lip_sync", "dub"].includes(t.kind))
        throw new FilmError("Công đoạn này không tạo lại riêng được.", 409);
      const reason = String(body.reason || "").trim().slice(0, 300);
      if (!reason) throw new FilmError("Ghi ngắn lý do cần tạo lại.");
      const { error } = await a.admin
        .from("short_film_tasks")
        .update({
          status: "failed",
          error: `Người duyệt yêu cầu tạo lại: ${reason}`,
          production_run_id: null,
          checkpoint: { ...t.checkpoint, regenerationRequested: true },
        })
        .eq("id", t.id)
        .eq("status", "completed");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "approve")
      throw new FilmError("Thao tác không hợp lệ.");
    const { error } = await a.admin.rpc("approve_film_task", {
      p_task: t.id,
      p_project: a.project.id,
      p_actor: a.user.id,
      p_workspace: a.project.workspace_version,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
