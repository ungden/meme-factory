/**
 * Mã lỗi kỹ thuật là dấu vết điều tra của một lượt sản xuất có trả tiền, nên
 * chúng được giữ nguyên trong `short_film_production_runs.error`,
 * `short_film_tasks.error` và `short_film_script_runs.error`. Việc dịch sang
 * tiếng Việt chỉ xảy ra ở hai biên: phản hồi API và lúc render.
 *
 * Module này an toàn cho client — không import `server-only`.
 */

/** Nhãn công đoạn dùng chung cho câu tiếng Việt có nội suy. */
export const KIND_LABELS: Record<string, string> = {
  image: "ảnh của cảnh",
  voice_design: "thiết kế giọng",
  tts: "giọng nói",
  video: "chuyển động",
  dub: "lồng tiếng",
  lip_sync: "đồng bộ môi",
  transcribe: "soát lời",
  render: "ghép phim",
  frame: "khung nối tiếp",
};

/** Nhãn giai đoạn của một lượt sản xuất. */
export const STAGE_LABELS: Record<string, string> = {
  script: "viết kịch bản",
  script_check: "kiểm tra kịch bản",
  premises: "tìm ý tưởng",
  selection: "chọn phương án",
  draft: "viết bản đầy đủ",
  review: "biên tập",
  shots: "lập phân cảnh",
  prepare: "chuẩn bị hình và tiếng",
  video: "tạo chuyển động",
  finish: "lồng tiếng và hoàn thiện cảnh",
  transcript: "soát lời",
  clip_check: "kiểm tra cảnh",
  check: "kiểm tra cảnh",
  render: "ghép phim",
  ready_review: "chờ duyệt",
};

export function stageLabel(stage: string) {
  return STAGE_LABELS[stage] || stage;
}

export function kindLabel(kind: string) {
  return KIND_LABELS[kind] || kind;
}

/**
 * Mã chỉ dùng nội bộ: chúng không bao giờ tới tay người dùng vì đã bị bắt và
 * xử lý ngay tại chỗ, hoặc chỉ xuất hiện trong log vận hành.
 */
export const INTERNAL_ONLY_CODES = new Set([
  // Bị bắt ngay trong vòng lặp sửa của FamilyScriptDirector.
  "FAMILY_RESPONSE_INVALID",
  "FAMILY_MODEL_REJECTED",
  // Chỉ dùng để định tuyến nội bộ trước khi được dịch thành câu khác.
  "PLAN_MEDIA_INCOHERENT",
  // Lỗi cấu hình phía máy chủ; người dùng cuối không sửa được, quản trị mới sửa.
  "SUPABASE_NOT_CONFIGURED",
]);

const SYSTEM_MAINTENANCE = "Hệ thống đang bảo trì. Bạn thử lại sau ít phút nhé.";

/**
 * Ba câu chung cho mọi lỗi kiểm kịch bản và phân cảnh. Trước đây có khoảng 40
 * câu kiểu "Hãy cho AI dựng lại…", mỗi câu giải thích một luật biên tập mà chủ
 * kênh không làm gì được; thứ họ làm được chỉ là bấm đúng nút.
 */
export const SCRIPT_REWRITE = "Kịch bản tập này chưa ổn. Bấm Viết lại kịch bản nhé.";
export const SCENE_REDO = "Một cảnh chưa ổn. Bấm Làm lại cảnh này nhé.";
export const IDEA_RETRY = "Chưa nghĩ ra ý đủ hay. Bạn thử lại, hoặc gõ ý tưởng cụ thể hơn nhé.";
const PROFILE_MISSING = "Kênh chưa có hồ sơ. Điền hồ sơ kênh trước khi làm phim nhé.";

