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
  "object_pov",
  "hands_insert",
  "high_angle_down",
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
  object_pov: {
    direction:
      "máy đặt bên trong một đồ vật nhìn ra (trong tủ lạnh, ngăn kéo, nồi, hộp cơm), viền đồ vật lọt khung, bé ghé mặt vào sát ống kính, cận",
    showsFeet: false,
    use: "góc lạ ngay sau hook: bé bắt quả tang người xem hoặc mở đồ ra",
  },
  hands_insert: {
    direction:
      "cận đôi tay bé đang làm việc (đếm tiền, bấm điện thoại, chỉ vào đồ vật), không thấy mặt, máy tĩnh",
    showsFeet: false,
    use: "chèn bằng chứng: con số, món đồ, việc tay đang làm",
  },
  high_angle_down: {
    direction:
      "máy ở tầm mắt người lớn chĩa xuống, bé nhỏ dưới chân ngước lên nhìn ống kính, thấy toàn thân",
    showsFeet: true,
    use: "bé bị mắng, xin xỏ, hoặc nhấn người lớn đang nhìn xuống",
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
    "object_pov",
    "hands_insert",
    "high_angle_down",
  ],
  cooking_show: [
    "studio_counter",
    "studio_top_down",
    "studio_face_close",
    "phone_pov_hand",
    "hands_insert",
  ],
  phone_vlog: [
    "vlog_tele",
    "phone_ultrawide_low",
    "phone_follow_back",
    "phone_wide_tiny",
    "phone_pov_hand",
    "phone_face_push",
    "hands_insert",
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
  talk_to_camera: `ĐỊNH DẠNG BÉ NÓI VỚI NGƯỜI XEM (khoảng 60 giây):
• Tiền đề: một nỗi khổ người lớn ai cũng gặp (lương về ba ngày đã hết, sáng thứ Hai, ăn khuya, lướt điện thoại tới 2 giờ, đầu tư theo hội, "ăn gì cũng được", giới trẻ bây giờ) do một em bé nói, hoặc em bé đóng vai bố mẹ/sếp/đàn anh mắng thẳng người xem. Hài đến từ chênh lệch: chuyện người lớn × thân hình, giọng và cảm xúc em bé, rồi được đẩy lên bằng lặp lại và leo thang. Không giảng đạo, không chơi chữ.
• Người xem là người đối thoại: bé nói thẳng vào ống kính, gọi người xem ("mấy người", "ông", "bạn"), có khi coi người xem là người bị mắng hoặc bị nhờ. Người cầm máy (Bố/Mẹ) là nhân vật thứ hai trong hồ sơ tập nhưng chỉ lọt bàn tay ở mép khung hoặc nói một câu từ ngoài khung; không bao giờ thấy mặt.
• Lượt 1 là hook trong giây đầu: một câu buộc tội, mệnh lệnh hoặc cái tít ("Tiền tui đâu rồi?!", "Dậy!!", "Đặc điểm người cháy túi") kèm hành vi mạnh (nằm vật ra sàn gào, chỉ thẳng vào máy).
• Mỗi lượt là MỘT nơi và một ý, gồm 1–3 câu cực ngắn (mỗi câu 2–8 tiếng, nói được trong 1–2 giây). Phim 60 giây có khoảng 8–10 lượt. action của lượt ghi rõ nơi đó và việc bé đang làm ở đó.
• Nhịp 60 giây: cứ khoảng 15 giây (2 lượt) là một nấc leo thang hoặc một luận điểm; có thể đếm "Một… Hai… Cuối cùng". Khoảng giây 30–40 đổi tông (tủi thân, ngồi quay lưng, im lặng) rồi bùng lại. Ngay trước câu chốt là một nhịp im, bé nhìn chằm chằm vào máy.
• Kết bằng MỘT trong: (a) mẹo người lớn có thật, có con số và làm được ngay, nói sau một câu nhượng bộ ("Đâu bắt bỏ hẳn… Nhưng lương về thì rút trước một trăm nghìn cất riêng"); (b) đảo ngược làm lộ tẩy ("Ủa… hôm nay thứ Bảy mà"); (c) đổi giọng sang lễ phép ("…được không ạ?"); (d) nói thẳng với người còn đang xem hoặc mồi bình luận ("Tức thì bình luận đi. Dù sao tui vẫn đúng"); (e) lặp nguyên văn câu mở để video tự vòng lại. Câu cuối ngắn, nói nhỏ, mặt lạnh — không la.`,
  cooking_show: `ĐỊNH DẠNG BÉ VÀO BẾP (khoảng 60 giây):
• Bé đóng vai đầu bếp/người dạy nấu rất tự tin, dạy một món Việt thật theo đúng thứ tự công thức (trứng chiên, mì gói, bánh mì kẹp, cơm chiên, gỏi cuốn…). Mỗi lượt là một bước nhìn thấy được (đổ, đập, khuấy, cuộn, nêm) và lời nói khớp đúng việc tay đang làm.
• Hài đến từ lời nói ngược với việc làm và tự biện hộ: nói "rưới mỏng thôi" mà đổ cả chén; "thêm chút nữa" lặp hai ba lần; hỏng thì đổi định nghĩa ("Không phải bể. Nó vốn vậy"). Để hình ảnh tự lộ, không ai nói toạc ra.
• Mẹo nấu ăn có thật nằm rải trong thân phim (một hai mẹo), không dồn ở cuối.
• Kết bằng hậu quả thể chất khi nếm (cay đỏ mặt, nóng, ngon tới mức im lặng) và một câu chốt ngắn đổi giọng: lễ phép ("Cho con xin ly nước ạ") hoặc rút lá bài em bé ("Con còn nhỏ xíu mà").`,
  phone_vlog: `ĐỊNH DẠNG VLOG / TIỂU PHẨM ĐI CHƠI (60–90 giây):
• Hai nhân vật (chị em, hoặc bé đóng vai cặp đôi, sếp–nhân viên) trong một chuyến đi có thật; tiền đề là một tình huống ai cũng gặp (người yêu bắt chụp hình, "ăn gì cũng được", đi chơi với sếp).
• Shot rất ngắn (2–3 giây), phần lớn diễn câm: cận phản ứng, liếc mắt, cảnh chèn đồ vật/đôi chân. Lời thưa: 1 câu ngắn mỗi lượt, nhiều lượt không lời.
• Mức xưng hô chính là trò đùa (nhân viên nói "dạ… ạ", sếp nói trống không).
• Kết bằng đảo ngược rồi lặp lại nguyên văn câu mở hoặc một câu hỏi lễ phép mà xát muối, để video tự vòng lại.`,
};

