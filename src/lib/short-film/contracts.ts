import type { Story } from "../family-catalogue";
export const FILM_MODELS = {
  image: "gemini-3.1-flash-image",
  tts: "minimax/speech-2.6-hd",
  designed_tts: "minimax/speech-02-hd",
  voice_design: "minimax/voice-design",
  video: "bytedance/seedance-2.5/image-to-video",
  lip_sync: "sync/lipsync-2-pro",
  transcribe: "wavespeed-ai/openai-whisper-with-video",
} as const;

export const GEMINI_TTS_MODELS = [
  {
    id: "gemini-3.1-flash-tts-preview",
    label: "Gemini 3.1 Flash TTS · mới nhất",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    label: "Gemini 2.5 Pro TTS · ưu tiên chất lượng",
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    label: "Gemini 2.5 Flash TTS · nhanh, tiết kiệm",
  },
] as const;
export type GeminiTtsModel = (typeof GEMINI_TTS_MODELS)[number]["id"];

/**
 * Gemini publishes named base voices and speaking styles, not guaranteed child
 * voices. These AIDA presets add an explicit Vietnamese age/gender direction;
 * every generated sample still has to be heard and approved by a person.
 */
export const GEMINI_VOICE_PRESETS = {
  girl_leda: {
    label: "Bé gái · trong trẻo, tự nhiên",
    voice: "Leda",
    direction:
      "Giọng bé gái Việt Nam khoảng 6 đến 8 tuổi, trong trẻo, tự nhiên, tinh nghịch, nói rõ dấu tiếng Việt; tuyệt đối không giống phụ nữ trưởng thành hoặc phát thanh viên.",
  },
  girl_aoede: {
    label: "Bé gái · nhẹ nhàng, đáng yêu",
    voice: "Aoede",
    direction:
      "Giọng bé gái Việt Nam khoảng 6 đến 8 tuổi, nhẹ nhàng, đáng yêu, nhịp nói hồn nhiên, rõ tiếng Việt; không có chất giọng người lớn.",
  },
  girl_zephyr: {
    label: "Bé gái · sáng, lanh lợi",
    voice: "Zephyr",
    direction:
      "Giọng bé gái Việt Nam khoảng 7 đến 9 tuổi, sáng, lanh lợi, phản ứng nhanh và vui; giữ âm sắc trẻ em, không đọc quảng cáo.",
  },
  girl_sadachbia: {
    label: "Bé gái · hoạt bát, lém lỉnh",
    voice: "Sadachbia",
    direction:
      "Giọng bé gái Việt Nam khoảng 6 đến 8 tuổi, hoạt bát, lém lỉnh và giàu biểu cảm; phát âm tự nhiên, không lên giọng kiểu MC.",
  },
  boy_puck: {
    label: "Bé trai · vui, tinh nghịch",
    voice: "Puck",
    direction:
      "Giọng bé trai Việt Nam khoảng 4 đến 6 tuổi, vui, tinh nghịch, hồn nhiên và rõ lời; tuyệt đối không giống đàn ông trưởng thành.",
  },
  boy_fenrir: {
    label: "Bé trai · hào hứng, nhiều năng lượng",
    voice: "Fenrir",
    direction:
      "Giọng bé trai Việt Nam khoảng 5 đến 7 tuổi, hào hứng, nhiều năng lượng, nhịp tự nhiên; giữ âm sắc trẻ em và không gằn giọng người lớn.",
  },
  boy_achird: {
    label: "Bé trai · thân thiện, ấm",
    voice: "Achird",
    direction:
      "Giọng bé trai Việt Nam khoảng 5 đến 7 tuổi, thân thiện, ấm và tò mò; nói rõ tiếng Việt, không có chất giọng người dẫn chương trình.",
  },
  boy_enceladus: {
    label: "Bé trai · nhỏ nhẹ, ngây thơ",
    voice: "Enceladus",
    direction:
      "Giọng bé trai Việt Nam khoảng 4 đến 6 tuổi, nhỏ nhẹ, ngây thơ, có nhịp thở tự nhiên; không trầm hoặc già dặn.",
  },
} as const;
export type GeminiVoicePreset = keyof typeof GEMINI_VOICE_PRESETS;

export function isGeminiTtsModel(model: string): model is GeminiTtsModel {
  return GEMINI_TTS_MODELS.some((candidate) => candidate.id === model);
}

/**
 * The provider's built-in voices are adult/general-purpose voices.  Do not
 * present them as child voices just because their pitch is higher.  Designed
 * profiles create an original synthetic voice ID first, then keep that ID on
 * the approved character version for every later episode.
 */
export const DESIGNED_CHILD_VOICES = {
  child_girl: {
    label: "Bé gái · giọng Việt tự nhiên",
    model: "minimax/speech-02-hd",
    settings: { speed: 1.08, pitch: 1, volume: 1, emotion: "happy" },
    prompt:
      "Original synthetic Vietnamese voice for a cheerful young girl around six years old. Bright small childlike timbre, playful and expressive, clear Vietnamese pronunciation, warm family-cartoon energy, natural little laughs and lively rising intonation. Must sound like a child, never an adult woman, never sensual, never announcer-like.",
  },
  child_boy: {
    label: "Bé trai · giọng Việt tự nhiên",
    model: "minimax/speech-02-hd",
    settings: { speed: 1.02, pitch: 0, volume: 1, emotion: "happy" },
    prompt:
      "Original synthetic Vietnamese voice for a curious young boy around three to four years old. Soft round childlike timbre, playful and warm, clearly intelligible Vietnamese pronunciation, spontaneous small-child rhythm and wonder. Must sound like a child, never an adult man, never announcer-like.",
  },
} as const;
export type DesignedChildVoice = keyof typeof DESIGNED_CHILD_VOICES;
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
  | "image"
  | "voice_design"
  | "tts"
  | "video"
  | "lip_sync"
  | "transcribe"
  | "render"
  | "frame";
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
  latest_content_output_id?: string | null;
  target_duration_seconds: number;
  story?: Story | null;
  script_review?: { version: number; reviewed_at: string } | null;
  trim_speech?: boolean;
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
  auto_accepted_at?: string | null;
  production_run_id?: string | null;
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