/**
 * Câu tiếng Việt cho từng mã: nói chuyện gì đã xảy ra và người dùng nên làm gì
 * tiếp theo. Không lộ chi tiết nội bộ.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // ----- Điểm, ngân sách và hạn mức -----
  INSUFFICIENT_POINTS:
    "Kênh hết điểm. Nạp thêm rồi làm tiếp nhé.",
  PRODUCTION_BUDGET_EXCEEDED:
    "Tập này đã chạm mức chi bạn đặt. Nâng mức để làm tiếp, hoặc dừng lại.",
  BUDGET_BELOW_COMMITTED:
    "Mức chi mới thấp hơn số điểm đã dành cho hôm nay. Đặt mức cao hơn phần đó nhé.",
  INVALID_BUDGET:
    "Mức chi chưa đúng. Cần nhập cả mức chi mỗi phim và mỗi ngày, đều là số nguyên dương.",
  PRODUCTION_RATE_LIMIT_DAY:
    "Hôm nay kênh đã làm đủ số phim tối đa. Mai quay lại nhé.",
  PRODUCTION_RATE_LIMIT_MINUTE:
    "Bạn vừa bắt đầu một tập cách đây không lâu. Chờ một phút rồi thử lại.",
  RATE_LIMIT: "Bạn thao tác hơi nhanh. Chờ một chút rồi thử lại.",
  PRICE_BELOW_COST:
    "Chưa làm được lúc này, đội AIDA đang cập nhật giá. Bạn thử lại sau nhé.",
  PRICE_CHANGED:
    "Bảng giá vừa thay đổi. Hãy xem lại giá mới rồi xác nhận lại.",
  QUOTE_EXPIRED:
    "Báo giá đã hết hạn. Lấy báo giá mới rồi chạy lại; bạn chưa bị trừ điểm.",
  QUOTE_NOT_FOUND:
    "Không tìm thấy báo giá này. Hãy lấy báo giá mới.",
  INVALID_PURCHASE: "Gói điểm không hợp lệ. Hãy chọn lại từ bảng giá.",
  IDEMPOTENCY_KEY_REUSED:
    "Mã giao dịch này đã dùng cho một đơn khác. Hãy tải lại trang rồi mua lại.",
  IDEMPOTENCY_PAYLOAD_CONFLICT:
    "Đơn mua này đã được ghi nhận với nội dung khác. Hãy tải lại trang để xem trạng thái thật.",
  TOPUP_CONFIRM_FAILED:
    "Chưa xác nhận được khoản nạp. Hãy liên hệ hỗ trợ kèm mã đơn.",

  // ----- Quyền và phạm vi làm việc -----
  AUTH_REQUIRED: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  OWNER_REQUIRED: "Chỉ chủ kênh mới làm được việc này.",
  WORKSPACE_FORBIDDEN: "Bạn không có quyền trong kênh này.",
  WORKSPACE_OR_ACCESS_CHANGED:
    "Kênh vừa được đặt lại hoặc quyền của bạn vừa thay đổi. Tải lại trang nhé.",
  RUN_CONTROL_FORBIDDEN:
    "Bạn không có quyền điều khiển tập này.",
  MEDIA_PROJECT_MISMATCH:
    "Tệp này không thuộc kênh hiện tại nên không mở được.",

  // ----- Phiên bản và xung đột -----
  VERSION_CONFLICT:
    "Có người vừa sửa nội dung này. Hãy tải lại để xem bản mới nhất rồi thao tác lại.",
  REVIEW_VERSION_CONFLICT:
    "Bản này vừa được duyệt ở nơi khác. Hãy tải lại để xem kết quả mới nhất.",
  RUN_VERSION_CONFLICT:
    "Tập này vừa đổi trạng thái. Tải lại rồi thử lại nhé.",
  PLAN_VERSION_CHANGED:
    "Kịch bản đã có phiên bản mới. Hãy mở lại tập phim để làm việc trên bản mới nhất.",
  PLAN_OR_SCENE_VERSION_CONFLICT:
    "Kịch bản hoặc cảnh vừa được sửa. Hãy tải lại rồi thao tác lại.",
  SEGMENT_VERSION_CONFLICT:
    "Đoạn phim vừa được sửa ở nơi khác. Hãy tải lại rồi thử lại.",
  DUPLICATE_SCENE: "Cảnh này đã tồn tại trong kịch bản.",

  // ----- Vòng đời lượt sản xuất -----
  RUN_NOT_FOUND: "Không tìm thấy tập này.",
  RUN_NOT_ACTIVE: "Tập này đã kết thúc.",
  PRODUCTION_RUN_NOT_ACTIVE:
    "Tập này đã kết thúc nên không làm tiếp được.",
  RUN_ACTION_INVALID: "Không làm được việc này với trạng thái hiện tại của tập.",
  RUN_QUOTE_MISMATCH:
    "Báo giá không thuộc tập này. Lấy báo giá mới nhé.",
  TASK_RUN_MISMATCH: "Bước này không thuộc tập này.",
  RUN_LEASE_LOST:
    "Tập này đang được xử lý ở nơi khác. Tải lại để xem trạng thái mới nhất nhé.",
  WATERMARK_LEASE_LOST:
    "Việc đóng logo đang được xử lý ở nơi khác. Tải lại trang nhé.",
  STAGE_ALREADY_RUNNING:
    "Công đoạn này đang chạy. Hãy chờ nó xong rồi thao tác tiếp.",
  JOB_ACTIVE: "Đang có một việc chạy dở. Hãy chờ nó hoàn tất.",
  SCRIPT_RESULT_MISSING:
    "Kết quả kịch bản chưa được lưu lại. Hãy chạy lại bước viết kịch bản.",
  SCRIPT_STAGE_FAILED:
    "Một bước viết kịch bản không hoàn tất. Hãy thử lại hoặc đổi ý tưởng.",
  RENDER_OUTPUT_NOT_LINKED:
    "Phim đã ghép xong nhưng chưa gắn được vào thư viện. Hãy liên hệ hỗ trợ.",
  PRODUCTION_ADVANCE_FAILED:
    "Tập phim gặp trục trặc. Bấm Làm tiếp; phần đã xong vẫn còn.",
  RESULT_NOT_READY: "Kết quả chưa sẵn sàng. Hãy chờ thêm một chút.",
  OUTPUT_NOT_FOUND: "Không tìm thấy bài này.",
  OUTPUT_NOT_COMPLETE: "Bài chưa xong nên chưa duyệt được.",
  OUTPUT_REQUIRED: "Chọn một bài trước khi duyệt.",
  INVALID_REVIEW_STATUS: "Trạng thái duyệt không hợp lệ.",
  INVALID_SETTLEMENT: "Dữ liệu thanh toán không hợp lệ.",
  INVALID_CHECK: "Kết quả kiểm tra không hợp lệ.",
  INVALID_LIMIT: "Giới hạn không hợp lệ.",
  INVALID_BATCH: "Lô công việc không hợp lệ.",
  INVALID_SOURCE: "Nguồn không hợp lệ.",
  INVALID_SCENES: "Danh sách cảnh không hợp lệ.",
  EMPTY_SCRIPT: "Kịch bản đang trống.",
  SCENE_PROJECT_MISMATCH: "Cảnh này không thuộc kênh hiện tại.",
  SCENE_EXCEEDS_MODEL_DURATION:
    "Cảnh dài quá mức cho phép. Chia nhỏ cảnh hoặc đổi chất lượng.",
  INVALID_VIDEO_MODEL: "Chất lượng đã chọn không dùng được.",

  // ----- Đoạn phim và biên tập -----
  SEGMENT_INDEX_INVALID: "Vị trí đoạn phim không hợp lệ.",
  SEGMENT_RANGE_INVALID: "Khoảng cắt không hợp lệ.",
  SEGMENT_REVISION_INVALID: "Phiên bản đoạn phim không hợp lệ.",
  SEGMENT_SCOPE_MISMATCH: "Đoạn phim không thuộc tập phim này.",
  SEGMENT_SOURCE_INVALID: "Nguồn của đoạn phim không hợp lệ.",
  SEGMENT_TASK_SCOPE_MISMATCH: "Công đoạn không thuộc đoạn phim này.",
  EDIT_MANIFEST_SCOPE_MISMATCH: "Bản dựng không thuộc tập phim này.",

  // ----- Kịch bản và phân cảnh -----
  // Chủ kênh không tự sửa được lỗi kiểm kịch bản; họ chỉ bấm được một trong
  // hai nút. Chi tiết từng luật nằm ở ERROR_DETAILS cho quản trị và log.
  STORY_STRUCTURE_INVALID: SCRIPT_REWRITE,
  STORY_BEATS_INVALID: SCRIPT_REWRITE,
  STORY_WANTS_INVALID: SCRIPT_REWRITE,
  STORY_DIALOGUE_INVALID: SCRIPT_REWRITE,
  STORY_DIALOGUE_LINE_TOO_LONG: SCRIPT_REWRITE,
  STORY_WORDS: SCRIPT_REWRITE,
  STORY_SHOT_LIMIT: SCRIPT_REWRITE,
  STORY_LINES_TOO_ADULT: SCRIPT_REWRITE,
  STORY_TOO_FEW_TURNS: SCRIPT_REWRITE,
  STORY_GAME_INVALID: SCRIPT_REWRITE,
  STORY_COUNTERPLAY_INVALID: SCRIPT_REWRITE,
  FAMILY_EPISODE_BRIEF_INVALID: SCRIPT_REWRITE,
  FAMILY_EDITORIAL_REVIEW_REQUIRED: SCRIPT_REWRITE,
  STORY_LINE_ADULT_REGISTER: SCRIPT_REWRITE,
  STORY_SHOTS_MISSING: SCRIPT_REWRITE,
  STORY_SHOT: SCENE_REDO,
  STORY_ENDING_INVALID: SCRIPT_REWRITE,
  STORY_ENDING_REQUIRED: SCRIPT_REWRITE,
  STORY_COMIC_PREMISE_INVALID: SCRIPT_REWRITE,
  STORY_COMIC_PREMISE_REQUIRED: SCRIPT_REWRITE,
  STORY_GENRE_INVALID: "Cách kể chưa đúng. Chọn Hài hoặc Cảm động rồi thử lại nhé.",
  STORY_VERSION_INVALID: "Bản kịch bản này đã cũ. Tải lại trang rồi mở lại tập nhé.",
  STORY_EMOTIONAL_ARC_INVALID: SCRIPT_REWRITE,
  STORY_EMOTIONAL_ARC_REQUIRED: SCRIPT_REWRITE,
  STORY_EMOTIONAL_CAUSE_UNGROUNDED: SCRIPT_REWRITE,
  STORY_EMOTIONAL_LANE_REQUIRED: SCRIPT_REWRITE,
  STORY_COMEDY_LANE_REQUIRED: SCRIPT_REWRITE,
  STORY_PERFORMANCE_LANE_INVALID: SCRIPT_REWRITE,
  STORY_FILM_FORMAT_INVALID: SCRIPT_REWRITE,
  CHARACTER_IMAGE_CHARGE_FAILED: "Chưa trừ được điểm cho ảnh nhân vật. Hãy thử lại.",
  MEME_REFERENCE_FETCH_FAILED: "Không đọc được ảnh nhân vật để làm meme. Hệ thống sẽ tự thử lại.",
  MEME_COPY_EMPTY: "Chưa viết được chữ cho meme này. Hệ thống sẽ tự thử lại.",
  MEME_CHARGE_FAILED: "Chưa trừ được điểm cho meme. Hệ thống sẽ tự thử lại.",
  MEME_RUN_GAVE_UP: "Đã thử ba lần mà chưa làm được meme này. Bạn làm lại nhé, có thể với ý tưởng khác.",
  FILM_PACK_INVALID: "Bộ ảnh nhân vật chưa dùng được. Vẽ lại nhé.",
  FILM_PACK_INCOMPLETE: "Bộ ảnh nhân vật cần ít nhất ảnh cận mặt và ảnh toàn thân.",
  CHARACTER_NOT_FOUND: "Không tìm thấy nhân vật trong kênh này.",
  STORY_WARDROBE_INVALID: SCRIPT_REWRITE,
  STORY_FILM_FORMAT_GENRE: SCRIPT_REWRITE,
  STORY_REPEATED_COMBINATION: "Ý tưởng này trùng với một tập đã có. Đổi ý tưởng, hoặc để trống cho AIDA tự nghĩ tập mới nhé.",
  STORY_GUESTS_INVALID: SCRIPT_REWRITE,
  STORY_GUEST_KEY_INVALID: SCRIPT_REWRITE,
  STORY_GUEST_DESCRIPTION_REQUIRED: "Khách mời cần mô tả ngoại hình rõ hơn để vẽ được. Thêm vài chữ rồi lưu lại nhé.",
  STORY_GUEST_UNDECLARED: SCRIPT_REWRITE,
  FAMILY_EDITORIAL_NEEDS_REVIEW: SCRIPT_REWRITE,
  FAMILY_PREMISES_NEED_REVIEW: IDEA_RETRY,
  FAMILY_PREMISES_MISSING: IDEA_RETRY,
  FAMILY_PREMISES_INVALID: IDEA_RETRY,
  FAMILY_PREMISES_DUPLICATED: IDEA_RETRY,
  FAMILY_PREMISES_DOMAIN_NARROW: IDEA_RETRY,
  FAMILY_SELECTION_INVALID: IDEA_RETRY,
  FAMILY_DRAFT_MISSING: SCRIPT_REWRITE,
  FAMILY_REVIEW_MISSING: SCRIPT_REWRITE,
  FAMILY_EDITORIAL_REVIEW_INVALID: SCRIPT_REWRITE,
  FAMILY_DIALOGUE_CHANGED: SCENE_REDO,
  FAMILY_PLAN_INVALID: SCENE_REDO,
  FAMILY_WRITING_TIMEOUT: "Viết kịch bản lâu hơn bình thường nên đã dừng. Bấm Viết lại kịch bản nhé.",
  FAMILY_CHECKPOINT_SAVE_FAILED: "Chưa lưu được tiến độ viết kịch bản. Bấm Viết lại kịch bản nhé.",
  FAMILY_CHANNEL_PROFILE_MISSING: PROFILE_MISSING,
  FAMILY_CHANNEL_PROFILE_V11_MISMATCH: "Hồ sơ kênh cần cập nhật. Mở Cài đặt kênh, bấm Lưu rồi thử lại nhé.",
  CHANNEL_PROFILE_REQUIRED: PROFILE_MISSING,
  STORYBOARD_INVALID: SCENE_REDO,
  STORYBOARD_GROUPING_FAILED: SCENE_REDO,
  STORYBOARD_TIMING_POLICY_INVALID: SCENE_REDO,
  STORYBOARD_FILM_FORMAT_INVALID: SCENE_REDO,
  STORYBOARD_PROP_IDENTITY_CHANGED: SCENE_REDO,
  STORYBOARD_SEGMENT_STATE_INVALID: SCENE_REDO,
  STORYBOARD_LINE_TOO_LONG: "Một câu thoại dài hơn cảnh chứa nó. Rút gọn câu hoặc tách thành hai cảnh nhé.",
  STORYBOARD_BEAT_INVALID: SCENE_REDO,
  STORYBOARD_DURATION_INVALID: SCENE_REDO,
  STORYBOARD_GROUP_TOO_LONG: SCENE_REDO,
  STORYBOARD_DERIVED_FIELDS_CONFLICT: SCENE_REDO,
  STORYBOARD_NATIVE_REQUIRED: "Kiểu âm thanh này cần chia cảnh khác. Chọn Lồng tiếng theo từng nhân vật rồi lưu lại nhé.",
  STORYBOARD_SINGLE_SPEAKER_SYNC_UNSUPPORTED: "Cảnh nhiều người nói không dùng được kiểu một giọng đọc. Tách thành các cảnh một người nói nhé.",
  PERFORMANCE_DIRECTION_INVALID: SCENE_REDO,
  PERFORMANCE_DIRECTION_WEAK: SCENE_REDO,
  PERFORMANCE_LANE_MIXED: SCENE_REDO,
  CREATIVE_PERFORMANCE_DIRECTION_MISSING: SCENE_REDO,
  SHOT_DIRECTION_EMPTY: SCENE_REDO,
  REFERENCE_PLAN_INVALID: SCENE_REDO,
  REFERENCE_PLAN_SHAPE_INVALID: SCENE_REDO,
  REFERENCE_PLAN_ITEM_INVALID: SCENE_REDO,
  REFERENCE_REQUIREMENT_UNCOVERED: SCENE_REDO,

  // ----- Trợ lý sáng tạo -----
  CREATIVE_ASSIST_INVALID_JSON: "Kết quả vừa viết chưa đọc được. Bạn thử lại nhé.",
  CREATIVE_ASSIST_IDEAS_INVALID: IDEA_RETRY,
  CREATIVE_ASSIST_IDEA_DOMAINS_NARROW:
    "Ba ý tưởng đang quanh quẩn trong một bối cảnh. Thử lại để có chuyện ở những nơi khác nhau nhé.",
  CREATIVE_ASSIST_IMAGE_INVALID: "Gợi ý ảnh chưa dùng được. Bạn thử lại nhé.",
  CREATIVE_ASSIST_CLIP_INVALID: "Gợi ý cảnh quay chưa dùng được. Bạn thử lại nhé.",
  CREATIVE_ASSIST_PLAN_INVALID: SCRIPT_REWRITE,
  CREATIVE_ASSIST_SCENE: SCENE_REDO,
  CREATIVE_ASSIST_REVISION_INVALID: "Bản sửa chưa dùng được. Bạn thử lại nhé; bản cũ vẫn giữ.",
  CREATIVE_ASSIST_FAILED: "Chưa viết được lúc này. Bạn thử lại nhé.",
  CREATIVE_RESULT_SAVE_FAILED:
    "Không lưu được kết quả. Hãy thử lại; nội dung cũ vẫn được giữ.",
  CREATIVE_REVISION_SCENES_CHANGED:
    "Số cảnh đã thay đổi so với bản đang sửa. Hãy tải lại rồi sửa lại.",
  CREATIVE_REVISION_LOCKED_SCENE_CHANGED:
    "Bản sửa đụng vào cảnh đã khoá. Hãy tải lại rồi thử lại.",
  CREATIVE_REVISION_STORYBOARD_LOST:
    "Bản sửa làm mất phân cảnh của một cảnh. Hãy thử lại.",

  // ----- Kiểm tra tự động -----
  AI_QA_INVALID:
    "Không đọc được kết quả kiểm tra tự động. Hãy xem lại cảnh bằng mắt trước khi duyệt.",
  QA_RESULT_TRUNCATED:
    "Kết quả kiểm tra tự động bị cắt giữa chừng. Hãy chạy lại bước kiểm tra.",
  QA_MEDIA_EMPTY: "Tệp cần kiểm tra đang rỗng.",
  QA_MEDIA_TOO_LARGE: "Tệp quá lớn để kiểm tra tự động.",

  // ----- Nhà cung cấp và cấu hình -----
  // Người dùng không sửa được thiếu cấu hình; tên khoá chỉ có ích cho log vận hành.
  AI_KEY_NOT_CONFIGURED: SYSTEM_MAINTENANCE,
  OPENAI_KEY_NOT_CONFIGURED: SYSTEM_MAINTENANCE,
  WAVESPEED_API_KEY_NOT_CONFIGURED: SYSTEM_MAINTENANCE,
  WAVESPEED_WEBHOOK_SECRET_NOT_CONFIGURED: SYSTEM_MAINTENANCE,
  WAVESPEED_PRICE_UNAVAILABLE:
    "Chưa tính được giá lúc này. Thử lại sau ít phút nhé; bạn chưa bị trừ điểm.",
  PROVIDER_TIMEOUT:
    "Máy làm hình phản hồi quá lâu. Thử lại sau ít phút nhé; bạn chưa bị trừ điểm.",
  GENERATION_FAILED: "Chưa làm được. Bạn thử lại nhé.",
  GENERATION_JOB_PERSIST_FAILED:
    "Chưa lưu được yêu cầu. Bạn thử lại nhé.",
  SAFETY_BLOCKED:
    "Nội dung bị bộ lọc an toàn chặn. Đổi mô tả rồi thử lại nhé.",
  MEDIA_SIGN_FAILED: "Không mở được tệp. Hãy tải lại trang rồi thử lại.",

  // ----- Đóng logo -----
  WATERMARK_CHECKPOINT_MISSING: "Thiếu dữ liệu tiến độ đóng logo.",
  WATERMARK_OBJECT_CONFLICT:
    "Tệp đóng logo vừa bị ghi đè. Bạn thử lại nhé.",
  WATERMARK_PROVIDER_OUTPUT_INVALID:
    "Đóng logo chưa thành. Bạn thử lại nhé.",
  WATERMARK_SETTLEMENT_PENDING:
    "Phí đóng logo đang chờ xử lý. Bạn thử lại sau nhé.",
  WATERMARK_UPLOAD_UNVERIFIED:
    "Chưa xác nhận được tệp đã tải lên. Hãy thử lại.",

  // ----- Nội dung đầu vào -----
  VALIDATION_HEADLINE_REQUIRED: "Nhập chữ trên ảnh trước nhé.",
  VALIDATION_CHARACTER_REQUIRED: "Hãy chọn ít nhất một nhân vật.",
  VALIDATION_BACKGROUND_REQUIRED: "Hãy mô tả bối cảnh.",
};

/**
 * Giải thích cụ thể của các mã đã gộp thành câu chung ở trên. Chỉ dùng cho
 * trang quản trị và log vận hành: chủ kênh không làm gì được với chúng.
 */
