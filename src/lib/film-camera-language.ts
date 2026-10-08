/**
 * Ngôn ngữ máy quay có tên và định dạng phim.
 *
 * Học từ kênh @쭌이의일상생활 (docs/film-direction-v2.md): thứ làm phim AI trông
 * "thật" không phải máy điện ảnh mà là điện thoại của bố mẹ — 0.5x đặt thấp, dí
 * sát mặt, tay người quay lọt khung. Khi để LLM tự viết `camera`, nó luôn trôi về
 * "máy quay điện ảnh chậm rãi" chung chung; một menu câu lệnh cố định cho kết quả
 * ổn định hơn và kiểm được (preset nào thấy chân, preset nào nhìn ống kính).
 */

export const FILM_FORMATS = [
  "family_scene",
  "talk_to_camera",
  "cooking_show",
  "phone_vlog",
] as const;
export type FilmFormat = (typeof FILM_FORMATS)[number];

export const CAMERA_PRESETS = [
  "phone_ultrawide_low",
  "phone_face_push",
  "phone_selfie_mid",
  "phone_pov_hand",
  "phone_table_static",
  "phone_wide_tiny",
  "phone_follow_back",
  "peephole_fisheye",
  "vox_pop_mic",
  "studio_counter",
  "studio_top_down",
  "studio_face_close",
  "vlog_tele",
  "free",
] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

type PresetSpec = {
  /** Câu gửi thẳng cho Seedance; thuật ngữ máy giữ tiếng Anh vì model đọc chúng ổn định nhất. */
  direction: string;
  /** Khung có thấy bàn chân không: quyết định có đòi kiểm giày dép hay không. */
  showsFeet: boolean;
  /** Ghi chú cho đạo diễn: dùng preset này khi nào. */
  use: string;
};

const PRESETS: Record<Exclude<CameraPreset, "free">, PresetSpec> = {
  phone_ultrawide_low: {
    direction:
      "điện thoại 0.5x ultra-wide cầm tay, đặt thấp ngang tầm mắt bé; bé đứng gần ống kính nên đầu hơi to, thấy toàn thân và hậu cảnh rộng phía sau; rung tay nhẹ tự nhiên",
    showsFeet: true,
    use: "khung chủ đạo khi bé nói với máy ở một nơi mới",
  },
  phone_face_push: {
    direction:
      "điện thoại 0.5x cận mặt: bé tiến sát ống kính đến khi mặt lấp gần hết khung, méo góc rộng nhẹ ở viền, lấy nét vào mắt",
    showsFeet: false,
    use: "câu chốt, la hét, hoặc thì thầm bí mật",
  },
  phone_selfie_mid: {
    direction:
      "điện thoại cầm tay cách một sải tay người lớn, ngang tầm mắt bé, khung bán thân từ ngực trở lên, rung tay nhẹ",
    showsFeet: false,
    use: "nói chuyện bình thường, giải thích",
  },
  phone_pov_hand: {
    direction:
      "góc nhìn người cầm điện thoại: một bàn tay người lớn lọt vào khung từ mép dưới (đưa đồ vật, chỉ tay hoặc chạm vào bé), bé phản ứng với bàn tay đó; khung bán thân, không thấy mặt người lớn",
    showsFeet: false,
    use: "người quay là nhân vật ẩn: đưa đồ ăn, giành điện thoại, chỉ trỏ",
  },
  phone_table_static: {
    direction:
      "điện thoại dựng cố định trên mặt bàn ngang ngực bé, máy đứng yên, bé ngồi đối diện ống kính, khung bán thân",
    showsFeet: false,
    use: "ngồi ăn, ngồi đếm tiền, cảnh bàn làm việc",
  },
  phone_wide_tiny: {
    direction:
      "toàn cảnh xa từ tầm cao người lớn, máy đứng yên: bé nhỏ xíu giữa không gian rộng, thấy trọn người từ đầu đến chân và bối cảnh",
    showsFeet: true,
    use: "nhấn sự nhỏ bé hoặc cô đơn, mở một nơi mới",
  },
  phone_follow_back: {
    direction:
      "máy cầm tay đi theo sau lưng bé ở tầm thấp, thấy toàn thân; bé bước đi rồi quay đầu lại nhìn ống kính",
    showsFeet: true,
    use: "chuyển nơi, bỏ đi giận dỗi",
  },
  peephole_fisheye: {
    direction:
      "ống fisheye kiểu mắt thần cửa, viền khung tròn tối, bé ở giữa khung nhìn thẳng vào ống kính, thấy toàn thân méo cong",
    showsFeet: true,
    use: "nhìn trộm, tình huống bí mật, cảnh vui lạ mắt",
  },
  vox_pop_mic: {
    direction:
      "phỏng vấn đường phố bằng điện thoại: micro lông xám to của phóng viên chĩa vào bé từ mép khung, bé đứng trả lời thẳng vào ống kính, khung bán thân, người qua đường mờ phía sau",
    showsFeet: false,
    use: "format phỏng vấn, bé cho ý kiến về chuyện người lớn",
  },
  studio_counter: {
    direction:
      "studio phông đen trơn, softbox mềm phía trước trên cao, máy tĩnh ngang tầm bé, trung cảnh từ đầu gối trở lên, bé đứng sau quầy bếp với nguyên liệu bày trước mặt",
    showsFeet: false,
    use: "mở món, giới thiệu, nêm nếm",
  },
  studio_top_down: {
    direction:
      "cận từ trên xuống, máy chĩa thẳng xuống mặt bàn: chỉ thấy đôi tay bé và nguyên liệu/chảo, nền phông đen hoặc thớt gỗ, ánh softbox",
    showsFeet: false,
    use: "thao tác tay: đổ, trộn, cuốn, cắt",
  },
  studio_face_close: {
    direction:
      "cận mặt bé trên phông đen, softbox mềm, món ăn mờ ở tiền cảnh, máy tĩnh",
    showsFeet: false,
    use: "nếm thử, phản ứng cay/ngon, câu chốt",
  },
  vlog_tele: {
    direction:
      "điện thoại ống tele 3x cầm tay theo bé, xoá phông tự nhiên, nắng thật, cảm giác vlog du lịch gia đình, thấy toàn thân",
    showsFeet: true,
    use: "đi chơi, khám phá nơi mới, cảnh ít lời",
  },
};

