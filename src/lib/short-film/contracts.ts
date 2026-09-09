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
 * Gemini publishes named base voices with an official gender mapping. These
 * AIDA presets preserve that base gender while directing age, Vietnamese
 * delivery and character style. Every sample still has to be heard and
 * approved by a person.
 */
export const GEMINI_VOICE_PRESETS = {
  father_orus: {
    label: "Bố · chắc, tinh nghịch",
    voice: "Orus",
    direction:
      "Audio profile: Bố, một người cha Việt Nam khoảng 30 đến 38 tuổi. Giọng nam chắc, tự nhiên và tinh nghịch nhẹ; nói thân mật như đang trò chuyện với con trong gia đình. Không đọc quảng cáo, không phát thanh, không quá trầm và không già hóa giọng.",
  },
  mother_aoede: {
    label: "Mẹ · thoáng, đáng yêu",
    voice: "Aoede",
    direction:
      "Audio profile: Mẹ, một người mẹ Việt Nam khoảng 28 đến 36 tuổi. Giọng nữ thoáng, đáng yêu, ấm vừa và tự nhiên; nói thân mật như đang trò chuyện với con trong gia đình. Không đọc quảng cáo, không phát thanh và không dùng âm sắc trẻ em.",
  },
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
  boy_puck: {
    label: "Bé trai nam · vui, tinh nghịch",
    voice: "Puck",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, vui và tinh nghịch. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt, không đọc quảng cáo.",
  },
  boy_fenrir: {
    label: "Bé trai nam · hào hứng, nhiều năng lượng",
    voice: "Fenrir",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, hào hứng và nhiều năng lượng. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt, không gằn giọng.",
  },
  boy_achird: {
    label: "Bé trai nam · thân thiện, ấm",
    voice: "Achird",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, thân thiện, ấm và tò mò. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt.",
  },
  boy_enceladus: {
    label: "Bé trai nam · nhỏ nhẹ, ngây thơ",
    voice: "Enceladus",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, nhỏ nhẹ và ngây thơ. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt.",
  },
  boy_charon: {
    label: "Bé trai nam · tò mò, tự nhiên",
    voice: "Charon",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, tò mò và tự nhiên. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói thân mật, rõ tiếng Việt.",
  },
  boy_iapetus: {
    label: "Bé trai nam · trong, rõ, lanh lợi",
    voice: "Iapetus",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, trong, rõ lời và lanh lợi. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, không đọc quảng cáo.",
  },
  boy_orus: {
    label: "Bé trai nam · tự tin, lém lỉnh",
    voice: "Orus",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, tự tin và lém lỉnh. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt.",
  },
  boy_algenib: {
    label: "Bé trai nam · hơi khàn, nghịch ngợm",
    voice: "Algenib",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, hơi khàn nhẹ và nghịch ngợm. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt.",
  },
  boy_algieba: {
    label: "Bé trai nam · mượt, ấm, vui vẻ",
    voice: "Algieba",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, mượt, ấm và vui vẻ. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt.",
  },
  boy_sadachbia: {
    label: "Bé trai nam · hoạt bát, giàu biểu cảm",
    voice: "Sadachbia",
    direction:
      "Audio profile: bé trai Việt Nam khoảng 7 đến 9 tuổi, hoạt bát và giàu biểu cảm. Giữ nguyên âm sắc NAM của base voice: âm vực trung thấp đối với trẻ em, có độ vang ngực nhẹ, không falsetto, không nữ tính và không phải giọng đàn ông trưởng thành. Nói tự nhiên, rõ tiếng Việt.",
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
  source_mode: "manual" | "ai";
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
  const duration = Math.max(4, Math.min(30, scene.duration_seconds || 5));
  const firstBeat = Math.min(1.2, duration * 0.22);
  const finalBeat = Math.max(firstBeat + 0.8, duration - 0.8);
  const speaker = scene.cast_snapshot.find(
    (c) => c.characterId === scene.speaker_character_id,
  )?.name;
  const plannedTimeline = /(?:^|\s)(?:0(?:\.0)?s|0(?:\.0)?\s*(?:-|–|→))/i.test(
    scene.motion_prompt,
  )
    ? scene.motion_prompt
    : [
        `0.0–${firstBeat.toFixed(1)}s: bắt đầu ngay hành động chính, không có khung chờ hoặc đoạn thiết lập rỗng; ${scene.motion_prompt}.`,
        `${firstBeat.toFixed(1)}–${finalBeat.toFixed(1)}s: ${scene.action}; biểu cảm, ánh mắt, tay và cơ thể tiếp tục phản ứng tự nhiên, không đứng tạo dáng.`,
        `${finalBeat.toFixed(1)}–${duration.toFixed(1)}s: hoàn tất hành động và đi tới trạng thái kết rõ để cắt sang cảnh sau; chỉ giữ phản ứng cuối tối đa 0,3 giây.`,
      ].join(" ");
  const intentionalStillness =
    /static reaction|locked[- ]?off|đứng hình|phản ứng ngơ|bất động/i.test(
      `${scene.camera} ${scene.action}`,
    );
  const camera = intentionalStillness
    ? `${scene.camera}; đây là nhịp phản ứng cố ý, vẫn có chuyển động rất nhỏ của mắt, hơi thở và tóc.`
    : `${scene.camera.replace(/\b(?:stable|static)\s*(?:camera|shot)?\b/gi, "controlled handheld")}; camera chuyển động có chủ đích ngay từ giây 0 bằng handheld nhẹ, tracking, push hoặc slide phù hợp hành động; không khóa máy và không trôi vô cớ.`;
  return [
    `GLOBAL STYLE: một shot liên tục ${format}, nhịp nhanh tự nhiên, phong cách và nhận diện kế thừa chính xác từ ảnh đầu.`,
    `SCENE: ${scene.setting}.`,
    `FIRST FRAME: dùng nguyên bố cục, vị trí và diện mạo trong ảnh đầu; hành động bắt đầu ở giây 0, không mở bằng cảnh đứng yên.`,
    `ACTION TIMELINE (${duration.toFixed(1)} giây): ${plannedTimeline}`,
    `CAMERA: ${camera}`,
    `CONTINUITY: chỉ có ${scene.cast_snapshot.map((c) => c.name).join(", ")}; giữ nguyên mặt, tóc, trang phục, tỷ lệ và hướng nhìn từ ảnh đầu. Không thêm người, không đổi vai hoặc đổi vị trí vô lý.`,
    scene.dialogue
      ? `ACTIVE SPEAKER: ${speaker || "người nói đã chỉ định"} là người nói duy nhất và là người duy nhất cử động môi theo lời. Người nghe giữ miệng đóng, chỉ phản ứng bằng mắt, nét mặt và cơ thể. ${mode === "native" ? `Nói đúng một câu nguyên văn tiếng Việt, không thêm tiếng đệm hoặc câu đáp: “${scene.dialogue}”.` : "Tập trung rõ gương mặt người nói; không phát lời vì audio sẽ được đồng bộ riêng."}`
      : "ACTIVE SPEAKER: không ai nói; mọi nhân vật giữ miệng đóng.",
    mode === "native"
      ? "AUDIO: lời thoại rõ ở tiền cảnh; nhạc nền không lời vui vẻ, ấm áp, tinh nghịch nhẹ kiểu gia đình, âm lượng thấp và liên tục. Không thêm lời nói, tiếng đệm, chữ hoặc phụ đề."
      : "AUDIO: không lời thoại và không nhạc; audio lồng tiếng sẽ được đồng bộ riêng. Không thêm chữ hoặc phụ đề.",
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
