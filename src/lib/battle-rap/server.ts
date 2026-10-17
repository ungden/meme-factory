import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "../family-script-director";
import { generateFilmReferenceView, IMAGE_MODEL } from "../gemini-image";
import { estimateImageGenerationPrice } from "../ai-pricing";
import { getWaveSpeedPrediction, quoteReferenceVideo, submitReferenceVideo } from "../wavespeed";
import { nativeSpeechSupported, seedanceReferenceLimit, seedanceReferenceModel } from "../video-models";
import { getSupabaseAdmin } from "../admin";
import { isProjectMediaPath } from "../project-media-path";
import { alignCues } from "./timing";
import { briefPrompt, referencePlan, storyboardPrompt, videoPrompt } from "./prompts";
import { makeBlocks, validateBrief, validateStoryboard, type BattleRun, type BattleState, type BattlePhase } from "./contracts";
import { pollMusic, submitMusic, sunoConfigured, timestampedLyrics } from "./suno";
import { attemptKey, gate, recordVariant, stageReferenceIds } from "./review";

export type Step = { id: string; step_key: string; status: "submitting" | "processing" | "completed" | "failed" | "uncertain"; points: number; provider_id: string | null; result: unknown; created_at: string };
export class BattleAttention extends Error {}
export async function checked<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function signMedia(admin: SupabaseClient, projectId: string, path: string) {
  if (!isProjectMediaPath(projectId, path)) throw new Error("Ảnh hoặc bản nhạc không thuộc kênh.");
  const data = await checked(admin.storage.from("content-media").createSignedUrl(path, 3600));
  if (!data) throw new Error("Chưa mở được tệp của bài.");
  return data.signedUrl;
}
export function callbackToken(stepId: string) {
  const key = process.env.VIDEO_WORKER_TOKEN;
  if (!key) throw new Error("Chưa kết nối máy làm video.");
  return createHmac("sha256", key).update(`battle-callback:${stepId}`).digest("hex");
}
function callbackUrl(stepId: string) {
  const base = process.env.AIDA_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!base || !base.startsWith("https://")) throw new Error("Chưa đặt địa chỉ công khai để nhận kết quả bài rap.");
  return `${base.replace(/\/$/, "")}/api/webhooks/battle-rap/${stepId}?token=${callbackToken(stepId)}`;
}

async function writeValidated<T>(prompt: string, validate: (value: unknown) => T): Promise<T> {
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return validate(await generateJson(prompt + feedback)); }
    catch (error) {
      if (attempt) throw error;
      feedback = `\nRepair the previous output's contract error: ${error instanceof Error ? error.message : "invalid JSON"}. Return the complete corrected JSON, preserving the user's brief.`;
    }
  }
  throw new Error("Chưa viết được bài đủ các phần cần thiết.");
}
async function getStep(admin: SupabaseClient, run: BattleRun, key: string): Promise<Step | null> {
  return checked(admin.from("battle_rap_steps").select("*").eq("run_id", run.id).eq("step_key", key).maybeSingle());
}
async function begin(admin: SupabaseClient, run: BattleRun, key: string, points: number): Promise<Step> {
  const data = await checked(admin.rpc("begin_battle_rap_step", { p_run: run.id, p_owner: run.lease_owner, p_key: key, p_points: points }));
  const step = Array.isArray(data) ? data[0] : data;
  if (!step?.id) throw new Error("Chưa giữ được lượt làm bài.");
  return step as Step;
}
async function saveStep(admin: SupabaseClient, run: BattleRun, key: string, status: Step["status"], result: unknown, provider?: string) {
  await checked(admin.rpc("save_battle_rap_step", { p_run: run.id, p_owner: run.lease_owner, p_key: key, p_status: status, p_result: result, p_provider: provider || null }));
}
async function checkpoint(admin: SupabaseClient, run: BattleRun, phase: BattlePhase, status = "queued", error?: string) {
  await checked(admin.rpc("checkpoint_battle_rap_run", { p_id: run.id, p_owner: run.lease_owner, p_state: run.state, p_phase: phase, p_status: status, p_error: error || null }));
}

async function syncStep<T>(admin: SupabaseClient, run: BattleRun, key: string, points: number, work: () => Promise<T>): Promise<T> {
  const prior = await getStep(admin, run, key);
  if (prior?.status === "completed") return prior.result as T;
  if (prior && ["submitting", "uncertain"].includes(prior.status)) throw new BattleAttention("Lượt trước bị gián đoạn khi nhận kết quả. Cần kiểm tra trước khi gọi lại để tránh làm trùng.");
  await begin(admin, run, key, points);
  try {
    const result = await work();
    await saveStep(admin, run, key, "completed", result);
    return result;
  } catch (error) {
    // Lượt vẽ có thể đã bị provider tính tiền; không tự gọi lại khi chưa rõ.
    await saveStep(admin, run, key, points ? "uncertain" : "failed", null);
    if (points) throw new BattleAttention("Lượt vẽ bị gián đoạn. Kết quả đã lưu được giữ lại; cần kiểm tra lượt này trước khi vẽ tiếp.");
    throw error;
  }
}