export const ERROR_DETAILS: Record<string, string> = {
  CREATIVE_ASSIST_IDEAS_INVALID: "Danh sách ý tưởng mô hình trả về sai cấu trúc.",
  CREATIVE_ASSIST_PLAN_INVALID: "Kịch bản mô hình trả về sai cấu trúc.",
  CREATIVE_ASSIST_SCENE: "Một cảnh mô hình trả về sai cấu trúc.",
  STORY_STRUCTURE_INVALID:
    "Bản nháp thiếu phần bắt buộc của một tập.",
  STORY_BEATS_INVALID:
    "Các nhịp truyện chưa hợp lệ: cần một mở đầu, một điểm chốt, và phản ứng chỉ khi thật sự cần.",
  STORY_WANTS_INVALID:
    "Chưa rõ mỗi nhân vật muốn gì.",
  STORY_DIALOGUE_INVALID:
    "Lời thoại chưa hợp lệ: mỗi lượt cần đúng người nói, lời và hành động.",
  STORY_DIALOGUE_LINE_TOO_LONG:
    "Có lượt thoại quá dài để diễn tự nhiên.",
  STORY_WORDS:
    "Lượng lời thoại nằm ngoài khoảng hợp lý cho một tập ngắn.",
  STORY_SHOT_LIMIT:
    "Tập này vượt số cảnh tối đa.",
  STORY_LINES_TOO_ADULT:
    "Lời thoại đang quá dài.",
  STORY_TOO_FEW_TURNS:
    "Tập còn quá ít lượt đối đáp cho một phim ngắn.",
  STORY_GAME_INVALID:
    "Mạch gây cười chưa đủ: thiếu điều bất ngờ, thiếu lần đẩy tới hoặc thiếu câu chốt cuối.",
  STORY_COUNTERPLAY_INVALID:
    "Mạch đối đáp chưa bám vào lời vừa nghe hoặc chưa có điểm kết.",
  FAMILY_EPISODE_BRIEF_INVALID:
    "Hồ sơ riêng của tập chưa đủ động cơ, hiểu biết, quan hệ hoặc căn cứ cho điểm kết.",
  FAMILY_EDITORIAL_REVIEW_REQUIRED:
    "Bản chữ cần đi qua tiêu chuẩn biên tập hiện tại trước khi lập phân cảnh.",
  STORY_LINE_ADULT_REGISTER:
    "Có câu thoại sai giọng nhân vật.",
  STORY_SHOTS_MISSING:
    "Thiếu mô tả cảnh cho một số lượt thoại.",
  STORY_SHOT:
    "Một cảnh trong phân cảnh chưa hợp lệ.",
  STORY_ENDING_INVALID:
    "Điểm dừng của tập chưa đúng chỗ.",
  STORY_ENDING_REQUIRED:
    "Bản nháp chưa nêu điểm dừng.",
  STORY_COMIC_PREMISE_INVALID:
    "Tiền đề của tập chưa rõ.",
  STORY_COMIC_PREMISE_REQUIRED:
    "Bản nháp chưa nêu tiền đề.",
  STORY_GENRE_INVALID:
    "Thể loại kịch bản không hợp lệ. Hãy chọn hài hoặc cảm động rồi thử lại.",
  STORY_VERSION_INVALID:
    "Phiên bản hợp đồng kịch bản không được hỗ trợ. Hãy tải lại bản nháp.",
  STORY_EMOTIONAL_ARC_INVALID:
    "Bản cảm động thiếu chi tiết được gieo, khoảnh khắc nhận ra hoặc hành động thay đổi.",
  STORY_EMOTIONAL_ARC_REQUIRED:
    "Bản cảm động cần chỉ ra nhân vật nhận ra điều gì và hành động thay đổi sau đó.",
  STORY_EMOTIONAL_CAUSE_UNGROUNDED:
    "Ba nhịp gieo chi tiết, nhận ra và thay đổi hành động chưa xuất hiện rõ theo đúng thứ tự trong kịch bản.",
  STORY_EMOTIONAL_LANE_REQUIRED:
    "Bản cảm động phải dùng nhịp diễn kiểu điện ảnh thay vì cấu trúc câu chốt hài.",
  STORY_COMEDY_LANE_REQUIRED:
    "Bản hài không dùng được nhịp kiểu điện ảnh. Hãy chọn nhịp hài phù hợp.",
  STORY_PERFORMANCE_LANE_INVALID:
    "Kiểu diễn của tập không hợp lệ.",
  STORY_FILM_FORMAT_INVALID:
    "Cách quay của tập không hợp lệ.",
  STORY_WARDROBE_INVALID:
    "Trang phục riêng của tập không hợp lệ.",
  STORY_FILM_FORMAT_GENRE:
    "Tập cảm động không quay kiểu nói với người xem hay vào bếp.",
  STORY_REPEATED_COMBINATION:
    "Ý tưởng này trùng với một tập đã có. Hãy đổi ý tưởng hoặc để AI tự đề xuất tập mới.",
  STORY_GUESTS_INVALID:
    "Danh sách khách mời không hợp lệ.",
  STORY_GUEST_KEY_INVALID:
    "Mã khách mời không hợp lệ.",
  STORY_GUEST_DESCRIPTION_REQUIRED:
    "Khách mời cần mô tả ngoại hình đủ rõ để dựng ảnh.",
  STORY_GUEST_UNDECLARED:
    "Kịch bản dùng một khách mời chưa được khai báo.",
  FAMILY_EDITORIAL_NEEDS_REVIEW:
    "Bản nháp chưa đạt yêu cầu biên tập.",
  FAMILY_PREMISES_NEED_REVIEW:
    "Cả ba phương án đều chưa đủ hay. Hãy nêu ý tưởng cụ thể hơn rồi thử lại.",
  FAMILY_PREMISES_MISSING:
    "Chưa có phương án nào để chọn.",
  FAMILY_PREMISES_INVALID:
    "Các phương án AI trả về chưa hợp lệ.",
  FAMILY_PREMISES_DUPLICATED:
    "Ba phương án quá giống nhau.",
  FAMILY_PREMISES_DOMAIN_NARROW:
    "Ba phương án đang quanh quẩn trong một kiểu quan hệ hoặc bối cảnh.",
  FAMILY_SELECTION_INVALID:
    "Kết quả chọn phương án chưa hợp lệ.",
  FAMILY_DRAFT_MISSING:
    "Chưa có bản nháp.",
  FAMILY_REVIEW_MISSING:
    "Bản nháp chưa qua biên tập.",
  FAMILY_EDITORIAL_REVIEW_INVALID:
    "Kết quả biên tập chưa hợp lệ.",
  FAMILY_DIALOGUE_CHANGED:
    "AI đã tự đổi lời thoại khi dựng cảnh.",
  FAMILY_PLAN_INVALID:
    "Phân cảnh AI dựng chưa hợp lệ.",
  FAMILY_WRITING_TIMEOUT:
    "Bước viết kịch bản quá thời gian cho phép.",
  FAMILY_CHECKPOINT_SAVE_FAILED:
    "Không lưu được tiến độ viết kịch bản.",
  FAMILY_CHANNEL_PROFILE_MISSING:
    "Kênh chưa có hồ sơ. Hoàn tất hồ sơ kênh trước khi làm phim nhé.",
  FAMILY_CHANNEL_PROFILE_V11_MISMATCH:
    "Hồ sơ kênh đang ở phiên bản cũ. Hãy cập nhật hồ sơ kênh.",
  CHANNEL_PROFILE_REQUIRED:
    "Kênh chưa có hồ sơ. Hoàn tất hồ sơ kênh trước khi làm phim nhé.",
  STORYBOARD_INVALID:
    "Phân cảnh chưa hợp lệ.",
  STORYBOARD_GROUPING_FAILED:
    "Không chia được phân cảnh thành các clip hợp lệ.",
  STORYBOARD_TIMING_POLICY_INVALID:
    "Nhịp thời gian của phân cảnh chưa hợp lệ.",
  STORYBOARD_FILM_FORMAT_INVALID:
    "Cách quay của phân cảnh không hợp lệ.",
  STORYBOARD_PROP_IDENTITY_CHANGED:
    "Một đạo cụ đổi hình dạng giữa các cảnh.",
  STORYBOARD_SEGMENT_STATE_INVALID:
    "Trạng thái nối giữa các cảnh chưa khớp.",
  STORYBOARD_LINE_TOO_LONG:
    "Một lượt thoại dài hơn thời lượng clip cho phép. Hãy rút gọn lời hoặc tách cảnh.",
  STORYBOARD_BEAT_INVALID:
    "Một nhịp trong phân cảnh chưa hợp lệ: kiểm tra người nói, lời thoại và thời lượng.",
  STORYBOARD_DURATION_INVALID:
    "Nhịp nội dung không nằm trọn trong clip nguồn.",
  STORYBOARD_GROUP_TOO_LONG:
    "Một clip phải chứa nhiều lời hơn thời lượng cho phép.",
  STORYBOARD_DERIVED_FIELDS_CONFLICT:
    "Lời thoại và thời lượng của cảnh không khớp với các nhịp phân cảnh.",
  STORYBOARD_NATIVE_REQUIRED:
    "Chế độ âm thanh này cần phân cảnh dạng khác. Hãy lưu kịch bản sang chế độ lồng tiếng.",
  STORYBOARD_SINGLE_SPEAKER_SYNC_UNSUPPORTED:
    "Cảnh nhiều người nói không dùng được đồng bộ môi một người. Hãy tách thành các cận cảnh.",
  PERFORMANCE_DIRECTION_INVALID:
    "Hướng diễn xuất chưa hợp lệ.",
  PERFORMANCE_DIRECTION_WEAK:
    "Hướng diễn xuất còn chung chung, chưa đủ hành động nhìn thấy được.",
  PERFORMANCE_LANE_MIXED:
    "Các cảnh đang trộn nhiều kiểu diễn khác nhau.",
  CREATIVE_PERFORMANCE_DIRECTION_MISSING:
    "Cảnh thiếu hướng diễn xuất.",
  SHOT_DIRECTION_EMPTY:
    "Cảnh thiếu mô tả hành động.",
  REFERENCE_PLAN_INVALID:
    "Kế hoạch ảnh cho cảnh chưa hợp lệ.",
  REFERENCE_PLAN_SHAPE_INVALID:
    "Kế hoạch ảnh cho cảnh sai cấu trúc.",
  REFERENCE_PLAN_ITEM_INVALID:
    "Một ảnh của cảnh chưa hợp lệ.",
  REFERENCE_REQUIREMENT_UNCOVERED:
    "Có bằng chứng hình ảnh mà câu chuyện cần nhưng chưa ảnh nào thể hiện.",
};

