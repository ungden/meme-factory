import type { VideoRequest } from "@/lib/wavespeed";

export const MULTISCENE_DURATIONS = [5, 10, 15, 30] as const;
export const MULTISCENE_RESOLUTIONS = ["720p", "1080p"] as const;
export const MULTISCENE_FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
export const DEFAULT_SCENE_COUNT = 6;
export const MAX_SCENES = 12;
export const MAX_BATCH_PLANS = 10;

export type SceneInput = {
  id?: string;
  dialogue?: string;
  action?: string;
  setting?: string;
  speakerCharacterId?: string | null;
  characterIds?: string[];
  durationSeconds?: number;
  startImageUrl?: string | null;
  endImageUrl?: string | null;
  followsPrevious?: boolean;
  imagePrompt?: string;
  motionPrompt?: string;
  sourceMode?: "manual" | "ai";
};

export type SceneCast = {
  characterId: string;
  name: string;
  description: string;
  personality: string;
  imageUrl: string;
  referenceImages?: string[];
  assetVersion?: number | null;
  assetVersionId?: string | null;
};

export function isSceneDuration(value: unknown): value is (typeof MULTISCENE_DURATIONS)[number] {
  return MULTISCENE_DURATIONS.includes(Number(value) as (typeof MULTISCENE_DURATIONS)[number]);
}

export function normalizeScene(scene: SceneInput): Required<Omit<SceneInput, "id" | "speakerCharacterId">> & { speakerCharacterId: string | null } {
  return {
    dialogue: typeof scene.dialogue === "string" ? scene.dialogue.trim().slice(0, 700) : "",
    action: typeof scene.action === "string" ? scene.action.trim().slice(0, 900) : "",
    setting: typeof scene.setting === "string" ? scene.setting.trim().slice(0, 700) : "",
    speakerCharacterId: typeof scene.speakerCharacterId === "string" ? scene.speakerCharacterId : null,
    characterIds: Array.isArray(scene.characterIds) ? [...new Set(scene.characterIds.filter((id): id is string => typeof id === "string"))].slice(0, 4) : [],
    durationSeconds: isSceneDuration(scene.durationSeconds) ? scene.durationSeconds : 5,
    startImageUrl: typeof scene.startImageUrl === "string" && scene.startImageUrl ? scene.startImageUrl : null,
    endImageUrl: typeof scene.endImageUrl === "string" && scene.endImageUrl ? scene.endImageUrl : null,
    followsPrevious: scene.followsPrevious === true,
    imagePrompt: typeof scene.imagePrompt === "string" ? scene.imagePrompt.trim().slice(0, 1600) : "",
    motionPrompt: typeof scene.motionPrompt === "string" ? scene.motionPrompt.trim().slice(0, 1600) : "",
    sourceMode: scene.sourceMode === "ai" ? "ai" : "manual",
  };
}

export function buildScenePrompt(scene: Pick<SceneInput, "dialogue" | "action" | "setting">, cast: SceneCast[], speakerId?: string | null) {
  const speaking = cast.find((item) => item.characterId === speakerId);
  const identities = cast.map((item) => `${item.name} [phiên bản đã khoá ${item.assetVersionId ?? "legacy"}]: ${item.description || item.personality || "nhân vật 3D đã duyệt"}`).join("; ");
  return [
    "Video dọc nhân vật 3D điện ảnh. Ảnh chuẩn của cast là nhận diện bắt buộc: giữ chính xác gương mặt, tỷ lệ cơ thể, trang phục, chất liệu và phong cách; không thay nhân vật hoặc trộn nhận diện.",
    identities && `Cast: ${identities}.`,
    scene.setting && `Bối cảnh: ${scene.setting}.`,
    scene.action && `Hành động: ${scene.action}.`,
    speaking ? `${speaking.name} là người nói duy nhất trong cảnh.` : "Không có người nói được chỉ định.",
    scene.dialogue ? `Lời thoại tiếng Việt phải nói trọn câu, tự nhiên, không đổi người nói: “${scene.dialogue}”.` : "Không có lời thoại.",
    "Không thêm chữ trên khung hình, phụ đề cháy, nhạc nền tự phát, nhân vật lạ hoặc lời thoại bổ sung. Giữ khoảng nghỉ diễn xuất tự nhiên.",
  ].filter(Boolean).join(" ");
}

export function sceneVideoRequest(scene: { prompt: string; startImageUrl: string; endImageUrl?: string | null; durationSeconds: number }, resolution: "720p" | "1080p", generateAudio: boolean): VideoRequest {
  if (!isSceneDuration(scene.durationSeconds)) throw new Error("Thời lượng từng cảnh phải là 5, 10, 15 hoặc 30 giây.");
  return {
    mode: "image",
    prompt: scene.prompt,
    image: scene.startImageUrl,
    lastImage: scene.endImageUrl || undefined,
    duration: scene.durationSeconds,
    resolution,
    generateAudio,
  };
}

export function totalSceneDuration(scenes: Array<{ duration_seconds?: number | null; durationSeconds?: number }>) {
  return scenes.reduce((total, scene) => total + Number(scene.duration_seconds ?? scene.durationSeconds ?? 0), 0);
}