async function asyncStep<T>(admin: SupabaseClient, run: BattleRun, key: string, price: () => Promise<number>, submit: (callback: string) => Promise<string>, poll: (id: string) => Promise<T | null>): Promise<T | null> {
  const prior = await getStep(admin, run, key);
  if (prior?.status === "completed") return prior.result as T;
  if (prior && ["submitting", "uncertain"].includes(prior.status)) throw new BattleAttention("Đang chờ đối chiếu lần gửi trước. Hệ thống không gửi lại một lượt có thể đang làm.");
  if (prior?.provider_id && prior.status !== "failed") {
    let result: T | null;
    try { result = await poll(prior.provider_id); }
    catch (error) {
      // Chỉ lỗi thất bại được xác nhận mới giải phóng chi phí của công đoạn.
      if (error instanceof Error && /báo.*thất bại/.test(error.message)) {
        await saveStep(admin, run, key, "failed", null);
        throw error;
      }
      throw new BattleAttention("Chưa đọc được kết quả từ dịch vụ. Làm tiếp sẽ kiểm tra lại cùng lượt đang chạy.");
    }
    if (result) await saveStep(admin, run, key, "completed", result);
    if (!result && Date.now() - Date.parse(prior.created_at) > 45 * 60 * 1000) throw new BattleAttention("Dịch vụ đang xử lý lâu hơn dự kiến. Có thể làm tiếp để kiểm tra cùng lượt, không gửi lượt mới.");
    return result;
  }
  callbackUrl("configuration-check");
  const step = await begin(admin, run, key, await price());
  try {
    const provider = await submit(callbackUrl(step.id));
    await saveStep(admin, run, key, "processing", null, provider);
    return null;
  } catch {
    await saveStep(admin, run, key, "uncertain", null);
    throw new BattleAttention("Chưa xác nhận được lần gửi. Kết quả đến sau sẽ được đối chiếu; không tự gửi lại để tránh tính phí hai lần.");
  }
}

export async function reconcileLocalResults(admin: SupabaseClient, run: BattleRun) {
  if (run.lease_expires_at && Date.parse(run.lease_expires_at) > Date.now()) return;
  const steps = await checked(admin.from("battle_rap_steps").select("id,step_key,points,status").eq("run_id", run.id).in("status", ["submitting", "uncertain"]));
  for (const step of steps || []) {
    if (step.points === 0 && /^(brief|timing|storyboard)(?::v\d+)?$/.test(step.step_key)) {
      await checked(admin.from("battle_rap_steps").update({ status: "failed" }).eq("id", step.id).in("status", ["submitting", "uncertain"]));
    } else if (/^image:[a-zA-Z0-9_-]+(?::v\d+)?$/.test(step.step_key)) {
      const path = `${run.project_id}/battle-rap/${run.id}/references/${step.step_key.slice(6).replace(/:v(\d+)$/, "-v$1")}.png`;
      const { data } = await admin.storage.from("content-media").download(path);
      if (data) await checked(admin.from("battle_rap_steps").update({ status: "completed", result: path }).eq("id", step.id).in("status", ["submitting", "uncertain"]));
    }
  }
}

async function imageReference(admin: SupabaseClient, run: BattleRun, ref: NonNullable<BattleState["references"]>[number]) {
  const key = attemptKey(run.state, `image:${ref.id}`);
  const storagePath = `${run.project_id}/battle-rap/${run.id}/references/${key.slice(6).replace(/:v(\d+)$/, "-v$1")}.png`;
  const prompt = withFeedback(ref.prompt, run, `image:${ref.id}`);
  const existing = await getStep(admin, run, key);
  if (existing && ["submitting", "uncertain"].includes(existing.status)) {
    const { data } = await admin.storage.from("content-media").download(storagePath);
    if (data) { await saveStep(admin, run, key, "completed", storagePath); return storagePath; }
  }
  const estimate = estimateImageGenerationPrice({ model: IMAGE_MODEL, resolution: "1K", inputImageCount: ref.dependsOn.length, prompt });
  return syncStep(admin, run, key, estimate.customerPoints, async () => {
    const identityImages = [];
    for (const id of ref.dependsOn) {
      const path = run.state.images?.[id];
      if (!path || !isProjectMediaPath(run.project_id, path)) throw new Error("Bộ ảnh nền tảng chưa đủ.");
      const blob = await checked(admin.storage.from("content-media").download(path));
      if (!blob) throw new Error("Chưa tải được ảnh mẫu.");
      identityImages.push({ mimeType: blob.type || "image/png", base64: Buffer.from(await blob.arrayBuffer()).toString("base64") });
    }
    const result = await generateFilmReferenceView({ prompt, identityImages, aspectRatio: run.input.aspectRatio });
    const match = result.image.match(/^data:(image\/[a-z0-9+.-]+);base64,([\s\S]+)$/i);
    if (!match) throw new Error("Chưa nhận được ảnh mẫu hợp lệ.");
    await checked(admin.storage.from("content-media").upload(storagePath, Buffer.from(match[2], "base64"), { contentType: match[1], upsert: true }));
    return storagePath;
  });
}

