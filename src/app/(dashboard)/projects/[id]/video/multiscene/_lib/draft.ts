/**
 * Kiểu dữ liệu bản nháp, bộ chuyển đổi, nhãn hiển thị và client API của màn
 * phim ngắn. Tách khỏi page.tsx để chúng kiểm thử được: page.tsx là một
 * component 2800 dòng, nên mọi logic thuần nằm trong đó đều không ai test nổi.
 */
import type { FilmStoryboard } from "@/lib/film-storyboard";
import type { PerformanceDirection } from "@/lib/performance-direction";
import type { Story } from "@/lib/family-catalogue";
import type {
  FilmPlan,
  FilmScene,
} from "@/lib/short-film/contracts";
import {
  seedanceReferenceModel,
  type FilmVideoModel,
} from "@/lib/video-models";

export type DraftScene = {
  storyboard?: FilmStoryboard | null;
  performanceDirection?: PerformanceDirection | null;
  id?: string;
  characterIds: string[];
  speakerCharacterId: string | null;
  dialogue: string;
  action: string;
  setting: string;
  camera: string;
  imagePrompt: string;
  motionPrompt: string;
  durationSeconds: number;
  startImageUrl: string | null;
  endImageUrl: string | null;
};
export type DraftGuest = {
  key: string;
  name: string;
  description: string;
};
export type Draft = {
  story?: Story | null;
  trimSpeech?: boolean;
  title: string;
  brief: string;
  caption: string;
  targetDurationSeconds: number;
  format: string;
  resolution: string;
  videoModel: FilmVideoModel;
  audioMode: "native" | "fixed" | "dubbed";
  subtitles: boolean;
  guests: DraftGuest[];
  scenes: DraftScene[];
};
export type Quote = {
  id: string;
  points: number;
  expires_at: string;
  items: { kind: string; points: number; sceneId?: string }[];
};
export type ProductionRun = {
  id: string;
  plan_id: string | null;
  source: "manual" | "scheduled";
  status: string;
  phase: string;
  points_committed: number;
  max_points_per_film: number;
  error: string | null;
  created_at: string;
};
export const blank = (): Draft => ({
  trimSpeech: true,
  title: "Phim ngắn",
  brief: "",
  caption: "",
  targetDurationSeconds: 30,
  format: "16:9",
  resolution: "720p",
  videoModel: seedanceReferenceModel(null),
  audioMode: "dubbed",
  subtitles: true,
  guests: [],
  scenes: [],
});
export const sceneBlank = (): DraftScene => ({
  characterIds: [],
  speakerCharacterId: null,
  dialogue: "",
  action: "",
  setting: "",
  camera: "",
  imagePrompt: "",
  motionPrompt: "",
  durationSeconds: 15,
  startImageUrl: null,
  endImageUrl: null,
});
export const fromScene = (s: FilmScene): DraftScene => ({
  id: s.id,
  storyboard: s.storyboard,
  performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
  characterIds: s.cast_snapshot.map((c) => c.characterId),
  speakerCharacterId: s.speaker_character_id,
  dialogue: s.dialogue,
  action: s.action,
  setting: s.setting,
  camera: s.camera,
  imagePrompt: s.image_prompt,
  motionPrompt: s.motion_prompt,
  durationSeconds: s.duration_seconds,
  startImageUrl: s.start_image_url,
  endImageUrl: s.end_image_url,
});
export const fromPlan = (p: FilmPlan): Draft => ({
  title: p.title,
  brief: p.brief,
  caption: p.caption,
  story: p.story,
  trimSpeech: p.trim_speech !== false,
  targetDurationSeconds: p.target_duration_seconds || 30,
  format: p.format,
  resolution: p.resolution,
  videoModel: seedanceReferenceModel(p.video_model),
  audioMode: p.audio_mode === "native" ? "dubbed" : p.audio_mode,
  subtitles: p.subtitles,
  guests: (p.cast_snapshot || [])
    .filter((c) => c.isGuest)
    .map((c) => ({
      key: c.guestKey || c.characterId,
      name: c.name,
      description: c.description || "",
    })),
  scenes: p.video_plan_scenes.map(fromScene),
});
export const labels: Record<string, string> = {
  image: "Ảnh tham chiếu",
  frame: "Khung nối tiếp",
  voice_design: "Thiết kế giọng",
  tts: "Giọng nói",
  video: "Chuyển động",
  lip_sync: "Đồng bộ môi",
  dub: "Lồng tiếng",
  transcribe: "Kiểm tra lời",
  render: "Phim hoàn chỉnh",
};
export const phaseLabels: Record<string, string> = {
  script: "Viết kịch bản",
  script_check: "Kiểm tra kịch bản",
  prepare: "Chuẩn bị hình và tiếng",
  frame: "Lấy khung nối tiếp",
  video: "Tạo chuyển động",
  finish: "Lồng tiếng và hoàn thiện cảnh",
  transcript: "Kiểm tra lời",
  clip_check: "Kiểm tra cảnh",
  render: "Ghép phim",
  ready_review: "Sẵn sàng duyệt",
  // Các pha kiểm tra phải khai báo thẳng. Suy ra bằng `"Kiểm tra " + labels[kind]`
  // hỏng khi nhãn gốc đã là một cụm động từ: transcribe = "Kiểm tra lời" cho ra
  // "Kiểm tra kiểm tra lời".
  image_check: "Kiểm tra ảnh tham chiếu",
  tts_check: "Kiểm tra giọng nói",
  video_check: "Kiểm tra chuyển động",
  dub_check: "Kiểm tra lồng tiếng",
  lip_sync_check: "Kiểm tra đồng bộ môi",
  transcribe_check: "Kiểm tra lời thoại",
  render_check: "Kiểm tra bản ghép",
  voice_design_check: "Kiểm tra giọng thiết kế",
  frame_check: "Kiểm tra khung nối tiếp",
};
export function displayPhase(phase: string) {
  return phaseLabels[phase] || "Đang hoàn thiện";
}
export const statusLabels: Record<string, string> = {
  queued: "Đã nhận",
  // Thiếu mục này thì header lượt chạy nói "Đang xử lý" trong khi thẻ công đoạn
  // của cùng trạng thái lại nói "Đang đối soát".
  reconciling: "Đang đối soát",
  scripting: "Đang viết kịch bản",
  running: "Đang sản xuất",
  paused: "Đã tạm dừng",
  budget_blocked: "Cần cập nhật hạn mức",
  needs_review: "Cần xem lại",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};
