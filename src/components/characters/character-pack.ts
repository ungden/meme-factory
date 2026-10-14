/**
 * Luật thuần của bộ ảnh nhân vật (cận mặt, toàn thân, sau lưng), dùng chung cho
 * trang Nhân vật và trang chi tiết một nhân vật.
 */

export type PackView = "face" | "body" | "back";
export const PACK_VIEWS: PackView[] = ["face", "body", "back"];
export const PACK_VIEW_LABEL: Record<PackView, string> = { face: "Cận mặt", body: "Toàn thân", back: "Sau lưng" };
export const PACK_VIEW_ROLE: Record<PackView, string> = { face: "identity_face", body: "identity_body", back: "look" };

export type PackCharacter = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  medium: "photoreal" | "animated";
  ready: boolean;
  packComplete: boolean;
  references: Record<string, string>;
  drafts?: Partial<Record<PackView, { path: string; url: string }>>;
};

export type PackStatus = {
  owner: boolean;
  projectId: string;
  workspaceVersion: number;
  pointsPerImage: number;
  profile: { roles?: Array<{ characterId: string }> } | null;
  channel: { audience: string; tone: string; positioning: string };
  characters: PackCharacter[];
};

/**
 * - locked: đã chốt, meme/video/phim lấy bộ này làm mẫu.
 * - review: đủ cận mặt và toàn thân, chờ chủ kênh chốt.
 * - partial: lần vẽ trước dừng giữa chừng (đóng tab, hết điểm), còn thiếu góc.
 * - hasImage: có ảnh đại diện, chưa vẽ góc nào.
 * - empty: chưa có ảnh nào.
 */
export type PackState = "locked" | "review" | "partial" | "hasImage" | "empty";

export function packState(character: PackCharacter): PackState {
  if (character.packComplete || character.ready) return "locked";
  const drafts = character.drafts || {};
  if (drafts.face && drafts.body) return "review";
  if (drafts.face || drafts.body || drafts.back) return "partial";
  return character.avatarUrl ? "hasImage" : "empty";
}

export const PACK_STATE_LABEL: Record<PackState, string> = {
  locked: "Đã chốt",
  review: "Chờ bạn chốt",
  partial: "Vẽ dở",
  hasImage: "Có ảnh",
  empty: "Chưa có ảnh",
};

export function isLocked(character: PackCharacter) {
  return packState(character) === "locked";
}

/**
 * - continue: vẽ tiếp, bỏ qua góc đã có trong kho. Mỗi ảnh đã trả tiền và đã
 *   lưu ở máy chủ, vẽ lại là trả hai lần.
 * - redraw: người dùng chưa ưng gương mặt, vẽ lại ảnh đại diện và cả ba góc.
 * - fromImage: vừa thay ảnh đại diện bằng ảnh của bạn, góc cũ là gương mặt cũ
 *   nên vẽ lại ba góc, không vẽ ảnh đại diện.
 */
export type DrawMode = "continue" | "redraw" | "fromImage";

export function planDraw(character: PackCharacter, mode: DrawMode): { origin: boolean; views: PackView[]; facePath: string } {
  const origin = mode === "redraw" || !character.avatarUrl;
  const drafts = character.drafts || {};
  // Thân và lưng vẽ theo ảnh mặt; mặt phải vẽ lại thì hai góc kia cũng phải theo.
  if (origin || mode === "fromImage" || !drafts.face) return { origin, views: [...PACK_VIEWS], facePath: "" };
  return { origin, views: PACK_VIEWS.filter((view) => !drafts[view]), facePath: drafts.face.path };
}

export function drawCost(character: PackCharacter, mode: DrawMode, pointsPerImage: number) {
  const plan = planDraw(character, mode);
  return ((plan.origin ? 1 : 0) + plan.views.length) * pointsPerImage;
}

/** Nhân vật còn phải vẽ khi bấm "Vẽ tất cả": chưa chốt, chưa chờ chốt. */
export function needsDrawing(character: PackCharacter) {
  const state = packState(character);
  return state === "empty" || state === "hasImage" || state === "partial";
}

/** Lỗi hết điểm từ API: mã máy hoặc câu "không đủ điểm" (giữ nguyên chuỗi mà chuông thông báo dò). */
export function isInsufficientPoints(payload: { code?: unknown; error?: unknown } | null | undefined) {
  if (!payload) return false;
  if (payload.code === "INSUFFICIENT_POINTS") return true;
  return typeof payload.error === "string" && /không đủ điểm/i.test(payload.error);
}