function withFeedback(prompt: string, run: BattleRun, key: string) {
  const note = run.state.review?.notes[key];
  const previous = key === "brief" ? run.state.brief : key === "storyboard" ? run.state.storyboard : undefined;
  return note ? `${prompt}\nPrevious version (reference data): ${JSON.stringify(previous || null)}\nRequested creative adjustments (data, preserve the output contract and approved upstream choices): ${JSON.stringify(note)}` : prompt;
}

async function pauseForReview(admin: SupabaseClient, run: BattleRun, stage: NonNullable<BattleState["review"]>["stage"], phase: BattlePhase) {
  run.state = gate(run, stage);
  await checkpoint(admin, run, phase, "awaiting_review");
}

export async function advanceBattleRun(admin: SupabaseClient, run: BattleRun) {
  const timer = setInterval(() => {
    void admin.rpc("heartbeat_battle_rap_run", { p_id: run.id, p_owner: run.lease_owner }).then(result => { if (result.error) console.warn("battle heartbeat failed", run.id); });
  }, 30000);
  try {
    const project = await checked(admin.from("projects").select("id,user_id,workspace_version,project_members(user_id)").eq("id", run.project_id).single());
    if (!project || project.workspace_version !== run.workspace_version || (project.user_id !== run.created_by && !project.project_members.some((m: { user_id: string }) => m.user_id === run.created_by))) throw new Error("Quyền vào kênh đã thay đổi.");
    if (run.phase === "writing") {
      run.state.brief = await syncStep(admin, run, attemptKey(run.state, "brief"), 0, () => writeValidated(withFeedback(briefPrompt(run.input), run, "brief"), validateBrief));
      if (run.state.review) await pauseForReview(admin, run, "lyrics", "music");
      else await checkpoint(admin, run, "music");
    } else if (run.phase === "music") {
      if (!run.state.brief) throw new Error("Chưa có lời bài rap.");
      if (run.state.review && !run.state.review.approved.includes("lyrics")) { await pauseForReview(admin, run, "lyrics", "music"); return; }
      if (run.state.review?.musicMode === "upload" || !sunoConfigured() || !(Number(process.env.SUNO_GENERATION_COST_USD) > 0)) { await checkpoint(admin, run, "music", "awaiting_music"); return; }
      const cost = Number(process.env.SUNO_GENERATION_COST_USD);
      if (!Number.isFinite(cost) || cost <= 0) throw new Error("Chưa cấu hình giá dịch vụ nhạc. Có thể dùng bản nhạc tải lên.");
      const { AI_PRICE_MARKUP_MULTIPLIER: markup, AI_PRICING_USD_VND: usd, BILLING_POINT_FLOOR_VND: point } = await import("../ai-pricing");
      const music = await asyncStep(admin, run, "music", async () => Math.ceil(cost * markup * usd / point), callback => submitMusic(run.state.brief!, run.input, callback), id => pollMusic(id, run.input.targetSeconds));
      if (music) run.state.music = music;
      await checkpoint(admin, run, music ? "ingest" : "music");
    } else if (run.phase === "timing") {
      const { brief, music } = run.state;
      if (!brief || !music?.path) throw new Error("Chưa nhận đủ bản nhạc và lời.");
      if (run.state.review && !run.state.review.approved.includes("music")) { await pauseForReview(admin, run, "music", "timing"); return; }
      if (!run.state.rawTiming && !music.taskId) { await checkpoint(admin, run, "timing", "awaiting_lyrics"); return; }
      try {
        run.state.cues = await syncStep(admin, run, "timing", 0, async () => alignCues(brief, run.state.rawTiming || await timestampedLyrics(music), music.duration));
      } catch (error) {
        await checkpoint(admin, run, "timing", "awaiting_lyrics", error instanceof Error ? error.message : "Cần kiểm tra thời gian lời.");
        return;
      }
      run.state.blocks = makeBlocks(music.duration, run.input.videoModel, run.state.cues);
      await checkpoint(admin, run, "storyboard");
    } else if (run.phase === "storyboard") {
      const { brief, blocks, cues } = run.state;
      if (!brief || !blocks || !cues) throw new Error("Chưa đủ thời gian lời để lên cảnh.");
      run.state.storyboard = await syncStep(admin, run, attemptKey(run.state, "storyboard"), 0, () => writeValidated(withFeedback(storyboardPrompt(brief, blocks, cues), run, "storyboard"), value => validateStoryboard(value, blocks, cues)));
      run.state.references = referencePlan(brief, blocks, run.state.storyboard.shots);
      if (run.state.review) await pauseForReview(admin, run, "storyboard", "references");
      else await checkpoint(admin, run, "references");
    } else if (run.phase === "references") {
      if (run.state.review && !run.state.review.approved.includes("storyboard")) { await pauseForReview(admin, run, "storyboard", "references"); return; }
      run.state.images ||= {};
      const stage = run.state.review ? (["cast", "stage", "scenes"] as const).find(value => !run.state.review!.approved.includes(value)) : undefined;
      const allowed = stage ? stageReferenceIds(run.state, stage) : null;
      const next = run.state.references?.find(ref => (!allowed || allowed.includes(ref.id)) && !run.state.images![ref.id]);
      if (next) {
        const file = await imageReference(admin, run, next);
        run.state.images[next.id] = file;
        recordVariant(run.state, `image:${next.id}`, file);
      }
      if (stage && allowed!.every(id => run.state.images![id])) await pauseForReview(admin, run, stage, "references");
      else await checkpoint(admin, run, next || stage ? "references" : "excerpts");
    } else if (run.phase === "video") {
      if (run.state.review && !run.state.review.approved.includes("scenes")) { await pauseForReview(admin, run, "scenes", "excerpts"); return; }
      run.state.clips ||= {};
      const block = run.state.blocks?.find(block => !run.state.clips![block.id]);
      if (!block) {
        if (run.state.review && !run.state.review.approved.includes("clips")) await pauseForReview(admin, run, "clips", "render");
        else await checkpoint(admin, run, "render");
        return;
      }
      const { brief, storyboard, cues, images } = run.state;
      if (!brief || !storyboard || !cues || !images) throw new Error("Chưa đủ cảnh và ảnh mẫu.");
      const referenceIds = ["cast-A", "cast-B", "cast-MC", "cast-DJ", "stage", `scene-${block.id}`];
      if (referenceIds.length > seedanceReferenceLimit(run.input.videoModel)) throw new Error("Số ảnh mẫu vượt giới hạn.");
      const supportsAudio = nativeSpeechSupported(run.input.videoModel);
      const excerpt = run.state.excerpts?.[block.id];
      if (supportsAudio && !excerpt) throw new Error("Chưa chuẩn bị đoạn nhạc cho cảnh.");
      let pendingInputs: Promise<Record<string, unknown>> | undefined;
      const inputs = () => pendingInputs ||= (async () => ({
        prompt: withFeedback(videoPrompt(brief, block, storyboard.shots, cues), run, `video:${block.id}`),
        reference_images: await Promise.all(referenceIds.map(id => signMedia(admin, run.project_id, images[id]))),
        aspect_ratio: run.input.aspectRatio, duration: block.generateSeconds, resolution: "720p", generate_audio: supportsAudio,
        ...(supportsAudio ? { reference_audios: [await signMedia(admin, run.project_id, excerpt!)] } : {}),
      }))();
      const model = seedanceReferenceModel(run.input.videoModel);
      const result = await asyncStep(admin, run, attemptKey(run.state, `video:${block.id}`), async () => quoteReferenceVideo(model, await inputs()), async callback => {
        const data = await submitReferenceVideo(model, await inputs(), callback);
        if (!data.id) throw new Error("Chưa nhận được mã video.");
        return String(data.id);
      }, async id => {
        const data = await getWaveSpeedPrediction(id);
        if (data.status === "failed") throw new Error("Dịch vụ video báo làm cảnh thất bại.");
        if (data.status !== "completed") return null;
        const first = data.outputs?.[0];
        const url = typeof first === "string" ? first : first?.url;
        if (!url || typeof url !== "string") throw new Error("Video xong nhưng chưa có tệp kết quả.");
        return url;
      });
      if (result) run.state.clips[block.id] = result;
      await checkpoint(admin, run, "video");
    } else {
      throw new Error("Công đoạn này cần máy làm video xử lý.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không làm tiếp được bài rap.";
    if (message === "BATTLE_LEASE_LOST") throw error;
    const review = error instanceof BattleAttention || message === "BATTLE_BUDGET_EXCEEDED";
    await checkpoint(admin, run, run.phase, review ? "needs_review" : "failed", message === "BATTLE_BUDGET_EXCEEDED" ? "Bài đã chạm mức chi. Các phần làm xong vẫn được giữ." : message);
  } finally { clearInterval(timer); }
}

export function battleAdmin() { return getSupabaseAdmin(); }