/** Preset được dùng trong từng định dạng. `free` giữ lối viết camera tự do cũ. */
export const FORMAT_CAMERA_PRESETS: Record<FilmFormat, readonly CameraPreset[]> = {
  family_scene: CAMERA_PRESETS,
  talk_to_camera: [
    "phone_ultrawide_low",
    "phone_face_push",
    "phone_selfie_mid",
    "phone_pov_hand",
    "phone_table_static",
    "phone_wide_tiny",
    "phone_follow_back",
    "peephole_fisheye",
    "vox_pop_mic",
  ],
  cooking_show: [
    "studio_counter",
    "studio_top_down",
    "studio_face_close",
    "phone_pov_hand",
  ],
  phone_vlog: [
    "vlog_tele",
    "phone_ultrawide_low",
    "phone_follow_back",
    "phone_wide_tiny",
    "phone_pov_hand",
    "phone_face_push",
  ],
};

export function isFilmFormat(value: unknown): value is FilmFormat {
  return FILM_FORMATS.includes(value as FilmFormat);
}

export function filmFormat(value: unknown): FilmFormat {
  return isFilmFormat(value) ? value : "family_scene";
}

export function isCameraPreset(value: unknown): value is CameraPreset {
  return CAMERA_PRESETS.includes(value as CameraPreset);
}

/**
 * Câu camera gửi Seedance: câu chuẩn của preset đứng trước, phần riêng của đạo
 * diễn (ai lọt khung, hướng đi) theo sau. Preset ngoài định dạng bị bỏ qua
 * thay vì báo lỗi: một nhịp quay lệch kiểu vẫn rẻ hơn bắt viết lại cả tập.
 */
export function cameraDirection(
  preset: unknown,
  detail: string,
  format: FilmFormat = "family_scene",
): string {
  const text = String(detail || "").trim();
  if (!isCameraPreset(preset) || preset === "free") return text;
  if (!FORMAT_CAMERA_PRESETS[format].includes(preset)) return text;
  const base = PRESETS[preset].direction;
  if (!text) return base;
  return `${base}; ${text}`;
}

export function presetShowsFeet(preset: unknown): boolean | undefined {
  if (!isCameraPreset(preset) || preset === "free") return undefined;
  return PRESETS[preset].showsFeet;
}

/** Menu cho đạo diễn storyboard, chỉ gồm preset của định dạng đang dựng. */
export function cameraPresetMenu(format: FilmFormat): string {
  return FORMAT_CAMERA_PRESETS[format]
    .map((id) =>
      id === "free"
        ? "free: tự viết camera (chỉ khi không preset nào hợp)"
        : `${id}: ${PRESETS[id].use}`,
    )
    .join("; ");
}

/**
 * Luật viết cho người soạn kịch bản. Chỉ các định dạng mới có luật riêng;
 * family_scene giữ nguyên chính sách viết hiện tại.
 */