/**
 * Luật chung về trang phục, bối cảnh, lời và diễn — rút từ 19 video của kênh
 * mẫu (docs/film-direction-playbook.md). Áp cho mọi định dạng mới.
 */
export const COMEDY_CRAFT_RULES = `TAY NGHỀ HÀI ĐỜI THƯỜNG:
• TRANG PHỤC: nhân vật có một bộ đồ thường ngày nhận diện (trong ảnh chuẩn) — mặc nó khi bé "nói chuyện thật". Khi bé ĐÓNG VAI thì khai wardrobe một bộ đồ của vai cho cả tập (vest cà vạt đi phỏng vấn, đồ ngủ sáng thứ Hai, mũ và áo đầu bếp, bộ đồ thú bông, kính râm + dây chuyền khi làm màu, ria mép dán khi làm sếp). Bộ đồ càng dễ thương thì lời càng phải ngược với nó. Phụ kiện được thêm/bỏ đúng lúc làm cú chốt (tháo kính khi bị lộ). Hai nhân vật cùng khung thì tách màu rõ.
• BỐI CẢNH: mỗi câu đặt ở đúng nơi chuyện đó xảy ra ngoài đời Việt Nam và bé đang làm đúng việc mình nói (than tiền điện cạnh đồng hồ điện, nói chuyện kẹt xe trên cầu vượt nhìn xuống dòng xe, chê ăn khuya trong quán ốc). Phần lời khuyên chuyển sang nơi yên tĩnh. Ánh sáng đi theo cảm xúc: ban ngày khi la hét, hoàng hôn khi tủi thân, đêm khi nói thật lòng. Toàn cảnh rất xa với em bé tí xíu dùng cho lúc gào bất lực.
• LỜI: câu 2–8 tiếng, mỗi câu một ý. Dùng câu hỏi tu từ bắt quả tang ("Chưa tới chứ gì?", "Tui thua cả quả trứng hả?"), trích lại câu bào chữa của người khác rồi đập lại ("'Năm phút nữa thôi'… Bốn mươi phút!"), con số cụ thể nhỏ (3 ngày, 2 giờ sáng, 10 giây), nhân cách hoá ("Lương ghé chào một cái rồi đi"), liệt kê ba vế, lặp với cường độ tăng dần, câu cửa miệng người lớn ("Hồi tui á hả…"). Phá nhịp bằng một chữ "Ủa?". Chất giọng em bé Việt: "hông", "nè", "chớ", "nha"; xưng "tui" với người xem, "con" khi xin, "em" khi tán chị.
• DIỄN: biên độ cảm xúc rộng trong 60 giây — gào há miệng sát ống kính, nằm lăn ra sàn, khoanh tay dạng chân, chỉ thẳng vào máy, quỳ chắp tay, ngồi quay lưng, liếc ngang, khóc oà rồi tắt ngay. Mặt tỉnh bơ khi ra vẻ chuyên gia, câu chốt luôn mặt lạnh. Cái hài nằm ở hình trái với lời; để người xem tự phát hiện.`;

