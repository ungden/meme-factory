/**
 * Phần logic của trang Video tách khỏi React để test được: đọc trạng thái một
 * video, câu tóm tắt tuỳ chọn, ai được lồng tiếng, và lỗi hết điểm.
 */
import { SEEDANCE_VARIANTS, seedanceMaxDuration, seedanceVariant, type SeedanceVariant } from "@/lib/video-models";
import { isGeminiTtsModel } from "@/lib/short-film/contracts";

export const DURATIONS = [5, 10, 15, 30] as const;
export const RESOLUTIONS = ["720p", "1080p"] as const;
export const ASPECTS = ["9:16", "1:1", "16:9"] as const;

export type Duration = (typeof DURATIONS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];
export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_LABEL: Record<Aspect, string> = { "9:16": "Dọc 9:16", "1:1": "Vuông 1:1", "16:9": "Ngang 16:9" };

/** Trạng thái một video do `GET /api/content-outputs/[id]/video` trả về. */
export type VideoOutput = {
  id: string;
  status: string;
  format?: string | null;
  media_url?: string | null;
  poster_url?: string | null;
  duration_seconds?: number | null;
  script?: string | null;
  caption?: string | null;
  generation_job_id?: string | null;
};

export type VideoJob = {
  id: string;
  status: string;
  phase: string | null;
  reason: "submission" | "render" | "provider" | "dubbing" | null;
  refundedPoints: number | null;
};

export type VideoStatus = { output: VideoOutput; job: VideoJob | null };

export type VideoView =
  | { state: "working"; title: string; detail: string }
  | { state: "failed"; title: string; detail: string; refundedPoints?: number }
  | { state: "done"; title: string; detail?: string };

const WORKING = ["queued", "running"];
const DONE = ["completed", "approved", "rejected"];

/** Bản nháp hoặc bản hỏng thì làm lại trên chính nó; bản đã có video thì phải mở bài mới, kẻo đè mất video cũ. */
export function canReuseOutput(output: { status?: string } | null | undefined) {
  return !!output && (!output.status || output.status === "draft" || output.status === "failed");
}

export function isWorking(status: VideoStatus | null) {
  if (!status) return false;
  return WORKING.includes(status.output.status) || (!!status.job && WORKING.includes(status.job.status));
}

/** Câu cho thẻ tiến độ. `null` khi chưa có gì để báo (bản nháp chưa bấm làm). */
export function videoView(status: VideoStatus | null): VideoView | null {
  if (!status) return null;
  const { output, job } = status;
  if (isWorking(status))
    return {
      state: "working",
      title: "Đang làm video",
      detail:
        job?.reason === "dubbing"
          ? "Lồng tiếng gặp trục trặc, AIDA đang thử lại."
          : "Thường xong trong vài phút.",
    };
  if (DONE.includes(output.status) && output.media_url) return { state: "done", title: "Video xong rồi" };
  if (output.status === "failed" || job?.status === "failed" || job?.status === "cancelled") {
    const detail =
      job?.reason === "submission"
        ? "Chưa gửi được video đi. Khoản điểm vừa trừ sẽ được kiểm tra và hoàn lại nếu video không về."
        : job?.reason === "render"
          ? "Video đã quay xong nhưng ghép lồng tiếng và logo không thành."
          : "Lần này máy làm video không trả kết quả.";
    return { state: "failed", title: "Video chưa làm được", detail, refundedPoints: job?.refundedPoints ?? undefined };
  }
  return null;
}

export function variantLabel(model: SeedanceVariant) {
  return SEEDANCE_VARIANTS.find((item) => item.id === model)!.customerLabel;
}

/** Một dòng tóm tắt khi "Tuỳ chọn thêm" đang đóng, để biết AIDA sẽ làm gì mà không phải mở ra. */
export function optionsSummary(options: {
  mode: "text" | "image";
  model: SeedanceVariant;
  duration: number;
  resolution: Resolution;
  aspect: Aspect;
  audio: boolean;
}) {
  return [
    `${options.duration} giây`,
    options.mode === "image" ? "khổ theo ảnh mở đầu" : ASPECT_LABEL[options.aspect].toLocaleLowerCase("vi"),
    options.resolution,
    variantLabel(options.model).toLocaleLowerCase("vi"),
    options.audio ? "có lồng tiếng" : "không lồng tiếng",
  ].join(" · ");
}

/** Thời lượng hợp lệ cho mức chất lượng: đổi sang "Tiết kiệm" thì 30 giây tụt về 15. */
export function fitDuration(duration: number, model: SeedanceVariant): Duration {
  const max = seedanceMaxDuration(model);
  const allowed = DURATIONS.filter((value) => value <= max);
  return (allowed.includes(duration as Duration) ? duration : allowed[allowed.length - 1]) as Duration;
}