const FALLBACK = "Hệ thống gặp sự cố kỹ thuật. Hãy thử lại sau ít phút.";

/** Mã lỗi luôn có ít nhất một dấu gạch dưới; quy ước này loại các từ viết hoa thường gặp. */
const CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;
const VIETNAMESE = /[àáâãèéêìíòóôõùúýăđĩũơưạ-ỹ]/i;

function textOf(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    // Lỗi PostgREST có dạng { message, code, details, hint }.
    for (const key of ["message", "error", "details", "hint", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "";
}

/** Rút mã lỗi đầu tiên ra khỏi một chuỗi, Error hoặc đối tượng lỗi Postgres. */
export function errorCode(raw: unknown): string | null {
  return textOf(raw).match(CODE_PATTERN)?.[0] || null;
}

/** Tra câu tiếng Việt cho một mã, chấp nhận mã có hậu tố như STORY_WORDS_87. */
export function messageForCode(code: string): string | null {
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  const parts = code.split("_");
  for (let end = parts.length - 1; end >= 2; end--) {
    const prefix = parts.slice(0, end).join("_");
    if (ERROR_MESSAGES[prefix]) return ERROR_MESSAGES[prefix];
  }
  return null;
}

/**
 * Đổi bất kỳ lỗi nào thành câu tiếng Việt. Một thông điệp đã là tiếng Việt thì
 * giữ nguyên; mã không có trong từ điển rơi về câu chung — người dùng không bao
 * giờ thấy MÃ_VIẾT_HOA.
 */
/**
 * Chi tiết cho quản trị và log: giải thích cụ thể của mã đã gộp, hoặc đúng câu
 * người dùng thấy nếu mã đó không gộp.
 */
export function errorDetail(raw: unknown): string {
  const code = errorCode(raw);
  if (!code) return humanizeError(raw);
  const parts = code.split("_");
  for (let end = parts.length; end >= 2; end--) {
    const prefix = parts.slice(0, end).join("_");
    if (ERROR_DETAILS[prefix]) return ERROR_DETAILS[prefix];
  }
  return humanizeError(raw);
}

export function humanizeError(raw: unknown, fallback = FALLBACK): string {
  const text = textOf(raw).trim();
  if (!text) return fallback;
  const code = errorCode(text);
  if (code) {
    const message = messageForCode(code);
    if (message) return message;
    // Mã lạ: nếu phần còn lại đã là câu tiếng Việt thì dùng nó, còn không thì
    // trả câu chung thay vì để lộ mã kỹ thuật.
    const rest = text.replace(CODE_PATTERN, " ").replace(/\s+/g, " ").trim();
    return VIETNAMESE.test(rest) && rest.length > 12 ? rest : fallback;
  }
  return VIETNAMESE.test(text) ? text : fallback;
}
