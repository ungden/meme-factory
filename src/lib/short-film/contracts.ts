import {
  SHORT_FORM_SPEECH_POLICY_VERSION,
  spokenSeconds,
  validateStoryboard,
  type FilmStoryboard,
} from "../film-storyboard";
import { REALTIME_MOTION_DIRECTION } from "../film-motion-policy";
import {
  formatLook,
  formatAddressesCamera,
  type FilmMediumKind,
  formatAllowsLocationCuts,
} from "../film-camera-language";
import type { Story } from "../family-catalogue";
import {
  compilePerformanceDirection,
  type PerformanceDirection,
} from "../performance-direction";
import {
  SEEDANCE_25_TEXT_MODEL,
  SEEDANCE_REFERENCE_AUDIO_MAX_SECONDS,
  nativeSpeechSupported,
  seedanceMaxDuration,
  validSeedanceDuration,
  type FilmVideoModel,
} from "../video-models";
export const FILM_MODELS = {
  image: "gemini-3.1-flash-image",
  tts: "minimax/speech-2.6-hd",
  designed_tts: "minimax/speech-02-hd",
  voice_design: "minimax/voice-design",
  video: SEEDANCE_25_TEXT_MODEL,
  lip_sync: "sync/lipsync-2-pro",
  transcribe: "wavespeed-ai/openai-whisper-with-video",
} as const;

/**
 * Các bộ máy đọc thoại.
 *
 * `label` là tên model cho log và màn quản trị; `customerLabel` là thứ người
 * dùng đọc khi chọn giọng — họ chọn giữa "mới nhất" và "tiết kiệm", không phải
 * giữa hai mã model.
 */
