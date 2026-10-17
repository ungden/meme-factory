import { ROLES, type BattlePhase, type BattleRun, type BattleState, type ReviewStage, type ReviewState } from "./contracts";

export const REVIEW_STAGES: Record<ReviewStage, string> = {
  lyrics: "Chọn lời bài rap", music: "Chọn bản nhạc", storyboard: "Chọn kịch bản hình",
  cast: "Chọn diện mạo nhân vật", stage: "Chọn sân khấu", scenes: "Chọn ảnh cho từng đoạn", clips: "Chọn video cho từng đoạn",
};
const MAX_ATTEMPTS = 20;

export function initReview(): ReviewState {
  return { version: 1, revision: 0, stage: "lyrics", approved: [], attempts: {}, notes: {}, variants: {}, selected: {} };
}

/** Lần đầu giữ mã bước cũ để bài đang làm vẫn tiếp tục được. */
export function attemptKey(state: BattleState, base: string): string {
  const attempt = state.review?.attempts[base] || 0;
  return attempt ? `${base}:v${attempt}` : base;
}

/** Nơi gọi lưu trạng thái này cùng trạng thái chờ chọn bản. */
export function gate(run: BattleRun, stage: ReviewStage): BattleState {
  const state = structuredClone(run.state);
  state.review ||= initReview();
  if (run.status !== "awaiting_review" || state.review.stage !== stage) state.review.revision++;
  state.review.stage = stage;
  return state;
}

export function stageReferenceIds(state: BattleState, stage: ReviewStage): string[] {
  if (stage === "cast") return ROLES.map(role => `cast-${role}`);
  if (stage === "stage") return ["stage"];
  if (stage === "scenes") return (state.blocks || []).map(block => `scene-${block.id}`);
  return [];
}

export function eligibleAssetKeys(state: BattleState, stage: ReviewStage): string[] {
  if (stage === "clips") return (state.blocks || []).map(block => `video:${block.id}`);
  return stageReferenceIds(state, stage).map(id => `image:${id}`);
}

function restoreAsset(state: BattleState, key: string, path: string) {
  if (key.startsWith("image:")) {
    state.images ||= {};
    state.images[key.slice(6)] = path;
  } else if (key.startsWith("video:")) {
    const id = key.slice(6);
    state.clipFiles ||= {};
    state.clips ||= {};
    state.clipFiles[id] = path;
    // Video đã lưu không cần tải lại từ dịch vụ tạo video.
    state.clips[id] = path;
  } else throw new Error("Mục này chưa có bản để chọn.");
}

/** Chỉ giữ tệp đã lưu, tránh URL dịch vụ hết hạn. Bài cũ giữ nguyên cách chạy. */
export function recordVariant(state: BattleState, key: string, path: string): void {
  const review = state.review;
  if (!review) return;
  if (!path.trim()) throw new Error("Chưa lưu được bản này.");
  const id = attemptKey(state, key), note = review.notes[key];
  const variant = { id, path, ...(note ? { note } : {}) };
  const variants = review.variants[key] ||= [];
  const index = variants.findIndex(item => item.id === id);
  if (index < 0) variants.push(variant); else variants[index] = variant;
  review.selected[key] = id;
  restoreAsset(state, key, path);
}

function complete(state: BattleState, stage: ReviewStage) {
  if (stage === "lyrics") return Boolean(state.brief?.suno.lyrics);
  if (stage === "music") return Boolean(state.music?.path && Number.isFinite(state.music.duration) && state.music.duration >= 10 && state.music.duration <= 360);
  if (stage === "storyboard") return Boolean(state.storyboard?.shots.length);
  const keys = eligibleAssetKeys(state, stage);
  return keys.length > 0 && keys.every(key => key.startsWith("image:") ? Boolean(state.images?.[key.slice(6)]) : Boolean(state.clipFiles?.[key.slice(6)]));
}

function feedback(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 1600) throw new Error("Góp ý cần ngắn hơn 1.600 ký tự.");
  return value.trim();
}

