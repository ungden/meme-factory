import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { checked, reconcileLocalResults, signMedia } from "@/lib/battle-rap/server";
import type { BattleRun } from "@/lib/battle-rap/contracts";
import { ensureProjectPoints } from "@/lib/project-points";

type Params = { params: Promise<{ id: string; runId: string }> };
async function context(request: NextRequest, params: Params["params"]) {
  const p = await params, a = await access(request, p.id);
  const run = await checked(a.admin.from("battle_rap_runs").select("*").eq("id", p.runId).eq("project_id", a.project.id).eq("workspace_version", a.project.workspace_version).maybeSingle()) as BattleRun | null;
  if (!run) throw new FilmError("Không tìm thấy bài rap trong kênh.", 404);
  return { a, run };
}
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { a, run } = await context(request, params);
    const steps = await checked(a.admin.from("battle_rap_steps").select("id,step_key,status,points,created_at,updated_at").eq("run_id", run.id).order("created_at"));
    const images = Object.fromEntries(await Promise.all(Object.entries(run.state.images || {}).map(async ([id, path]) => [id, await signMedia(a.admin, run.project_id, path)])));
    const output = run.state.output ? Object.fromEntries(await Promise.all(["video", "subtitles", "plan"].map(async key => [key, await signMedia(a.admin, run.project_id, run.state.output![key as "video" | "subtitles" | "plan"])]))) : null;
    const audio = run.state.music?.path ? await signMedia(a.admin, run.project_id, run.state.music.path) : null;
    return NextResponse.json({ run, steps, media: { images, output, audio } });
  } catch (error) { return fail(error); }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { a, run } = await context(request, params), body = await request.json();
    if (["cancel", "resume", "increase_budget"].includes(body.action)) {
      if (body.action !== "cancel") {
        await reconcileLocalResults(a.admin, run);
        const nextBudget = body.action === "increase_budget" ? Number(body.budgetPoints) : run.budget_points;
        if (!Number.isInteger(nextBudget) || nextBudget < run.budget_points || nextBudget > 100000) throw new FilmError("Mức chi mới chưa hợp lệ.");
        const raw = await checked(a.admin.from("battle_rap_runs").select("settled").eq("id", run.id).single());
        const remaining = (raw?.settled ? run.budget_points - run.points_used : 0) + nextBudget - run.budget_points;
        const wallet = await checked(a.admin.from("project_wallets").select("points").eq("project_id", run.project_id).maybeSingle());
        const funded = await ensureProjectPoints(async (name, args) => a.admin.rpc(name, args), { projectId: run.project_id, projectOwnerId: a.project.user_id, actorUserId: a.user.id, currentPoints: Number(wallet?.points || 0), needed: remaining, projectName: a.project.name });
        if (!funded.ok) return NextResponse.json({ error: "Chưa đủ điểm để làm tiếp.", required: remaining, available: funded.available }, { status: 402 });
      }
      await checked(a.admin.rpc("control_battle_rap_run", { p_id: run.id, p_project: run.project_id, p_actor: a.user.id, p_action: body.action, p_request: String(body.idempotencyKey || crypto.randomUUID()), p_new_budget: body.action === "increase_budget" ? Number(body.budgetPoints) : null }));
      return NextResponse.json({ ok: true });
    }
    if (!["awaiting_music", "awaiting_lyrics"].includes(run.status)) throw new FilmError("Bài đang làm. Chờ công đoạn hiện tại xong nhé.", 409);
    if (body.action === "prepareUpload" && run.status === "awaiting_music") {
      const path = `${run.project_id}/battle-rap/${run.id}/input/${crypto.randomUUID()}.audio`;
      const signed = await checked(a.admin.storage.from("content-media").createSignedUploadUrl(path));
      if (!signed) throw new FilmError("Chưa chuẩn bị được chỗ nhận nhạc.");
      return NextResponse.json({ path, token: signed.token });
    }
    if (body.action === "attachMusic" && run.status === "awaiting_music") {
      const path = String(body.path || "");
      if (!path.startsWith(`${run.project_id}/battle-rap/${run.id}/input/`) || !/\/input\/[0-9a-f-]{36}\.audio$/.test(path)) throw new FilmError("Bản nhạc không thuộc bài này.");
      const next = { ...run.state, music: { path, duration: 0 }, ...(typeof body.srt === "string" && body.srt.trim() ? { rawTiming: body.srt.slice(0, 150000) } : {}) };
      const result = await checked(a.admin.from("battle_rap_runs").update({ state: next, phase: "ingest", status: "queued", error: null, updated_at: new Date().toISOString() }).eq("id", run.id).eq("status", "awaiting_music").select("id"));
      if (!result?.length) throw new FilmError("Bài vừa được cập nhật. Tải lại nhé.", 409);
    } else if (body.action === "attachTiming" && run.status === "awaiting_lyrics") {
      if (typeof body.srt !== "string" || !body.srt.trim() || body.srt.length > 150000) throw new FilmError("Chọn tệp lời SRT hợp lệ.");
      const result = await checked(a.admin.from("battle_rap_runs").update({ state: { ...run.state, rawTiming: body.srt }, status: "queued", error: null, updated_at: new Date().toISOString() }).eq("id", run.id).eq("status", "awaiting_lyrics").select("id"));
      if (!result?.length) throw new FilmError("Bài vừa được cập nhật. Tải lại nhé.", 409);
    } else throw new FilmError("Thao tác chưa phù hợp với bài.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known: Record<string, string> = { BATTLE_BUSY: "Công đoạn đang nhận kết quả. Chờ một chút rồi thử lại nhé.", BATTLE_SUBMISSION_UNCERTAIN: "Cần đối chiếu lần gửi trước khi làm tiếp để tránh tính phí hai lần.", BATTLE_RESUME_INVALID: "Bài này chưa cần làm tiếp.", BATTLE_ACCESS_CHANGED: "Quyền vào kênh đã thay đổi.", INSUFFICIENT_POINTS: "Chưa đủ điểm để làm tiếp." };
    return fail(known[message] ? new FilmError(known[message], message === "INSUFFICIENT_POINTS" ? 402 : 409) : error);
  }
}