export type VoiceRow = { character_id: string; model: string; approved_at: string | null; version?: number };

/**
 * Nhân vật nói được trong video: giọng duyệt mới nhất của nhân vật phải là
 * giọng đọc (TTS). Giọng mẫu cho video tự nói không dùng được ở đây — máy chủ
 * cũng chặn y như vậy (`resolveClipDubbing`), nên lọc trước để không bật lồng
 * tiếng rồi mới báo lỗi.
 */
export function speakerIds(voices: VoiceRow[]): Set<string> {
  const latest = new Map<string, VoiceRow>();
  for (const voice of voices) {
    if (!voice.approved_at || voice.model === "seedance-native") continue;
    const current = latest.get(voice.character_id);
    if (!current || (voice.version ?? 0) > (current.version ?? 0)) latest.set(voice.character_id, voice);
  }
  return new Set([...latest.values()].filter((voice) => isGeminiTtsModel(voice.model)).map((voice) => voice.character_id));
}

/** Lỗi hết điểm từ API (402 hoặc mã INSUFFICIENT_POINTS) thành số cho hộp nạp. */
export function insufficientPoints(status: number, body: unknown): { required: number; current: number } | null {
  const value = (body ?? {}) as { code?: unknown; required?: unknown; current?: unknown };
  if (status !== 402 && value.code !== "INSUFFICIENT_POINTS") return null;
  const required = Number(value.required);
  const current = Number(value.current);
  return { required: Number.isFinite(required) ? required : 0, current: Number.isFinite(current) ? current : 0 };
}

export type DraftFields = {
  model: SeedanceVariant;
  prompt: string;
  caption: string;
  opening: { url: string; memeId: string | null } | null;
  references: string[];
  duration: Duration;
  resolution: Resolution;
  aspect: Aspect;
  audio: boolean;
  dialogue: string;
  speaker: string;
};

export const DEFAULT_FIELDS: DraftFields = {
  model: "seedance-2.5",
  prompt: "",
  caption: "",
  opening: null,
  references: [],
  duration: 5,
  resolution: "720p",
  aspect: "9:16",
  // Lồng tiếng cần lời và người nói; bật sẵn thì chưa gõ gì đã bị chặn xem giá.
  audio: false,
  dialogue: "",
  speaker: "",
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Đọc bản nháp đã lưu, kể cả bản của trang cũ (có `mode`, `image` và lồng
 * tiếng bật sẵn). Bản cũ bật lồng tiếng mà chưa có lời thì coi như tắt.
 */
export function parseDraft(draft: Record<string, unknown>): DraftFields {
  const model = seedanceVariant(draft.model);
  const image = text(draft.image) || (draft.opening as { url?: unknown } | null)?.url;
  const opening =
    draft.mode === "image" || draft.opening
      ? typeof image === "string" && image
        ? { url: image, memeId: text((draft.opening as { memeId?: unknown } | null)?.memeId) || null }
        : null
      : null;
  const dialogue = text(draft.dialogue);
  const speaker = text(draft.speaker);
  return {
    model,
    prompt: text(draft.prompt),
    caption: text(draft.caption),
    opening,
    references: Array.isArray(draft.references) ? draft.references.filter((url): url is string => typeof url === "string").slice(0, 9) : [],
    duration: fitDuration(Number(draft.duration) || DEFAULT_FIELDS.duration, model),
    resolution: RESOLUTIONS.includes(draft.resolution as Resolution) ? (draft.resolution as Resolution) : DEFAULT_FIELDS.resolution,
    aspect: ASPECTS.includes(draft.aspect as Aspect) ? (draft.aspect as Aspect) : DEFAULT_FIELDS.aspect,
    audio: draft.audio === true && !!dialogue.trim() && !!speaker,
    dialogue,
    speaker,
  };
}

/** Điền lại form từ một video đã làm (mở từ "Gần đây" rồi bấm Thử lại). */
export function fieldsFromOutput(output: VideoOutput & { source_snapshot?: Record<string, unknown> | null }, base: DraftFields): DraftFields {
  const snapshot = output.source_snapshot ?? {};
  const model = seedanceVariant(snapshot.model);
  const image = text(snapshot.image);
  return {
    ...base,
    model,
    prompt: output.script || base.prompt,
    caption: output.caption || "",
    opening: snapshot.mode === "image" && image ? { url: image, memeId: null } : null,
    references: Array.isArray(snapshot.referenceImages)
      ? snapshot.referenceImages.filter((url): url is string => typeof url === "string").slice(0, 9)
      : [],
    duration: fitDuration(Number(output.duration_seconds) || base.duration, model),
    aspect: ASPECTS.includes(snapshot.aspectRatio as Aspect) ? (snapshot.aspectRatio as Aspect) : base.aspect,
    audio: false,
  };
}
