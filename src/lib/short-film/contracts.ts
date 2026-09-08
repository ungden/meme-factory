export const FILM_MODELS = {
  image: "gemini-3.1-flash-image",
  tts: "minimax/speech-2.6-hd",
  video: "bytedance/seedance-2.5/image-to-video",
  lip_sync: "sync/lipsync-2-pro",
  transcribe: "wavespeed-ai/openai-whisper-with-video",
} as const;
export const VOICES = [
  "Wise_Woman",
  "Friendly_Person",
  "Inspirational_girl",
  "Deep_Voice_Man",
  "Calm_Woman",
  "Casual_Guy",
  "Lively_Girl",
  "Patient_Man",
  "Young_Knight",
  "Determined_Man",
  "Lovely_Girl",
  "Decent_Boy",
  "Sweet_Girl_2",
  "Exuberant_Girl",
] as const;
export type FilmKind =
  "image" | "tts" | "video" | "lip_sync" | "transcribe" | "render" | "frame";
export type FilmScene = {
  id: string;
  version: number;
  scene_index: number;
  dialogue: string;
  action: string;
  setting: string;
  camera: string;
  image_prompt: string;
  motion_prompt: string;
  duration_seconds: number;
  speaker_character_id: string | null;
  cast_snapshot: FilmCast[];
  start_image_url: string | null;
  end_image_url: string | null;
  follows_previous: boolean;
  input_hash: string;
  media_links: Partial<Record<FilmKind, string>>;
  deleted_at: string | null;
};
export type FilmCast = {
  characterId: string;
  name: string;
  description: string;
  personality: string;
  imageUrl: string;
  referenceImages: string[];
  assetVersionId: string;
  assetVersion: number;
  voice?: {
    id: string;
    voice_id: string;
    model: string;
    settings: Record<string, unknown>;
  };
};
export type FilmPlan = {
  id: string;
  project_id: string;
  workspace_version: number;
  version: number;
  title: string;
  brief: string;
  caption: string;
  format: string;
  resolution: "720p" | "1080p";
  audio_mode: "native" | "fixed";
  subtitles: boolean;
  status: string;
  target_duration_seconds: number;
  cast_snapshot: FilmCast[];
  video_plan_scenes: FilmScene[];
};
export type FilmTask = {
  id: string;
  kind: FilmKind;
  scene_id: string | null;
  scene_version: number | null;
  displayName?: string;
  plan_version: number;
  status: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  approved_at: string | null;
  url?: string;
  posterUrl?: string;
  srtUrl?: string;
  created_at: string;
};
export type QuotedTask = {
  id: string;
  sceneId?: string;
  sceneVersion?: number;
  kind: FilmKind;
  input: Record<string, unknown>;
  dependencies: string[];
  points: number;
  hash: string;
};
export function shotDuration(audioSeconds: number, requested: number) {
  if (!Number.isFinite(audioSeconds) || audioSeconds < 0)
    throw new Error("Thời lượng audio không hợp lệ.");
  const seconds = Math.max(4, requested, Math.ceil(audioSeconds + 0.5));
  if (seconds > 30)
    throw new Error(
      "Lời thoại dài hơn 30 giây. Hãy chia thành hai cảnh trước khi tạo video.",
    );
  return seconds;
}
export function compileFilmMotion(
  scene: FilmScene,
  mode: "native" | "fixed",
  format: string,
) {
  return [
    `Một shot liên tục ${format}, phong cách và nhận diện theo ảnh đầu.`,
    scene.motion_prompt,
    `Hành động: ${scene.action}. Bối cảnh: ${scene.setting}. Máy quay: ${scene.camera}.`,
    `Cast: ${scene.cast_snapshot.map((c) => `${c.name}: ${c.description}`).join("; ")}. Giữ gương mặt, tóc, trang phục, tỷ lệ.`,
    scene.dialogue
      ? `${scene.cast_snapshot.find((c) => c.characterId === scene.speaker_character_id)?.name} là người nói duy nhất. ${mode === "native" ? `Nói nguyên văn tiếng Việt: “${scene.dialogue}”.` : "Tập trung gương mặt người nói, diễn xuất tự nhiên; audio thoại sẽ được đồng bộ riêng."}`
      : "Không ai nói.",
    "Không thêm nhân vật, chữ hoặc phụ đề. Không nhạc nền.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A completed result is current only if its immutable dependencies are current. */
export function currentSceneTask(
  tasks: FilmTask[],
  scene: FilmScene,
  kind: FilmKind,
  audioMode: "native" | "fixed",
): FilmTask | undefined {
  const candidates = tasks.filter(
    (t) =>
      t.scene_id === scene.id &&
      t.scene_version === scene.version &&
      t.status === "completed" &&
      (t.kind === kind || (kind === "image" && t.kind === "frame")),
  );
  if (kind === "video") {
    const image = currentSceneTask(tasks, scene, "image", audioMode),
      audio = currentSceneTask(tasks, scene, "tts", audioMode);
    return candidates.find(
      (t) =>
        t.input.imageTaskId === image?.id &&
        (!scene.dialogue ||
          audioMode === "native" ||
          t.input.audioTaskId === audio?.id),
    );
  }
  if (kind === "lip_sync") {
    const video = currentSceneTask(tasks, scene, "video", audioMode),
      audio = currentSceneTask(tasks, scene, "tts", audioMode);
    return candidates.find(
      (t) =>
        !!video &&
        !!audio &&
        t.input.videoTaskId === video.id &&
        t.input.audioTaskId === audio.id,
    );
  }
  if (kind === "transcribe") {
    const video = currentSceneTask(
      tasks,
      scene,
      audioMode === "fixed" && scene.dialogue ? "lip_sync" : "video",
      audioMode,
    );
    return candidates.find((t) => !!video && t.input.videoTaskId === video.id);
  }
  return candidates[0];
}

/** The first lip-sync adapter cannot select a face in a multi-person frame. */
export function assertFixedVoiceShot(
  scene: Pick<FilmScene, "dialogue" | "cast_snapshot" | "speaker_character_id">,
) {
  if (
    scene.dialogue &&
    (scene.cast_snapshot.length !== 1 ||
      scene.cast_snapshot[0].characterId !== scene.speaker_character_id)
  )
    throw new Error(
      "Cảnh có giọng riêng cần chỉ một nhân vật là người nói. Tách cảnh cả gia đình thành cảnh không thoại và các cận cảnh người nói trước khi tạo.",
    );
}