export const FORMAT_WRITING_RULES: Record<FilmFormat, string> = {
  family_scene: "",
  talk_to_camera: `ĐỊNH DẠNG BÉ NÓI VỚI MÁY:
• Một bé chính nói thẳng với người xem qua ống kính suốt phim. Người lớn chỉ là người cầm máy: lọt tay vào khung hoặc nói một câu ngắn từ ngoài khung; không cắt sang mặt họ.
• Hài đến từ tương phản: bé nói chuyện người lớn (lương, sếp, ăn kiêng, đầu tư, hẹn hò, mạng xã hội, "giới trẻ bây giờ") bằng hành vi em bé thật (khóc thét, nằm vật ra sàn, chu môi, liếc, chỉ tay vào máy).
• Mỗi lượt tối đa khoảng 10 từ, nói được trong 1–3 giây. Phim 60 giây cần khoảng 14–22 lượt.
• Lượt 1 là hook trong 1 giây đầu: một câu kêu hoặc câu hỏi thẳng vào máy kèm hành vi mạnh.
• Mỗi lượt diễn ở một nơi cụ thể; đổi nơi khi đổi ý (thường sau 1–2 lượt): chợ, ga tàu, hành lang chung cư, cầu vượt, tiệm tiện lợi, bãi đỗ xe, quán ăn. action ghi rõ nơi đó.
• Kết bằng cận mặt: bé bình tĩnh lại và nói nhỏ câu chốt hoặc lời khuyên đảo ngược.`,
  cooking_show: `ĐỊNH DẠNG BÉ ĐẦU BẾP:
• Bé dạy làm một món thật theo đúng thứ tự công thức; mỗi lượt là một bước nhìn thấy được (đổ, khuấy, cuốn, nếm).
• Lời ngắn, tự tin như đầu bếp thật, xen một hai câu tự khen hoặc cãi khán giả.
• Kết bằng bé nếm và phản ứng thật (cay đỏ mặt, ngon quá, làm hỏng) cùng một câu chốt.`,
  phone_vlog: `ĐỊNH DẠNG VLOG ĐIỆN THOẠI:
• Cả nhà đi một nơi có thật; mỗi lượt là một khoảnh khắc ở một điểm khác nhau của chuyến đi.
• Ít lời: nhiều lượt có thể là nhịp không lời; câu nói ngắn, tự nhiên, như trẻ nói khi chơi.
• Kết ở một khoảnh khắc nhỏ mà ai đi chơi cùng con cũng nhận ra.`,
};

/** Hướng dẫn chọn định dạng cho bước viết nháp. */
export const FILM_FORMAT_MENU = `family_scene: đối thoại giữa các thành viên trong một bối cảnh; talk_to_camera: một bé nói thẳng với người xem về chuyện người lớn, đổi nơi liên tục; cooking_show: bé dạy nấu một món trên phông đen; phone_vlog: cả nhà đi chơi, cắt nhanh, ít lời.`;

/**
 * Khối LOOK gửi kèm mọi clip của định dạng mới. Đây là thứ đẩy Seedance khỏi
 * chất "phim dàn dựng 35–50mm" mà ảnh chuẩn cũ in vào mọi tập.
 */
export const FORMAT_LOOK: Record<FilmFormat, string> = {
  family_scene: "",
  talk_to_camera:
    "LOOK: video quay bằng điện thoại thật của bố mẹ, không phải phim điện ảnh. Ánh sáng có sẵn tại chỗ (đèn huỳnh quang, nắng, đèn đường), HDR và độ nét kiểu điện thoại, rung tay nhẹ, màu không chỉnh điện ảnh, không slow motion, không xoá phông giả. Da trẻ thật có lông tơ và ửng đỏ, nước mũi/nước miếng nhỏ là bình thường.",
  cooking_show:
    "LOOK: video chương trình nấu ăn quay thật: phông đen trơn, softbox mềm, đồ ăn thật có hơi nóng và độ bóng dầu, tay trẻ con vụng về thật. Không CGI, không slow motion quảng cáo.",
  phone_vlog:
    "LOOK: vlog du lịch gia đình quay bằng điện thoại, nắng thật, xoá phông tự nhiên của ống tele, rung tay nhẹ, màu tự nhiên không chỉnh điện ảnh.",
};

/** Định dạng nào cho phép đổi nơi giữa các nhịp trong cùng một clip nguồn. */
export function formatAllowsLocationCuts(format: FilmFormat): boolean {
  return format === "talk_to_camera" || format === "phone_vlog";
}

/** Định dạng nào bắt nhân vật nói thẳng vào ống kính. */
export function formatAddressesCamera(format: FilmFormat): boolean {
  return format === "talk_to_camera" || format === "cooking_show";
}
