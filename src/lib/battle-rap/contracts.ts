import { seedanceMaxDuration, type SeedanceVariant } from "../video-models";

export const BATTLE_VERSION = "free-battle-rap-v1";
export const ROLES = ["A", "B", "MC", "DJ"] as const;
export type Role = (typeof ROLES)[number];
export type Speaker = Role | "crowd";
export type BattleInput = {
  idea: string;
  language: "vi" | "en";
  targetSeconds: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  videoModel: SeedanceVariant;
  overrides: { A: string; B: string; MC: string; DJ: string; stage: string; music: string; visual: string };
};
export type BattleLine = { id: string; speaker: Speaker; text: string };
export type BattleBrief = {
  version: typeof BATTLE_VERSION;
  concept: string;
  conflict: string;
  suno: { title: string; lyrics: string; style: string };
  sections: { id: string; tag: string; lines: BattleLine[] }[];
  cast: { role: Role; name: string; identity: string; personality: string; voice: string }[];
  stage: { description: string; layout: string; lighting: string; crowd: string; visualStyle: string };
};
export type Cue = { start: number; end: number; text: string; speaker: Speaker; lineId: string };
export type Block = { id: string; start: number; end: number; generateSeconds: number };
export type Shot = {
  id: string; blockId: string; start: number; end: number;
  type: "wide" | "performance" | "opponent" | "crowd" | "dj" | "mc";
  performer: Speaker | "none"; cast: Role[]; cueIds: string[];
  camera: string; action: string; continuity: string; description: string;
};
export type Storyboard = { shots: Shot[] };
export type Reference = { id: string; prompt: string; dependsOn: string[] };
export type Music = { sourceUrl?: string; path?: string; duration: number; taskId?: string; audioId?: string };
export type ReviewStage = "lyrics" | "music" | "storyboard" | "cast" | "stage" | "scenes" | "clips";
export type ReviewState = {
  version: 1;
  revision: number;
  stage: ReviewStage;
  approved: ReviewStage[];
  attempts: Record<string, number>;
  notes: Record<string, string>;
  variants: Record<string, { id: string; path: string; note?: string }[]>;
  selected: Record<string, string>;
  musicMode?: "upload" | "auto";
};
export type BattleState = {
  review?: ReviewState;
  brief?: BattleBrief;
  music?: Music;
  rawTiming?: unknown;
  cues?: Cue[];
  blocks?: Block[];
  storyboard?: Storyboard;
  references?: Reference[];
  images?: Record<string, string>;
  clips?: Record<string, string>;
  clipFiles?: Record<string, string>;
  uploads?: Record<string, unknown>;
  excerpts?: Record<string, string>;
  output?: { video: string; subtitles: string; plan: string; duration: number };
};
export type BattlePhase = "writing" | "music" | "ingest" | "timing" | "storyboard" | "references" | "excerpts" | "video" | "render" | "done";
export type BattleRun = {
  id: string; project_id: string; workspace_version: number; created_by: string;
  input: BattleInput; state: BattleState; phase: BattlePhase;
  status: "queued" | "running" | "awaiting_music" | "awaiting_lyrics" | "awaiting_review" | "needs_review" | "failed" | "cancelled" | "completed";
  budget_points: number; points_used: number; refunded_points: number;
  error: string | null; lease_owner: string | null; lease_expires_at: string | null;
  created_at: string; updated_at: string;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Nội dung trả về không đúng cấu trúc.");
  return value as Record<string, unknown>;
}
function required(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Nội dung còn thiếu hoặc quá dài.");
  return value.trim();
}
export function normalizeInput(value: unknown): BattleInput {
  const data = object(value);
  const extra = data.overrides ? object(data.overrides) : {};
  const overrides = Object.fromEntries(["A", "B", "MC", "DJ", "stage", "music", "visual"].map(key => [key, String(extra[key] || "").trim().slice(0, 1600)])) as BattleInput["overrides"];
  const seconds = Number(data.targetSeconds ?? 100);
  if (!Number.isFinite(seconds) || seconds < 45 || seconds > 180) throw new Error("Chọn thời lượng từ 45 đến 180 giây.");
  return {
    idea: required(data.idea, 4000), language: data.language === "en" ? "en" : "vi",
    targetSeconds: Math.round(seconds), overrides,
    videoModel: data.videoModel === "seedance-2.5" ? "seedance-2.5" : "seedance-2.0-fast",
    aspectRatio: data.aspectRatio === "16:9" || data.aspectRatio === "1:1" ? data.aspectRatio : "9:16",
  };
}
export function sunoLyrics(sections: BattleBrief["sections"]) {
  return sections.map(section => `[${section.tag}]\n${section.lines.map(line => line.text).join("\n")}`).join("\n\n");
}
export function validateBrief(value: unknown): BattleBrief {
  const data = object(value);
  const rawCast = data.cast;
  if (!Array.isArray(rawCast) || rawCast.length !== 4) throw new Error("Cần đủ hai rapper, người dẫn và người chơi nhạc.");
  const cast = rawCast.map(item => {
    const c = object(item);
    if (!ROLES.includes(c.role as Role)) throw new Error("Vai nhân vật không hợp lệ.");
    return { role: c.role as Role, name: required(c.name, 100), identity: required(c.identity, 2000), personality: required(c.personality, 800), voice: required(c.voice, 500) };
  });
  if (new Set(cast.map(c => c.role)).size !== 4) throw new Error("Các vai nhân vật bị trùng.");
  if (!Array.isArray(data.sections) || data.sections.length < 5 || data.sections.length > 14) throw new Error("Cần các lượt rap đối đáp và phần dẫn.");
  const ids = new Set<string>();
  const sections = data.sections.map((item, index) => {
    const s = object(item);
    const tag = required(s.tag, 220);
    if (/[\[\]\n\r]|[À-ỹ]/u.test(tag)) throw new Error("Nhãn biểu diễn cần viết bằng tiếng Anh.");
    if (!Array.isArray(s.lines) || !s.lines.length || s.lines.length > 16) throw new Error("Lượt rap chưa có lời hợp lệ.");
    const lines = s.lines.map(item => {
      const l = object(item), id = required(l.id, 60);
      if (ids.has(id) || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Mã câu rap bị trùng hoặc không hợp lệ.");
      ids.add(id);
      if (![...ROLES, "crowd"].includes(l.speaker as Speaker)) throw new Error("Chưa xác định người rap.");
      const text = required(l.text, 240);
      if (/[\[\]\n\r]/.test(text)) throw new Error("Lời rap không được lẫn chỉ dẫn biểu diễn.");
      return { id, speaker: l.speaker as Speaker, text };
    });
    if (new Set(lines.map(l => l.speaker)).size !== 1) throw new Error("Mỗi đoạn nhạc cần xác định một người rap.");
    return { id: `section-${index + 1}`, tag, lines };
  });
  const counts = ROLES.slice(0, 2).map(role => sections.filter(s => s.lines[0].speaker === role).length);
  if (counts.some(n => n < 2)) throw new Error("Mỗi rapper cần ít nhất hai lượt để phản đòn.");
  const words = ["A", "B"].map(role => sections.flatMap(s => s.lines).filter(l => l.speaker === role).reduce((n, l) => n + l.text.split(/\s+/).length, 0));
  if (Math.min(...words) / Math.max(...words) < 0.55) throw new Error("Thời lượng hai rapper chưa cân bằng.");
  const suno = object(data.suno), stage = object(data.stage);
  const lyrics = sunoLyrics(sections);
  if (lyrics.length > 5000) throw new Error("Lời bài vượt giới hạn dịch vụ nhạc.");
  return { version: BATTLE_VERSION, concept: required(data.concept, 1600), conflict: required(data.conflict, 1000),
    suno: { title: required(suno.title, 80), style: required(suno.style, 1000), lyrics }, sections, cast,
    stage: { description: required(stage.description, 1800), layout: required(stage.layout, 1000), lighting: required(stage.lighting, 600), crowd: required(stage.crowd, 1000), visualStyle: required(stage.visualStyle, 800) } };
}

export function makeBlocks(duration: number, model: SeedanceVariant, cues: Cue[]): Block[] {
  if (!Number.isFinite(duration) || duration < 10 || duration > 360) throw new Error("Bản nhạc cần dài từ 10 đến 360 giây.");
  const max = seedanceMaxDuration(model), blocks: Block[] = [];
  let start = 0;
  while (start < duration - 0.001) {
    const ceiling = Math.min(duration, start + max);
    const candidates = cues.map(c => Math.ceil(c.end * 30) / 30).filter(end => end >= start + max - 3 && end <= ceiling);
    const end = ceiling === duration ? duration : candidates.length ? Math.max(...candidates) : ceiling;
    blocks.push({ id: `block-${blocks.length + 1}`, start, end, generateSeconds: Math.max(4, Math.ceil(end - start)) });
    start = end;
  }
  return blocks;
}
export function validateStoryboard(value: unknown, blocks: Block[], cues: Cue[]): Storyboard {
  const data = object(value);
  if (!Array.isArray(data.shots) || data.shots.length > 100) throw new Error("Danh sách cảnh không hợp lệ.");
  const cueIds = new Set(cues.map(c => c.lineId)), ids = new Set<string>();
  const shots = data.shots.map(item => {
    const s = object(item), id = required(s.id, 80), blockId = required(s.blockId, 80);
    const block = blocks.find(b => b.id === blockId);
    const start = Number(s.start), end = Number(s.end);
    if (ids.has(id) || !block || !Number.isFinite(start) || !Number.isFinite(end) || start < block.start - 0.02 || end > block.end + 0.02 || end <= start) throw new Error("Mốc thời gian cảnh chưa khớp bản nhạc.");
    ids.add(id);
    if (!["wide", "performance", "opponent", "crowd", "dj", "mc"].includes(String(s.type))) throw new Error("Loại cảnh chưa hợp lệ.");
    if (![...ROLES, "crowd", "none"].includes(s.performer as Speaker)) throw new Error("Người biểu diễn chưa hợp lệ.");
    if (!Array.isArray(s.cast) || !s.cast.every(r => ROLES.includes(r as Role))) throw new Error("Nhân vật trong cảnh chưa hợp lệ.");
    if (!Array.isArray(s.cueIds) || !s.cueIds.every(id => cueIds.has(String(id)))) throw new Error("Cảnh tham chiếu câu rap không tồn tại.");
    if (s.type === "performance") {
      if (!(s.cast as Role[]).includes(s.performer as Role)) throw new Error("Cận cảnh thiếu người đang rap.");
      const active = cues.filter(c => c.end > start + 0.05 && c.start < end - 0.05);
      if (active.some(c => c.speaker !== s.performer)) throw new Error("Cận cảnh đi qua thời điểm đổi người rap.");
    }
    return { id, blockId, start, end, type: s.type as Shot["type"], performer: s.performer as Shot["performer"], cast: s.cast as Role[], cueIds: s.cueIds as string[], camera: required(s.camera, 700), action: required(s.action, 1200), continuity: required(s.continuity, 700), description: required(s.description, 700) };
  }).sort((a, b) => a.start - b.start);
  for (const block of blocks) {
    const list = shots.filter(s => s.blockId === block.id);
    let cursor = block.start;
    for (const shot of list) {
      if (Math.abs(shot.start - cursor) > 0.05) throw new Error("Còn khoảng trống hoặc chồng cảnh trong bài.");
      cursor = shot.end;
    }
    if (!list.length || Math.abs(cursor - block.end) > 0.05) throw new Error("Kịch bản hình chưa phủ hết bài nhạc.");
  }
  for (const type of ["wide", "crowd", "dj", "mc", "opponent"])
    if (!shots.some(s => s.type === type)) throw new Error("Cần đủ sân khấu, khán giả, người dẫn, bàn nhạc và phản ứng đối thủ.");
  return { shots };
}

export const PHASE_LABELS: Record<BattlePhase, string> = {
  writing: "Đang viết lời đối đáp", music: "Đang làm nhạc", ingest: "Đang nhận bản nhạc",
  timing: "Đang căn lời theo nhạc", storyboard: "Đang lên cảnh cho cả bài",
  references: "Đang vẽ sân khấu và nhân vật", excerpts: "Đang chia đoạn nhạc",
  video: "Đang làm các cảnh biểu diễn", render: "Đang ghép bài và thêm lời", done: "Bài đã xong",
};
