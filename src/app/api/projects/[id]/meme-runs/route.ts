import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { normalizeMemeOptions } from "@/lib/meme-autopilot";
import { processMemeRun, type MemeRun } from "@/lib/meme-production";

export const maxDuration = 180;

/** Các lượt meme gần đây của kênh, kèm ảnh đã xong để xem và đăng. */
export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    const { data: runs, error } = await a.admin
      .from("meme_production_runs")
      .select("id,source,intent,status,phase,error,created_at,completed_at,meme_id,memes(id,image_url,generated_content,format)")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("created_at", { ascending: false })
      .limit(24);
    if (error) throw error;
    return NextResponse.json({ runs: runs || [] });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Bấm "AI làm meme": tạo 1–4 lượt rồi làm ngay sau khi trả lời. Đóng trình duyệt
 * không sao — lượt chưa xong được cron làm tiếp.
 */
export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(r, (await params).id);
    const body = await r.json().catch(() => ({}));
    if (Number(body.workspaceVersion) !== a.project.workspace_version)
      throw new FilmError("Dự án vừa thay đổi. Tải lại trang rồi thử lại.", 409);
    const count = Math.min(4, Math.max(1, Number(body.count) || 1));
    const intent = String(body.intent || "").trim().slice(0, 2000);
    const options = normalizeMemeOptions(body.options);
    const baseKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : crypto.randomUUID();
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const key = crypto.createHash("md5").update(`${baseKey}:${index}`).digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
      const { data, error } = await a.admin.rpc("create_meme_production_run", {
        p_project: a.project.id,
        p_actor: a.user.id,
        p_workspace: a.project.workspace_version,
        p_intent: intent,
        p_options: options,
        p_key: key,
        p_source: "manual",
        p_schedule_date: null,
      });
      if (error) throw error;
      ids.push(String(data));
    }
    after(async () => {
      for (const id of ids) {
        const { data: claimed } = await a.admin.rpc("claim_meme_production_runs", { p_limit: 1, p_run: id });
        const run = (claimed || [])[0] as MemeRun | undefined;
        if (run) await processMemeRun(a.admin, run);
      }
    });
    return NextResponse.json({ runIds: ids }, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}