export type EpisodePickerStatus = "draft" | "running" | "ready" | "failed";
export function episodePickerStatus(plan: FilmPlan): EpisodePickerStatus {
  if (
    plan.has_video ||
    plan.latest_content_output_id ||
    plan.video_output_count ||
    plan.video_status === "ready"
  )
    return "ready";
  if (plan.video_status === "failed" || ["failed", "cancelled"].includes(plan.status))
    return "failed";
  if (
    plan.video_status === "running" ||
    ["queued", "scripting", "running", "paused"].includes(plan.status)
  )
    return "running";
  return "draft";
}
export function episodeHasHistory(plan: FilmPlan) {
  return Boolean(
    plan.has_production_history ||
      plan.has_video ||
      plan.latest_content_output_id ||
      plan.video_output_count ||
      plan.video_status === "ready",
  );
}
export const episodePickerLabels: Record<EpisodePickerStatus, string> = {
  draft: "Chưa có video",
  running: "Đang sản xuất",
  ready: "Đã có video",
  failed: "Cần xem lại",
};
export const episodePickerClasses: Record<EpisodePickerStatus, string> = {
  // Literal Tailwind chỉ có bản sáng sẽ loè lên thành khối chói trong dark
  // mode; dùng token theo chủ đề như phần còn lại của studio.
  draft: "th-bg-tertiary th-text-secondary",
  running: "th-bg-accent-light th-text-accent",
  ready: "th-bg-success-light th-text-success",
  failed: "th-bg-danger-light th-text-danger",
};
export async function api(url: string, body?: unknown, method = "POST") {
  const r = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const raw = await r.text();
  const j = raw ? JSON.parse(raw) : {};
  if (!r.ok)
    throw new Error(j.error || "Không kết nối được. Nội dung vẫn được giữ.");
  return j;
}
