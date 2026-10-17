import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { checked, reconcileLocalResults, signMedia } from "@/lib/battle-rap/server";
import type { BattleRun } from "@/lib/battle-rap/contracts";
import { ensureProjectPoints } from "@/lib/project-points";
import { applyReviewAction } from "@/lib/battle-rap/review";
import { customerQuote, estimateImageGenerationPrice } from "@/lib/ai-pricing";
import { IMAGE_MODEL } from "@/lib/gemini-image";
import { sunoConfigured } from "@/lib/battle-rap/suno";

type Params = { params: Promise<{ id: string; runId: string }> };
const reviewActions = ["approveStage", "regenerateAsset", "selectVariant", "regenerateText", "replaceMusic"];
const requestKey = (value: unknown) => {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new FilmError("Mã yêu cầu chưa hợp lệ. Tải lại trang nhé.");
  return value;
};
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
    const clips = Object.fromEntries(await Promise.all(Object.entries(run.state.clipFiles || {}).map(async ([id, path]) => [id, await signMedia(a.admin, run.project_id, path)])));
    const excerpts = Object.fromEntries(await Promise.all(Object.entries(run.state.excerpts || {}).map(async ([id, path]) => [id, await signMedia(a.admin, run.project_id, path)])));
    const variants = Object.fromEntries(await Promise.all(Object.entries(run.state.review?.variants || {}).map(async ([key, items]) => [key, await Promise.all(items.map(async item => ({ id: item.id, url: await signMedia(a.admin, run.project_id, item.path), ...(item.note ? { note: item.note } : {}) })))])));
    const reviewPricing: Record<string, number> = {};
    for (const ref of run.state.references || []) reviewPricing[`image:${ref.id}`] = estimateImageGenerationPrice({ model: IMAGE_MODEL, resolution: "1K", inputImageCount: ref.dependsOn.length, prompt: ref.prompt }).customerPoints;
    for (const step of steps || []) if (step.step_key.startsWith("video:") && step.points > 0) reviewPricing[step.step_key.replace(/:v\d+$/, "")] = step.points;
    const musicCost = Number(process.env.SUNO_GENERATION_COST_USD);
    if (sunoConfigured() && Number.isFinite(musicCost) && musicCost > 0) reviewPricing.music = customerQuote(musicCost).customerPoints;
    const visibleRun = { ...run, state: { ...run.state, clips: run.state.clipFiles || {}, ...(run.state.music ? { music: { ...run.state.music, sourceUrl: undefined } } : {}) } };
    return NextResponse.json({ run: visibleRun, steps, reviewPricing, media: { images, output, audio, clips, excerpts, variants } });
  } catch (error) { return fail(error); }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { a, run } = await context(request, params), body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new FilmError("Thao tác chưa hợp lệ.");
    const isReviewAction = reviewActions.includes(body.action);
    const isReviewedUpload = Boolean(run.state.review) && ["attachMusic", "attachTiming"].includes(body.action);
    if (isReviewAction || isReviewedUpload) {
      const key = requestKey(body.idempotencyKey);
      if (!Number.isInteger(body.revision) || body.revision < 0) throw new FilmError("Bài vừa được cập nhật. Tải lại nhé.", 409);
      const receipt = await checked(a.admin.from("battle_rap_review_actions").select("request_id").eq("request_id", key).maybeSingle());
      let change = { state: run.state, phase: run.phase, status: run.status };
      if (!receipt) {
        if (isReviewAction) {
          if (body.action === "approveStage" && body.musicMode === "auto" && (!sunoConfigured() || !(Number(process.env.SUNO_GENERATION_COST_USD) > 0))) throw new FilmError("Dịch vụ nhạc chưa sẵn sàng. Bạn có thể tải bản nhạc lên.", 409);
          try { change = applyReviewAction(run, body); }
          catch (error) { throw new FilmError(error instanceof Error ? error.message : "Chưa áp dụng được lựa chọn.", 409); }
        } else {
          if (!run.state.review || run.state.review.revision !== body.revision) throw new FilmError("Bài vừa được cập nhật. Tải lại nhé.", 409);
          const state = { ...run.state, review: { ...run.state.review, revision: body.revision + 1 } };
          if (body.action === "attachMusic" && run.status === "awaiting_music") {
            const path = String(body.path || "");
            if (!path.startsWith(`${run.project_id}/battle-rap/${run.id}/input/`) || !/\/input\/[0-9a-f-]{36}\.audio$/.test(path)) throw new FilmError("Bản nhạc không thuộc bài này.");
            if (body.srt !== undefined && (typeof body.srt !== "string" || body.srt.length > 150000)) throw new FilmError("Chọn tệp lời SRT hợp lệ.");
            state.music = { path, duration: 0 };
            delete state.rawTiming;
            if (typeof body.srt === "string" && body.srt.trim()) state.rawTiming = body.srt;
            change = { state, phase: "ingest", status: "queued" };
          } else if (body.action === "attachTiming" && run.status === "awaiting_lyrics") {
            if (typeof body.srt !== "string" || !body.srt.trim() || body.srt.length > 150000) throw new FilmError("Chọn tệp lời SRT hợp lệ.");
            state.rawTiming = body.srt;
            change = { state, phase: run.phase, status: "queued" };
          } else throw new FilmError("Thao tác chưa phù hợp với bài.", 409);
        }
      }
      await checked(a.admin.rpc("edit_battle_rap_review", { p_id: run.id, p_project: run.project_id, p_actor: a.user.id, p_workspace: a.project.workspace_version, p_revision: body.revision, p_request: key, p_payload: body, p_state: change.state, p_phase: change.phase, p_status: change.status }));
      return NextResponse.json({ ok: true });
    }
    if (["cancel", "resume", "increase_budget"].includes(body.action)) {
      if (body.action !== "cancel") {
        if (!["failed", "needs_review"].includes(run.status) && !(body.action === "increase_budget" && run.status === "awaiting_review")) throw new FilmError("Chọn phần bạn muốn giữ trước khi làm tiếp.", 409);
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
    const known: Record<string, string> = { BATTLE_BUSY: "Công đoạn đang nhận kết quả. Chờ một chút rồi thử lại nhé.", BATTLE_SUBMISSION_UNCERTAIN: "Cần đối chiếu lần gửi trước khi làm tiếp để tránh tính phí hai lần.", BATTLE_RESUME_INVALID: "Bài này chưa cần làm tiếp.", BATTLE_ACCESS_CHANGED: "Quyền vào kênh đã thay đổi.", BATTLE_REVIEW_STALE: "Bài vừa được cập nhật. Tải lại để chọn trên bản mới nhé.", BATTLE_REVIEW_INVALID: "Lựa chọn chưa hợp lệ. Tải lại bài nhé.", BATTLE_REQUEST_REUSED: "Mã yêu cầu đã được dùng cho thao tác khác. Tải lại bài nhé.", INSUFFICIENT_POINTS: "Chưa đủ điểm để làm tiếp." };
    return fail(known[message] ? new FilmError(known[message], message === "INSUFFICIENT_POINTS" ? 402 : 409) : error);
  }
}