/** Thời lượng mục tiêu gần đúng theo định dạng; kênh mẫu chốt ở 60 giây. */
export const FORMAT_TARGET_SECONDS: Record<FilmFormat, number | null> = {
  family_scene: null,
  talk_to_camera: 60,
  cooking_show: 60,
  phone_vlog: 60,
};

/** Hướng dẫn chọn định dạng cho bước viết nháp. */
export const FILM_FORMAT_MENU = `family_scene: đối thoại giữa các thành viên trong một bối cảnh; talk_to_camera: một bé nói thẳng với người xem về chuyện người lớn, đổi nơi liên tục; cooking_show: bé dạy nấu một món trên phông đen; phone_vlog: đi chơi hoặc tiểu phẩm hai vai, cắt nhanh, ít lời.`;

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

/**
 * Kênh mascot 3D không được nhận khối LOOK "da người thật": Seedance sẽ biến
 * nhân vật 3D thành người. Giữ ngữ pháp máy điện thoại, đổi chất liệu.
 */
export const FORMAT_LOOK_ANIMATED: Record<FilmFormat, string> = {
  family_scene: "",
  talk_to_camera:
    "LOOK: phim hoạt hình 3D chất lượng rạp nhưng quay như điện thoại cầm tay của người nhà: góc 0.5x thấp, rung tay nhẹ, ánh sáng tại chỗ của bối cảnh. Nhân vật giữ đúng hình khối, chất liệu và màu của ảnh chuẩn; bối cảnh dựng 3D cùng chất. Không chuyển sang người thật, không vẽ 2D.",
  cooking_show:
    "LOOK: chương trình nấu ăn hoạt hình 3D chất lượng rạp: phông đen trơn, softbox mềm, đồ ăn 3D bóng bẩy có hơi nóng. Nhân vật giữ đúng chất liệu ảnh chuẩn; không chuyển sang người thật.",
  phone_vlog:
    "LOOK: vlog du lịch hoạt hình 3D chất lượng rạp, quay như điện thoại cầm tay, nắng thật, xoá phông nhẹ. Nhân vật giữ đúng chất liệu ảnh chuẩn; không chuyển sang người thật.",
};

export type FilmMediumKind = "photoreal" | "animated";

export function formatLook(format: FilmFormat, medium: FilmMediumKind = "photoreal"): string {
  return (medium === "animated" ? FORMAT_LOOK_ANIMATED : FORMAT_LOOK)[format];
}

/** Hồ sơ kênh trước khi có `medium`: look của Bánh Bao là người thật, còn lại là mascot. */
export function filmMediumOfProfile(
  visualDirection: { id?: string; medium?: FilmMediumKind } | null | undefined,
): FilmMediumKind {
  if (visualDirection?.medium) return visualDirection.medium;
  return /real|photo/i.test(String(visualDirection?.id || "")) ? "photoreal" : "animated";
}

/** Định dạng nào cho phép đổi nơi giữa các nhịp trong cùng một clip nguồn. */
export function formatAllowsLocationCuts(format: FilmFormat): boolean {
  return format === "talk_to_camera" || format === "phone_vlog";
}

/** Định dạng nào bắt nhân vật nói thẳng vào ống kính. */
export function formatAddressesCamera(format: FilmFormat): boolean {
  return format === "talk_to_camera" || format === "cooking_show";
}

const FORMAT_MARKER = /\[AIDA_FORMAT=(family_scene|talk_to_camera|cooking_show|phone_vlog)\]\s*/u;

/**
 * Cách quay người dùng chọn ở studio đi cùng ý tưởng như dấu thể loại, để lượt
 * chạy giữ đúng lựa chọn mà không cần thêm cột. Không chọn thì AI tự chọn.
 */
export function markedFormatIntent(intent: string, format: FilmFormat | null) {
  const clean = String(intent || "").replace(FORMAT_MARKER, "");
  if (!format) return clean;
  const genre = clean.match(/^\[AIDA_GENRE=[a-z]+\]\n?/u)?.[0] || "";
  return `${genre}[AIDA_FORMAT=${format}]\n${clean.slice(genre.length)}`;
}

export function filmFormatFromIntent(intent: string | null | undefined): FilmFormat | null {
  return (String(intent || "").match(FORMAT_MARKER)?.[1] as FilmFormat | undefined) || null;
}

export function stripFilmFormatMarker(intent: string) {
  return intent.replace(FORMAT_MARKER, "");
}