export const GEMINI_TTS_MODELS = [
  {
    id: "gemini-3.1-flash-tts-preview",
    label: "Gemini 3.1 Flash TTS · mới nhất",
    customerLabel: "Giọng mới nhất",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    label: "Gemini 2.5 Pro TTS · ưu tiên chất lượng",
    customerLabel: "Giọng chất lượng cao",
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    label: "Gemini 2.5 Flash TTS · nhanh, tiết kiệm",
    customerLabel: "Giọng tiết kiệm",
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
  | "dub"
  | "lip_sync"
  | "transcribe"
  | "render"
  | "frame";
export type FilmScene = {
  storyboard?: FilmStoryboard | null;
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
  input_hash: string;
  media_links: Partial<Record<FilmKind, string>>;
  deleted_at: string | null;
  performance_direction?: PerformanceDirection | null;
};
export type FilmCast = {
  characterId: string;
  name: string;
  description: string;
  personality: string;
  imageUrl: string;
  referenceImages: string[];
  /**
   * Vai trò của từng ảnh chuẩn (`identity_face`, `identity_body`, `look`…).
   *
   * Cần để biết bộ ảnh có ảnh cận mặt hay không: thiếu nó thì khuôn mặt đổi
   * giữa các cảnh, và trước đây không chỗ nào phát hiện được điều đó vì cast
   * chỉ mang danh sách URL.
   */
  referenceRoles?: string[];
  assetVersionId?: string | null;
  assetVersion?: number | null;
  /** One-off guest generated for this single plan; never in the character library. */
  isGuest?: boolean;
  guestKey?: string;
  voice?: {
    id: string;
    voice_id: string;
    model: string;
    settings: Record<string, unknown>;
    source?: "approved" | "auto_guest";
  };
  /**
   * Giọng mẫu cho Seedance 2.5 tự nói. Tách khỏi `voice` vì nhánh lồng tiếng
   * vẫn cần giọng TTS: nếu giọng mẫu thành bản duyệt mới nhất trong `voice`,
   * clip dự phòng lồng tiếng sẽ gọi TTS với một giọng không tồn tại.
   */
  nativeVoice?: {
    id: string;
    voice_id: string;
    model: string;
    settings: Record<string, unknown>;
  };
  /** Trang phục riêng của tập này; ảnh thân trong referenceImages đã mặc nó. */
  episodeOutfit?: string;
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
  video_model: FilmVideoModel;
  audio_mode: "native" | "fixed" | "dubbed";
  subtitles: boolean;
  status: string;
  latest_content_output_id?: string | null;
  /** Lightweight metadata returned by the plan list for episode picking. */
  has_video?: boolean;
  video_status?: "draft" | "running" | "ready" | "needs_review" | "failed";
  video_output_count?: number;
  has_production_history?: boolean;
  archived_at?: string | null;
  updated_at?: string;
  target_duration_seconds: number;
  story?: Story | null;
  script_review?: { version: number; reviewed_at: string } | null;
  trim_speech?: boolean;
  cast_snapshot: FilmCast[];
  video_plan_scenes: FilmScene[];
};
/**
 * Đúng bằng ràng buộc check trên short_film_tasks.status
 * (20260908114746_harden_short_film_pipeline.sql:34). Để kiểu `string` thì mọi
 * phép so sánh trạng thái đều không được compiler kiểm lỗi gõ.
 */
export type FilmTaskStatus =
  | "queued"
  | "running"
  | "reconciling"
  | "completed"
  | "failed"
  | "cancelled";

export type FilmTask = {
  id: string;
  kind: FilmKind;
  scene_id: string | null;
  scene_version: number | null;
  segment_id?: string | null;
  segment_revision?: number | null;
  displayName?: string;
  plan_version: number;
  points?: number;
  status: FilmTaskStatus;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  approved_at: string | null;
  auto_accepted_at?: string | null;
  production_run_id?: string | null;
  provider_id?: string | null;
  url?: string;
  posterUrl?: string;
  srtUrl?: string;
  created_at: string;
};
export type QuotedTask = {
  id: string;
  sceneId?: string;
  sceneVersion?: number;
  segmentId?: string;
  segmentRevision?: number;
  kind: FilmKind;
  input: Record<string, unknown>;
  dependencies: string[];
  points: number;
  hash: string;
};
/** Một kết quả được chấp nhận khi người duyệt hoặc QA tự động đã ký nhận nó. */
export function isAcceptedTask(task?: FilmTask | null) {
  return Boolean(task?.approved_at || task?.auto_accepted_at);
}

/**
 * Thứ tự chọn kết quả hiện hành: bản đã được chấp nhận đứng trước, sau đó tới
 * bản mới nhất. Dùng chung cho mọi nơi chọn task, để không nơi nào lặng lẽ
 * chọn theo một quy tắc khác.
 */
export function byAcceptanceThenRecency(a: FilmTask, b: FilmTask) {
  return (
    Number(isAcceptedTask(b)) - Number(isAcceptedTask(a)) ||
    Date.parse(b.created_at || "") - Date.parse(a.created_at || "")
  );
}

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
const AMBIENT_AUDIO_DIRECTION =
  "AUDIO: chỉ âm thanh môi trường tự nhiên của bối cảnh (sóng, gió, bước chân, tiếng vật dụng), nhỏ và liên tục. Tuyệt đối không lời nói, không tiếng người, không nhạc. Không phụ đề, nhãn thời gian hay chữ phủ lên hình; giữ nguyên chữ/số thật trên đạo cụ.";

/**
 * Ở chế độ lồng tiếng, clip có lời được tạo im tiếng vì giọng sẽ lồng riêng.
 * Cảnh không lời (hồi tưởng, phản ứng kết) thì không có gì để lồng: tạo im tiếng
 * làm phim câm hẳn vài giây. WaveSpeed tính Seedance cùng giá dù có audio, nên
 * các cảnh này nhận âm thanh môi trường gốc của model.
 */
export function sceneUsesAmbientAudio(
  scene: Pick<FilmScene, "dialogue" | "storyboard">,
  mode: "native" | "fixed" | "dubbed",
) {
  if (mode === "native") return false;
  const spoken = scene.storyboard
    ? scene.storyboard.beats.some((beat) => beat.dialogue?.trim())
    : Boolean(scene.dialogue?.trim());
  return !spoken;
}

/**
 * Cảnh có lời nhưng mở/kết bằng nhịp không lời (cõng con đi dọc biển rồi mới
 * nói) cũng cần tiếng môi trường ở nhịp đó; nếu không phim câm vài giây. Audio
 * gốc chỉ được giữ trong khoảng không lời khi lồng tiếng.
 */
export function sceneHasWordlessBeat(
  scene: Pick<FilmScene, "storyboard">,
  mode: "native" | "fixed" | "dubbed",
) {
  return (
    mode === "dubbed" &&
    Boolean(scene.storyboard?.beats.some((beat) => !beat.dialogue?.trim())) &&
    Boolean(scene.storyboard?.beats.some((beat) => beat.dialogue?.trim()))
  );
}

/**
 * Một câu mô tả trạng thái, lấy ra từ blob mà đạo diễn trả về.
 *
 * Bản cũ nhét nguyên `JSON.stringify` vào prompt, nên mô hình dựng video nhận
 * được `{\"note\":\"Bánh Bao (chân trần) đứng chắn trước tủ lạnh...\"}` — dấu
 * ngoặc và ký tự thoát chiếm chỗ mà không chở thêm nghĩa. Với trần prompt
 * ~4000 ký tự của Seedance, chỗ đó là chỗ để dành cho thêm một nhịp thoại.
 */
function stateSentence(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const record = value as Record<string, unknown>;
  return Object.values(record)
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Đạo cụ viết thành một mệnh đề người đọc được, thay cho JSON. */
function propPhrase(prop: Record<string, unknown>, nameOf: (id: string) => string | undefined): string {
  const holder = nameOf(String(prop.holderCharacterId || ""));
  const bits = [
    String(prop.count || 1) !== "1" ? `${prop.count} ` : "",
    String(prop.label || prop.id || "").trim(),
    String(prop.color || "").trim(),
    String(prop.size || "").trim(),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const marks = String(prop.marks || "").trim();
  const where = holder ? `${holder} cầm` : String(prop.position || "").trim();
  return [bits, marks && marks !== "không có" ? `ghi ${marks}` : "", where]
    .filter(Boolean)
    .join(", ");
}

/**
 * Mốc thời gian chỉ được ghi khi model thật sự đọc được nó.
 *
 * Seedance 2.0 KHÔNG phản hồi timestamp — tài liệu BytePlus nói rõ nó chỉ phản
 * hồi số hiệu shot, và cảnh báo rằng ép mốc giây có thể cho "kết quả sinh bất
 * thường". Bản cũ ghi `0.00–2.40s`, tức là nhận vơ độ chính xác tới một phần
 * trăm giây cho một model không đọc con số đó. Từ 2.5 mới có điều khiển theo
 * giây, và chỉ ở mức giây nguyên.
 */
export function beatHeading(
  index: number,
  startSeconds: number,
  endSeconds: number,
  videoModel: string,
): string {
  if (/seedance-2\.5/.test(videoModel))
    return `Shot ${index + 1} | ${Math.round(startSeconds)}-${Math.round(endSeconds)} giây`;
  return `Shot ${index + 1}`;
}

/**
 * Seedance nuốt `--xx` trong prompt như tham số dòng lệnh và không báo lỗi.
 * Gạch ngang đôi trong tiếng Việt (dấu gạch nối kéo dài, hoặc số "5--6") vì thế
 * có thể bị ăn mất cùng vài chữ đứng sau.
 */
export function sanitizeProviderPrompt(prompt: string): string {
  return prompt.replace(/--+/gu, "—");
}

/**
 * Giọng mẫu cho Seedance 2.5: một bản ghi giọng đã được chủ kênh duyệt, lưu ở
 * `character_voice_versions` với model `seedance-native`. Gửi kèm mọi clip để
 * cùng một bé nói cùng một giọng từ clip đầu tới clip cuối.
 */
export const NATIVE_VOICE_MODEL = "seedance-native";

export type NativeVoiceSample = {
  characterId: string;
  name: string;
  source:
    | { url: string }
    | { path: string }
    | { taskId: string; inSeconds: number; outSeconds: number };
  seconds: number;
};

export function nativeVoiceSamples(
  scene: Pick<FilmScene, "cast_snapshot" | "storyboard" | "speaker_character_id">,
  maxSeconds = SEEDANCE_REFERENCE_AUDIO_MAX_SECONDS,
): NativeVoiceSample[] {
  const speakers = new Set(
    scene.storyboard
      ? scene.storyboard.beats.map((beat) => beat.speakerCharacterId).filter(Boolean)
      : [scene.speaker_character_id].filter(Boolean),
  );
  const samples: NativeVoiceSample[] = [];
  let total = 0;
  for (const cast of scene.cast_snapshot) {
    if (!speakers.has(cast.characterId) || cast.nativeVoice?.model !== NATIVE_VOICE_MODEL) continue;
    const settings = cast.nativeVoice.settings || {};
    const url = typeof settings.sampleUrl === "string" ? settings.sampleUrl : "";
    const path = typeof settings.samplePath === "string" ? settings.samplePath : "";
    const taskId = typeof settings.sourceTaskId === "string" ? settings.sourceTaskId : "";
    const inSeconds = Number(settings.inSeconds);
    const outSeconds = Number(settings.outSeconds);
    const fromClip = Boolean(taskId) && Number.isFinite(inSeconds) && outSeconds > inSeconds;
    const seconds = fromClip ? outSeconds - inSeconds : Number(settings.sampleSeconds);
    if ((!fromClip && !/^https:\/\//i.test(url) && !path) || !Number.isFinite(seconds) || seconds <= 0)
      continue;
    // Bỏ giọng vượt trần thay vì hỏng cả clip: người nói đó vẫn được tả bằng chữ.
    if (total + seconds > maxSeconds) continue;
    total += seconds;
    samples.push({
      characterId: cast.characterId,
      name: cast.name,
      source: fromClip ? { taskId, inSeconds, outSeconds } : path ? { path } : { url },
      seconds,
    });
  }
  return samples;
}

/**
 * Lời tả giọng cho từng người nói. Không có giọng mẫu thì đây là thứ duy nhất
 * giữ tuổi giọng: thiếu nó Seedance cho bé 2 tuổi nói giọng thiếu niên.
 */
function nativeVoiceLine(
  scene: Pick<FilmScene, "cast_snapshot">,
  speakerIds: Set<string>,
  samples: NativeVoiceSample[],
): string {
  const parts = scene.cast_snapshot
    .filter((cast) => speakerIds.has(cast.characterId))
    .map((cast) => {
      const sample = samples.findIndex((item) => item.characterId === cast.characterId);
      const direction = String(
        cast.nativeVoice?.settings?.direction || cast.voice?.settings?.direction || "",
      ).trim();
      const who = String(cast.description || "").split(/[,.]/u)[0].trim();
      const voice = direction || `giọng thật đúng tuổi và giới của ${who || cast.name}`;
      return `${cast.name}: ${sample >= 0 ? `giọng y hệt @audio${sample + 1}; ` : ""}${voice}`;
    });
  return parts.length ? `GIỌNG: ${parts.join(". ")}. Mỗi người giữ đúng một giọng suốt clip.` : "";
}

export function nativeAudioDirection(
  scene: Pick<FilmScene, "cast_snapshot" | "storyboard" | "speaker_character_id">,
  samples: NativeVoiceSample[] = [],
): string {
  const speakerIds = new Set(
    (scene.storyboard
      ? scene.storyboard.beats.map((beat) => beat.speakerCharacterId)
      : [scene.speaker_character_id]
    ).filter((id): id is string => Boolean(id)),
  );
  return [
    // Nhạc nền do model tự sinh đổi bài ở mỗi clip, nghe như cắt nhạc giữa phim;
    // nhạc nếu cần thì ghép một lần lúc dựng.
    "AUDIO: nhân vật tự nói tiếng Việt, đúng nguyên văn từng câu trong {} và đúng người nói, giọng tự nhiên như đời thật, rõ dấu. Chỉ tiếng môi trường thật của nơi quay, nhỏ. Không nhạc nền, không thêm lời, không tiếng đệm. Không phụ đề, nhãn thời gian hay chữ phủ lên hình; giữ nguyên chữ/số thật trên đạo cụ.",
    nativeVoiceLine(scene, speakerIds, samples),
  ]
    .filter(Boolean)
    .join("\n");
}

export function compileFilmMotion(
  scene: FilmScene,
  mode: "native" | "fixed" | "dubbed",
  format: string,
  measuredSpeechSeconds?: ReadonlyMap<number, number>,
  referenceBindings: string[] = [],
  videoModel: string = FILM_MODELS.video,
  voiceSamples: NativeVoiceSample[] = [],
  medium: FilmMediumKind = "photoreal",
) {
  if (scene.storyboard) {
    if (mode === "fixed")
      throw new Error(
        "Storyboard nhiều người dùng lồng tiếng theo lượt, không dùng đồng bộ môi một người.",
      );
    const board = validateStoryboard(
      scene.storyboard,
      scene.cast_snapshot.map((c) => c.characterId),
      30,
      measuredSpeechSeconds,
    );
    const name = (id: string | null) =>
      scene.cast_snapshot.find((c) => c.characterId === id)?.name;
    const performance = board.performanceDirection || scene.performance_direction;
    // Đạo cụ gom về MỘT khối ở đầu: cùng cây bút được tả lại nguyên văn ở mọi
    // nhịp là nguồn phình prompt lớn nhất (một khối props JSON ~900 ký tự).
    const propsById = new Map<string, Record<string, unknown>>();
    for (const beat of board.beats)
      for (const prop of (beat.props || []) as Record<string, unknown>[])
        if (!propsById.has(String(prop.id))) propsById.set(String(prop.id), prop);
    const propsLine = propsById.size
      ? `PROPS (giữ nguyên suốt clip): ${[...propsById.values()]
          .map((prop) => propPhrase(prop, (id) => scene.cast_snapshot.find((c) => c.characterId === id)?.name))
          .join("; ")}.`
      : "";
    const filmFormat = board.filmFormat || "family_scene";
    const hopsLocation = formatAllowsLocationCuts(filmFormat);
    const facesLens = formatAddressesCamera(filmFormat);
    return [
      `STORYBOARD: clip nguồn ${board.durationSeconds} giây ${format}; câu chuyện hữu ích kết thúc ở ${Number(board.contentEndSeconds ?? board.durationSeconds).toFixed(2)} giây và phần nguồn còn lại sẽ bị cắt. Diễn nhiều nhịp đối đáp/hành động liên tục theo thứ tự sau. ${hopsLocation ? "Bối cảnh mở" : "Bối cảnh"} ${scene.setting}.`,
      ...(formatLook(filmFormat, medium) ? [formatLook(filmFormat, medium)] : []),
      `REFERENCE PACK: ${referenceBindings.join(" ")} Dùng đúng vai trò đã gắn cho từng @image; không trộn mặt, trang phục, đạo cụ hoặc bối cảnh giữa các ảnh. Storyboard tổng chỉ để duyệt và không nằm trong input provider.`,
      // Mô tả cắt ngắn: nhận diện đã do ảnh chuẩn khoá, và tài liệu Seedance nói
      // ảnh tham chiếu thắng chữ khi hai bên nói khác nhau về ngoại hình.
      `CAST: ${scene.cast_snapshot.map((c) => `${c.name}: ${String(c.description || "").split(/[,.]/u).slice(0, 2).join(",").trim()}${c.episodeOutfit ? `, tập này mặc ${c.episodeOutfit}` : ""}`).join("; ")}. Không trộn người giữa các lượt.`,
      REALTIME_MOTION_DIRECTION,
      ...(performance ? [`ACTING INTENT: ${performance.comicObjective}. HOOK 0–1s: ${performance.hook}. END CUE: ${performance.revealOrCut}. Các hành vi cụ thể nằm trong timeline dưới đây; không diễn lại thành chuỗi thứ hai.`] : []),
      hopsLocation
        ? "CAMERA: mỗi shot đúng một phương án máy đã ghi. Cắt thẳng (jump cut) giữa các shot; shot nào ghi nơi khác thì cắt thẳng sang nơi đó, cùng người, cùng trang phục. Không dissolve, không chuyển cảnh trang trí."
        : "CAMERA: mỗi shot đúng một phương án máy đã ghi; máy tĩnh được phép. Cắt thẳng giữa các shot, giữ trục nhìn, bên trái/phải và vị trí đạo cụ qua cut. Không dissolve, không chuyển cảnh trang trí, không đổi bối cảnh.",
      ...(facesLens
        ? ["NHÌN MÁY: người nói nói thẳng vào ống kính như đang nói với người xem; khi không nói vẫn có thể liếc ống kính để phản ứng."]
        : []),
      ...(propsLine ? [propsLine] : []),
      ...board.beats.map((b, i) => {
        const opening = stateSentence(b.openingState);
        const closing = stateSentence(b.closingState);
        const sentence = (text: string) => {
          const trimmed = String(text || "").trim();
          return !trimmed || /[.!?;]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
        };
        return [
          `${beatHeading(i, b.startSeconds, b.endSeconds, videoModel)}: ${hopsLocation && b.setting ? `Ở ${sentence(b.setting)} ` : ""}CAMERA ${sentence(b.camera)} ${sentence(b.motion)}`,
          opening ? `Mở nhịp: ${sentence(opening)}` : "",
          closing ? `Kết nhịp: ${sentence(closing)}` : "",
          b.performance ? `Phản ứng: ${b.performance.expressionChange}; ${sentence(b.performance.reactionTarget)}` : "",
          b.dialogue
            ? `Chỉ ${name(b.speakerCharacterId)} nói tiếng Việt {${b.dialogue}}${mode === "native" ? "" : ", video im tiếng, lồng tiếng sau"}. Người còn lại nghe, miệng đóng.${
                measuredSpeechSeconds?.has(i)
                  ? ` Nói xong trước khi hết nhịp${/seedance-2\.5/.test(videoModel) ? ` (khoảng giây ${Math.round(b.startSeconds + measuredSpeechSeconds.get(i)!)})` : ""}; phần còn lại là phản ứng, không kéo môi cho đầy nhịp.`
                  : ""
              }`
            : "Không ai nói; diễn hành động đã mô tả.",
        ]
          .filter(Boolean)
          .join(" ");
      }),
      `NHỊP: diễn hết toàn bộ các shot trên, đúng thứ tự, không bỏ shot nào. Nói trọn câu rồi mới đổi lượt, không chồng lời. Xong diễn biến ở giây ${Math.round(Number(board.contentEndSeconds ?? board.durationSeconds))} thì giữ tư thế kết, không thêm hành động hay lời mới.`,
      mode === "native"
        ? nativeAudioDirection(scene, voiceSamples)
        : sceneUsesAmbientAudio(scene, mode) || sceneHasWordlessBeat(scene, mode)
          ? AMBIENT_AUDIO_DIRECTION
          : "SILENT VIDEO: không phát lời thoại, không nhạc. Người nói nhép môi tự nhiên trong lượt của mình (không cần khớp từng chữ), người nghe phản ứng; lồng tiếng riêng. Không phụ đề, nhãn thời gian hay chữ phủ lên hình; giữ nguyên chữ/số thật trên đạo cụ.",
    ].join("\n");
  }
  const duration = Math.max(4, Math.min(30, scene.duration_seconds || 5));
  const speaker = scene.cast_snapshot.find(
    (c) => c.characterId === scene.speaker_character_id,
  )?.name;
  const plannedTimeline = /(?:^|\s)(?:0(?:\.0)?s|0(?:\.0)?\s*(?:-|–|→))/i.test(
    scene.motion_prompt,
  )
    ? scene.motion_prompt
    : `0.0–${duration.toFixed(1)}s: ${scene.motion_prompt || scene.action}. Thực hiện hành động một lần ở tốc độ thật ngay trong lượt nói. Sau tiếp xúc/quyết định, tiếp tục đúng phản ứng của người nghe; không trải chậm động tác cho đủ clip. Kết ở trạng thái đã mô tả, không thêm trò mới.`;
  const camera = `${scene.camera}; giữ đúng phương án máy này. Máy tĩnh không có nghĩa diễn viên bất động; không tự thêm pan, orbit hoặc push-in.`;
  return [
    `GLOBAL STYLE: một shot liên tục ${format}, nhịp nhanh tự nhiên, phong cách và nhận diện kế thừa chính xác từ bộ ảnh tham chiếu.`,
    `SCENE: ${scene.setting}.`,
    `REFERENCE PACK: ${referenceBindings.join(" ")} Dùng đúng vai trò đã gắn cho từng @image; hành động bắt đầu ở giây 0, không mở bằng cảnh đứng yên.`,
    `ACTION TIMELINE (${duration.toFixed(1)} giây): ${plannedTimeline}`,
    `CAMERA: ${camera}`,
    REALTIME_MOTION_DIRECTION,
    ...(scene.performance_direction
      ? [compilePerformanceDirection(scene.performance_direction)]
      : []),
    `CONTINUITY: chỉ có ${scene.cast_snapshot.map((c) => c.name).join(", ")}; giữ nguyên mặt, tóc, trang phục và tỷ lệ từ reference images. Không thêm người, không đổi vai hoặc đổi vị trí vô lý.`,
    scene.dialogue
      ? `ACTIVE SPEAKER: ${speaker || "người nói đã chỉ định"} là người nói và nhép môi tự nhiên trong lúc nói (không cần khớp từng chữ). Người nghe chủ yếu giữ miệng đóng, phản ứng bằng mắt, nét mặt và cơ thể. ${mode === "native" ? `Nói đúng một câu nguyên văn tiếng Việt, không thêm tiếng đệm hoặc câu đáp: “${scene.dialogue}”.` : "Tập trung rõ gương mặt người nói; không phát lời vì audio sẽ được đồng bộ riêng."}`
      : "ACTIVE SPEAKER: không ai nói; mọi nhân vật giữ miệng đóng.",
    mode === "native"
      ? nativeAudioDirection(scene, voiceSamples)
      : sceneUsesAmbientAudio(scene, mode)
        ? AMBIENT_AUDIO_DIRECTION
        : "AUDIO: không lời thoại và không nhạc; audio lồng tiếng sẽ được đồng bộ riêng. Không thêm phụ đề hay chữ phủ lên hình; giữ nguyên chữ/số thật trên đạo cụ.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ảnh chuẩn nào của một nhân vật được gửi kèm cho mô hình dựng video, và nói
 * cho nó biết từng ảnh dùng để khoá cái gì.
 *
 * Bản cũ gửi TOÀN BỘ ảnh chuẩn, và gắn cho mọi ảnh đúng một câu mô tả
 * ("chỉ khóa mặt, tóc, vóc dáng và trang phục"). Lượt chạy 19/09 vì thế gửi ba
 * ảnh Bánh Bao giống hệt nhau về mặt mô tả: mô hình không biết ảnh nào là cận
 * mặt, ảnh nào là toàn thân, nên tín hiệu nhận diện bị loãng thay vì được
 * cộng dồn. Khâu dựng ẢNH đã chọn theo vai trò từ trước; khâu dựng VIDEO thì
 * chưa.
 */
const REFERENCE_ROLE_BINDING: Record<string, string> = {
  identity_face: "khoá KHUÔN MẶT: đường nét, tỷ lệ mắt/mũi/miệng, nước da, tuổi",
  identity_body: "khoá VÓC DÁNG và TỶ LỆ NGƯỜI, cùng trang phục đang mặc",
  look: "khoá TẠO HÌNH tổng thể: kiểu tóc, màu áo, phụ kiện",
};
const REFERENCE_ROLE_ORDER = ["identity_face", "identity_body", "look"];
/** Ba ảnh vừa đủ cho mặt + dáng + tạo hình mà không chiếm hết hạn mức ảnh. */
export const MAX_CAST_REFERENCES = 3;

export function castReferencePicks(
  character: Pick<FilmCast, "name" | "imageUrl" | "referenceImages" | "referenceRoles">,
): Array<{ source: string; binding: string }> {
  const images = (character.referenceImages || []).filter(Boolean);
  if (!images.length)
    return character.imageUrl
      ? [{ source: character.imageUrl, binding: `character: ảnh nhận diện đã duyệt của ${character.name}; giữ đúng mặt, tóc, vóc dáng và trang phục` }]
      : [];
  const roles = character.referenceRoles || [];
  const describe = (index: number) => {
    const role = roles[index];
    const detail = (role && REFERENCE_ROLE_BINDING[role]) || "giữ đúng mặt, tóc, vóc dáng và trang phục";
    return `character: ${character.name} — ${detail}`;
  };
  // Bộ ảnh không ghi vai trò (kịch bản cũ) thì giữ đúng thứ tự cũ.
  if (roles.length !== images.length)
    return images.slice(0, MAX_CAST_REFERENCES).map((source, index) => ({
      source,
      binding: describe(index),
    }));
  const picked: Array<{ source: string; binding: string }> = [];
  const used = new Set<number>();
  for (const role of REFERENCE_ROLE_ORDER) {
    const index = images.findIndex((_, i) => roles[i] === role && !used.has(i));
    if (index >= 0) {
      used.add(index);
      picked.push({ source: images[index], binding: describe(index) });
    }
    if (picked.length === MAX_CAST_REFERENCES) return picked;
  }
  for (let i = 0; i < images.length && picked.length < MAX_CAST_REFERENCES; i += 1)
    if (!used.has(i)) picked.push({ source: images[i], binding: describe(i) });
  return picked;
}

export type FilmReferencePacket = {
  urls: string[];
  bindings: string[];
};

/** Short films use Seedance text-to-video with role-bound reference_images. */
export function filmVideoInputs(
  scene: FilmScene,
  mode: "native" | "fixed" | "dubbed",
  format: string,
  resolution: "720p" | "1080p",
  references: FilmReferencePacket,
  audioDuration = 0,
  videoModel: FilmVideoModel = FILM_MODELS.video,
  measuredSpeechSeconds?: ReadonlyMap<number, number>,
  medium: FilmMediumKind = "photoreal",
) {
  const duration = scene.storyboard
    ? scene.storyboard.durationSeconds
    : shotDuration(audioDuration, scene.duration_seconds);
  if (!validSeedanceDuration(duration, videoModel))
    throw new Error(
      `Clip ${duration} giây vượt giới hạn ${seedanceMaxDuration(videoModel)} giây của model đã chọn. Hãy soạn lại storyboard.`,
    );
  if (!references.urls.length || references.urls.length !== references.bindings.length)
    throw new Error("Bộ ảnh tham chiếu video không hợp lệ.");
  const voiceSamples =
    mode === "native" && nativeSpeechSupported(videoModel) ? nativeVoiceSamples(scene) : [];
  return {
    prompt: sanitizeProviderPrompt(
      compileFilmMotion(
        scene,
        mode,
        format,
        measuredSpeechSeconds,
        references.bindings,
        videoModel,
        voiceSamples,
        medium,
      ),
    ),
    reference_images: references.urls,
    // Worker ký đường dẫn rồi đổi thành `reference_audios` ngay trước khi gửi.
    ...(voiceSamples.length
      ? { reference_audio_sources: voiceSamples.map((sample) => sample.source) }
      : {}),
    aspect_ratio: format,
    duration,
    resolution,
    generate_audio:
      mode === "native" ||
      sceneUsesAmbientAudio(scene, mode) ||
      sceneHasWordlessBeat(scene, mode),
  };
}

/**
 * Đổi id nhân vật bên trong storyboard: người nói, người cầm đạo cụ và cast của
 * trạng thái đầu/cuối. Khi lưu, khoá khách mời (guest-ong-noi) thành id của
 * plan; chỉ đổi ở cấp cảnh thì storyboard bị kiểm với cast uuid và bị từ chối
 * (STORYBOARD_SEGMENT_STATE_INVALID).
 */
export function remapStoryboardCharacters(
  storyboard: FilmStoryboard,
  map: (id: string) => string,
): FilmStoryboard {
  const remapState = <T extends { cast?: { characterId: string }[] } | undefined>(state: T): T =>
    state?.cast
      ? { ...state, cast: state.cast.map((entry) => ({ ...entry, characterId: map(entry.characterId) })) }
      : state;
  return {
    ...storyboard,
    beats: storyboard.beats.map((beat) => ({
      ...beat,
      speakerCharacterId: beat.speakerCharacterId ? map(beat.speakerCharacterId) : beat.speakerCharacterId,
      openingState: remapState(beat.openingState),
      closingState: remapState(beat.closingState),
      ...(beat.props
        ? {
            props: beat.props.map((prop) => ({
              ...prop,
              holderCharacterId: prop.holderCharacterId ? map(prop.holderCharacterId) : prop.holderCharacterId,
            })),
          }
        : {}),
    })),
  };
}

/** A completed result is current only if its immutable dependencies are current. */
export function currentSceneTask(
  tasks: FilmTask[],
  scene: FilmScene,
  kind: FilmKind,
  audioMode: "native" | "fixed" | "dubbed",
): FilmTask | undefined {
  const candidates = tasks
    .filter(
      (t) =>
        t.scene_id === scene.id &&
        t.scene_version === scene.version &&
        t.status === "completed" &&
        t.kind === kind,
    )
    .sort(byAcceptanceThenRecency);
  if (kind === "image") {
    const first = scene.storyboard?.referencePlan?.referenceImages[0];
    if (first)
      return candidates.find((task) => task.input.referenceImageId === first.id);
    return candidates.find(
      (task) =>
        !task.input.referenceImageId ||
        task.input.referenceImageId === "legacy_start",
    );
  }
  if (kind === "video") {
    const image = currentSceneTask(tasks, scene, "image", audioMode),
      audio = currentSceneTask(tasks, scene, "tts", audioMode);
    const referenceTaskIds = sceneReferenceImageTasks(tasks, scene)
      .map(({ task }) => task?.id)
      .filter(Boolean);
    return candidates.find(
      (t) =>
        (Array.isArray(t.input.referenceTaskIds)
          ? referenceTaskIds.length === t.input.referenceTaskIds.length &&
            referenceTaskIds.every((id) =>
              (t.input.referenceTaskIds as string[]).includes(id!),
            )
          : t.input.imageTaskId === image?.id) &&
        (!scene.dialogue ||
          audioMode === "native" ||
          (audioMode === "dubbed"
            ? speechTasks(tasks, scene).every(
                (a) =>
                  !!a &&
                  Array.isArray(t.input.audioTaskIds) &&
                  t.input.audioTaskIds.includes(a.id),
              )
            : t.input.audioTaskId === audio?.id)),
    );
  }
  if (kind === "dub") {
    const video = currentSceneTask(tasks, scene, "video", audioMode);
    return candidates.find((t) => !!video && t.input.videoTaskId === video.id);
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
      finalClipKind(scene, audioMode),
      audioMode,
    );
    return candidates.find((t) => !!video && t.input.videoTaskId === video.id);
  }
  return candidates[0];
}

/** Current detailed reference tasks in the order authored by the director. */
export function sceneReferenceImageTasks(
  tasks: FilmTask[],
  scene: FilmScene,
): Array<{ referenceId: string; task?: FilmTask }> {
  const plan = scene.storyboard?.referencePlan;
  if (!plan) {
    return [{
      referenceId: "legacy_start",
      task: currentSceneTask(tasks, scene, "image", "dubbed"),
    }];
  }
  return plan.referenceImages.map((reference) => ({
    referenceId: reference.id,
    task: tasks
      .filter(
        (task) =>
          task.kind === "image" &&
          task.scene_id === scene.id &&
          task.scene_version === scene.version &&
          task.input.referenceImageId === reference.id &&
          task.status === "completed",
      )
      .sort(byAcceptanceThenRecency)[0],
  }));
}

export function referencePackReady(tasks: FilmTask[], scene: FilmScene) {
  return sceneReferenceImageTasks(tasks, scene).every(({ task }) =>
    isAcceptedTask(task),
  );
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

export function finalClipKind(
  scene: Pick<FilmScene, "dialogue">,
  mode: FilmPlan["audio_mode"],
): FilmKind {
  return !scene.dialogue || mode === "native"
    ? "video"
    : mode === "dubbed"
      ? "dub"
      : "lip_sync";
}

/** Every utterance owns a speaker and an approved voice version; never infer from array position. */
/**
 * Người nói chưa có giọng được duyệt. Đây là một TRẠNG THÁI BÌNH THƯỜNG của quy
 * trình, không phải hỏng hóc: lượt sản xuất quay về bước chuẩn bị cho tới khi
 * có người duyệt giọng. Có lớp lỗi riêng để `speechTasks` chỉ nuốt đúng trường
 * hợp này, còn mọi lỗi khác vẫn nổi lên thay vì biến thành "chưa có thoại".
 */
export class VoiceNotApprovedError extends Error {}

export function speechLines(scene: FilmScene) {
  const beats = scene.storyboard?.beats || [
    {
      startSeconds: 0,
      endSeconds: scene.duration_seconds,
      speakerCharacterId: scene.speaker_character_id,
      dialogue: scene.dialogue,
    },
  ];
  return beats.flatMap((b, beatIndex) => {
    if (!b.dialogue.trim()) return [];
    const cast = scene.cast_snapshot.find(
      (c) => c.characterId === b.speakerCharacterId,
    );
    if (!cast?.voice)
      throw new VoiceNotApprovedError(
        `Duyệt giọng của ${cast?.name || "người nói"} trước.`,
      );
    return [
      {
        beatIndex,
        dialogue: b.dialogue,
        speakerCharacterId: cast.characterId,
        voice: cast.voice,
        startSeconds: b.startSeconds,
        endSeconds: b.endSeconds,
      },
    ];
  });
}

/**
 * Keep the approved voice identity, but direct the delivery from the exact
 * storyboard beat. A voice profile describes who is speaking; this describes
 * how that person performs this particular line.
 */
export function speechDirection(
  scene: FilmScene,
  beatIndex: number,
  baseDirection: unknown,
) {
  const base = String(baseDirection || "Nói tiếng Việt tự nhiên.").trim();
  const beat = scene.storyboard?.beats[beatIndex];
  const speaker = beat
    ? scene.cast_snapshot.find(
        (character) => character.characterId === beat.speakerCharacterId,
      )
    : undefined;
  const identityLock = [
    `VOICE IDENTITY LOCK: đây luôn là đúng giọng của ${speaker?.name || "nhân vật"}.`,
    "Giữ nguyên tuyệt đối tuổi, giới tính, cao độ nền, âm sắc, độ vang và khẩu âm như Audio profile ở mọi câu trong cùng phim.",
    "Cảm xúc chỉ thay đổi nhịp, hơi thở, cường độ và khoảng ngắt; không biến thành một người nói khác.",
  ].join(" ");
  const dialogue = beat?.dialogue || scene.dialogue || "";
  const targetSeconds = spokenSeconds(dialogue);
  const pacing = dialogue.trim()
    ? [
        `SHORT-FORM PACING (${SHORT_FORM_SPEECH_POLICY_VERSION}): nói lanh, tự nhiên và dứt câu; hoàn thành nguyên văn trong khoảng ${targetSeconds.toFixed(2)} giây.`,
        "Bắt đầu nói ngay, không lấy hơi mở đầu, không kéo nguyên âm, không dùng nhịp phát thanh hoặc kể chuyện chậm.",
        "Dấu ba chấm chỉ là một nhịp ngập ngừng rất ngắn khoảng 0.2 giây, trừ khi storyboard yêu cầu khoảng nghỉ riêng.",
      ].join(" ")
    : "";
  if (!beat) return [base, identityLock, pacing].filter(Boolean).join("\n");
  const performance = beat.performance;
  const acting = [
    beat.action,
    beat.motion,
    performance?.expressionChange,
    performance?.gesture,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 1800);
  if (!acting) return [base, identityLock, pacing].filter(Boolean).join("\n");
  return [
    base,
    identityLock,
    pacing,
    `Hướng diễn riêng cho câu này: ${acting}`,
    "Thể hiện cảm xúc bằng nhịp thở, lực giọng và ngắt nghỉ tự nhiên; vẫn nói trọn đúng nguyên văn, không thêm tiếng hoặc lời ngoài kịch bản.",
  ].join("\n");
}
export function speechTasks(tasks: FilmTask[], scene: FilmScene) {
  let lines: ReturnType<typeof speechLines>;
  try {
    lines = speechLines(scene);
  } catch (error) {
    // Chưa duyệt giọng thì coi như chưa có thoại nào sẵn sàng — đúng ý đồ. Mọi
    // lỗi khác (storyboard hỏng chẳng hạn) phải nổi lên; nuốt tất cả sẽ khiến
    // nextProductionStage kẹt vĩnh viễn ở "prepare" mà không báo gì.
    if (error instanceof VoiceNotApprovedError) return [undefined];
    throw error;
  }
  return lines.map((line) =>
    tasks
      .filter(
        (t) =>
          t.kind === "tts" &&
          t.scene_id === scene.id &&
          t.scene_version === scene.version &&
          t.status === "completed" &&
          t.input.beatIndex === line.beatIndex &&
          t.input.speakerCharacterId === line.speakerCharacterId &&
          t.input.voiceProfileVersion === line.voice.id &&
          ((t.input.providerInputs as Record<string, unknown>)?.text ===
            line.dialogue ||
            t.input.dialogue === line.dialogue),
      )
      .sort(byAcceptanceThenRecency)[0],
  );
}
/** Only called before a new video quote. Existing clips keep their frozen timing. */
export function measuredDubbedScene(
  tasks: FilmTask[],
  scene: FilmScene,
  maxSeconds = 30,
): { scene: FilmScene; measuredSpeechSeconds?: Map<number, number> } {
  const board = scene.storyboard;
  // Dubbed production always uses the measured WAV as its timing source.
  // Older plans do not carry timingPolicy (or a storyboard at all), so do not
  // reject a valid line merely because its authored placeholder is too short.
  // The returned scene is an immutable, per-request revision; the saved plan
  // and existing media remain untouched.
  if (!board) {
    const lines = speechLines(scene);
    const audios = speechTasks(tasks, scene);
    const measuredSpeechSeconds = new Map<number, number>();
    for (const [i, line] of lines.entries()) {
      const duration = Number(audios[i]?.result?.duration);
      if (!audios[i] || !Number.isFinite(duration) || duration <= 0)
        throw new Error("Thiếu audio đã đo thời lượng.");
      measuredSpeechSeconds.set(line.beatIndex, duration);
    }
    const longest = Math.max(...measuredSpeechSeconds.values(), 0);
    const durationSeconds = shotDuration(longest, scene.duration_seconds);
    return {
      scene: { ...scene, duration_seconds: durationSeconds },
      measuredSpeechSeconds,
    };
  }
  const castIds = scene.cast_snapshot.map((c) => c.characterId);
  // For an audio-driven board, authored beat boundaries are editorial targets.
  // Validate the structure first without rejecting a line merely because the
  // pre-TTS heuristic is longer than its placeholder slot. The approved WAV is
  // measured below, then the rebuilt board is validated against real timing.
  const structuralSpeechSeconds = new Map<number, number>();
  board.beats.forEach((beat, index) => {
    if (beat.dialogue.trim()) structuralSpeechSeconds.set(index, 0.001);
  });
  validateStoryboard(board, castIds, maxSeconds, structuralSpeechSeconds);
  const lines = speechLines(scene);
  const audios = speechTasks(tasks, scene);
  const measuredSpeechSeconds = new Map<number, number>();
  for (const [i, line] of lines.entries()) {
    const duration = Number(audios[i]?.result?.duration);
    if (!audios[i] || !Number.isFinite(duration) || duration <= 0)
      throw new Error("Thiếu audio đã đo thời lượng.");
    measuredSpeechSeconds.set(line.beatIndex, duration);
  }
  let cursor = 0;
  const beats = board.beats.map((beat, index) => {
    const speech = measuredSpeechSeconds.get(index);
    const duration = speech === undefined
      ? beat.endSeconds - beat.startSeconds
      : speech + Math.max(0.1, beat.pauseAfterSeconds ?? 0.15);
    const startSeconds = cursor;
    cursor = Math.ceil((cursor + duration) * 1000) / 1000;
    return { ...beat, startSeconds, endSeconds: cursor };
  });
  const durationSeconds = Math.max(4, Math.ceil(cursor + 0.15));
  if (durationSeconds > maxSeconds)
    throw new Error(`Thoại thật vượt ${maxSeconds} giây. Chia lại đoạn trước khi mua video; không cắt hoặc tăng tốc lời.`);
  const storyboard = validateStoryboard(
    { ...board, beats, durationSeconds, contentEndSeconds: cursor },
    castIds,
    maxSeconds,
    measuredSpeechSeconds,
  );
  return {
    scene: { ...scene, storyboard, duration_seconds: durationSeconds },
    measuredSpeechSeconds,
  };
}
/** Freeze an audio schedule only after durations have been measured. Never cut or speed up speech. */
export function dubbingSchedule(tasks: FilmTask[], scene: FilmScene) {
  const audio = speechTasks(tasks, scene);
  let spokenUntil = 0;
  return speechLines(scene).map((line, index) => {
    const task = audio[index],
      duration = Number(task?.result?.duration);
    if (!task || !Number.isFinite(duration) || duration <= 0)
      throw new Error("Thiếu audio đã đo thời lượng.");

    // Storyboard timestamps are editorial targets. TTS is the timing source of
    // truth, so let a line borrow unused time later in the same scene instead
    // of rejecting a natural read for crossing an arbitrary beat boundary.
    // We preserve the planned start when possible and never overlap, cut or
    // speed up speech.
    const startSeconds = Math.max(line.startSeconds, spokenUntil);
    const spokenEnd = startSeconds + duration;
    const endSeconds = spokenEnd + 0.1;
    if (endSeconds > scene.duration_seconds + 0.05)
      throw new Error(
        `Thoại đến lượt ${line.beatIndex + 1} dài hơn toàn cảnh. Rút gọn thoại hoặc tăng thời lượng cảnh trước khi tạo video.`,
      );
    spokenUntil = spokenEnd;
    return {
      audioTaskId: task.id,
      beatIndex: line.beatIndex,
      speakerCharacterId: line.speakerCharacterId,
      voiceProfileVersion: line.voice.id,
      voice: line.voice.voice_id,
      dialogue: line.dialogue,
      startSeconds,
      endSeconds,
      duration,
    };
  });
}