function newAttempt(review: ReviewState, key: string, note: string) {
  const next = (review.attempts[key] || 0) + 1;
  if (next > MAX_ATTEMPTS) throw new Error("Mục này đã làm lại 20 lần. Hãy chọn một bản đang có.");
  review.attempts[key] = next;
  review.notes[key] = note;
  delete review.selected[key];
}

export function applyReviewAction(run: BattleRun, body: unknown): { state: BattleState; phase: BattlePhase; status: BattleRun["status"] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Thao tác chưa hợp lệ.");
  const data = body as Record<string, unknown>;
  if (!run.state.review || run.status !== "awaiting_review") throw new Error("Bài chưa tới bước chọn bản. Hãy chờ công đoạn hiện tại xong.");
  if (!Number.isInteger(data.revision) || data.revision !== run.state.review.revision) throw new Error("Bài vừa được cập nhật. Tải lại để chọn bản mới nhất.");
  const state = structuredClone(run.state), review = state.review!, stage = review.stage;
  if (review.approved.includes(stage)) throw new Error("Bước này đã được chốt.");
  let phase = run.phase, status: BattleRun["status"] = "awaiting_review";
  if (data.action === "approveStage") {
    if (!complete(state, stage)) throw new Error("Cần đủ các bản của bước này trước khi làm tiếp.");
    if (data.musicMode !== undefined && (stage !== "lyrics" || !["upload", "auto"].includes(String(data.musicMode)))) throw new Error("Cách nhận bản nhạc chưa hợp lệ.");
    review.approved.push(stage);
    if (stage === "lyrics") review.musicMode = data.musicMode === "upload" ? "upload" : "auto";
    const phases: Record<ReviewStage, BattlePhase> = { lyrics: "music", music: "timing", storyboard: "references", cast: "references", stage: "references", scenes: "excerpts", clips: "render" };
    phase = phases[stage];
    status = stage === "lyrics" && data.musicMode === "upload" ? "awaiting_music" : "queued";
  } else if (data.action === "replaceMusic") {
    if (stage !== "music") throw new Error("Chỉ đổi bản nhạc ở bước chọn nhạc.");
    delete state.music;
    delete state.rawTiming;
    delete state.cues;
    delete state.blocks;
    review.musicMode = "upload";
    phase = "music";
    status = "awaiting_music";
  } else if (data.action === "regenerateText") {
    const key = data.target;
    if (!((stage === "lyrics" && key === "brief") || (stage === "storyboard" && key === "storyboard"))) throw new Error("Chỉ làm lại nội dung ở bước đang chọn.");
    newAttempt(review, key, feedback(data.feedback));
    // Giữ bản cũ làm ngữ cảnh cho góp ý; mã lượt mới buộc máy viết lại đúng mục.
    phase = key === "brief" ? "writing" : "storyboard";
    status = "queued";
  } else if (data.action === "regenerateAsset" || data.action === "selectVariant") {
    const key = data.assetKey;
    if (typeof key !== "string" || !eligibleAssetKeys(state, stage).includes(key)) throw new Error("Chỉ chọn hoặc làm lại mục thuộc bước hiện tại.");
    if (data.action === "selectVariant") {
      const variant = review.variants[key]?.find(item => item.id === data.variantId);
      if (!variant) throw new Error("Không tìm thấy bản đã chọn.");
      restoreAsset(state, key, variant.path);
      review.selected[key] = variant.id;
    } else {
      newAttempt(review, key, feedback(data.feedback));
      if (key.startsWith("image:")) { delete state.images?.[key.slice(6)]; phase = "references"; }
      else { delete state.clipFiles?.[key.slice(6)]; delete state.clips?.[key.slice(6)]; phase = "video"; }
      status = "queued";
    }
  } else throw new Error("Thao tác chọn bản chưa hợp lệ.");
  review.revision++;
  return { state, phase, status };
}
