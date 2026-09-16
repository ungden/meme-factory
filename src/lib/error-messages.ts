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
  image: "ảnh tham chiếu",
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
  shots: "dựng storyboard",
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

/**
 * Câu tiếng Việt cho từng mã: nói chuyện gì đã xảy ra và người dùng nên làm gì
 * tiếp theo. Không lộ chi tiết nội bộ.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // ----- Điểm, ngân sách và hạn mức -----
  INSUFFICIENT_POINTS:
    "Ví dự án không đủ điểm cho công đoạn này. Hãy nạp thêm điểm rồi tiếp tục.",
  PRODUCTION_BUDGET_EXCEEDED:
    "Lượt làm phim này đã chạm hạn mức điểm bạn đặt. Nâng hạn mức rồi tiếp tục, hoặc dừng lượt.",
  BUDGET_BELOW_COMMITTED:
    "Hạn mức mới thấp hơn số điểm đã cam kết cho hôm nay. Hãy đặt hạn mức cao hơn phần đã dùng.",
  INVALID_BUDGET:
    "Hạn mức không hợp lệ. Cần nhập cả hạn mức mỗi phim và hạn mức mỗi ngày, đều là số nguyên dương.",
  PRODUCTION_RATE_LIMIT_DAY:
    "Dự án đã đạt số lượt làm phim tối đa trong ngày. Hãy quay lại vào ngày mai.",
  PRODUCTION_RATE_LIMIT_MINUTE:
    "Bạn vừa tạo một lượt cách đây không lâu. Chờ một phút rồi thử lại.",
  RATE_LIMIT: "Bạn thao tác hơi nhanh. Chờ một chút rồi thử lại.",
  PRICE_BELOW_COST:
    "Bảng giá đang thấp hơn chi phí thực của nhà cung cấp. Quản trị viên cần cập nhật giá trước khi chạy tiếp.",
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
  OWNER_REQUIRED: "Chỉ chủ dự án mới thực hiện được thao tác này.",
  WORKSPACE_FORBIDDEN: "Bạn không có quyền trong dự án này.",
  WORKSPACE_OR_ACCESS_CHANGED:
    "Dự án đã được đặt lại hoặc quyền của bạn vừa thay đổi. Hãy tải lại trang.",
  RUN_CONTROL_FORBIDDEN:
    "Bạn không có quyền điều khiển lượt sản xuất này.",
  MEDIA_PROJECT_MISMATCH:
    "Tệp này không thuộc dự án hiện tại nên không mở được.",

  // ----- Phiên bản và xung đột -----
  VERSION_CONFLICT:
    "Có người vừa sửa nội dung này. Hãy tải lại để xem bản mới nhất rồi thao tác lại.",
  REVIEW_VERSION_CONFLICT:
    "Bản này vừa được duyệt ở nơi khác. Hãy tải lại để xem kết quả mới nhất.",
  RUN_VERSION_CONFLICT:
    "Lượt sản xuất vừa đổi trạng thái. Hãy tải lại rồi thử lại.",
  PLAN_VERSION_CHANGED:
    "Kịch bản đã có phiên bản mới. Hãy mở lại tập phim để làm việc trên bản mới nhất.",
  PLAN_OR_SCENE_VERSION_CONFLICT:
    "Kịch bản hoặc cảnh vừa được sửa. Hãy tải lại rồi thao tác lại.",
  SEGMENT_VERSION_CONFLICT:
    "Đoạn phim vừa được sửa ở nơi khác. Hãy tải lại rồi thử lại.",
  DUPLICATE_SCENE: "Cảnh này đã tồn tại trong kịch bản.",

  // ----- Vòng đời lượt sản xuất -----
  RUN_NOT_FOUND: "Không tìm thấy lượt sản xuất này.",
  RUN_NOT_ACTIVE: "Lượt sản xuất này đã kết thúc.",
  PRODUCTION_RUN_NOT_ACTIVE:
    "Lượt sản xuất này đã kết thúc nên không tiếp tục được.",
  RUN_ACTION_INVALID: "Thao tác không hợp lệ với trạng thái hiện tại của lượt.",
  RUN_QUOTE_MISMATCH:
    "Báo giá không thuộc lượt sản xuất này. Hãy lấy báo giá mới.",
  TASK_RUN_MISMATCH: "Công đoạn không thuộc lượt sản xuất này.",
  RUN_LEASE_LOST:
    "Lượt sản xuất đã được một tiến trình khác tiếp nhận. Hãy tải lại để xem trạng thái mới nhất.",
  WATERMARK_LEASE_LOST:
    "Công việc đóng dấu đã được tiến trình khác tiếp nhận. Hãy tải lại trang.",
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
    "Lượt sản xuất gặp sự cố kỹ thuật. Hãy thử tiếp tục lại; các kết quả đã xong vẫn được giữ.",
  RESULT_NOT_READY: "Kết quả chưa sẵn sàng. Hãy chờ thêm một chút.",
  OUTPUT_NOT_FOUND: "Không tìm thấy đầu ra này.",
  OUTPUT_NOT_COMPLETE: "Đầu ra chưa hoàn tất nên chưa duyệt được.",
  OUTPUT_REQUIRED: "Cần chọn một đầu ra trước khi duyệt.",
  INVALID_REVIEW_STATUS: "Trạng thái duyệt không hợp lệ.",
  INVALID_SETTLEMENT: "Dữ liệu quyết toán không hợp lệ.",
  INVALID_CHECK: "Kết quả kiểm tra không hợp lệ.",
  INVALID_LIMIT: "Giới hạn không hợp lệ.",
  INVALID_BATCH: "Lô công việc không hợp lệ.",
  INVALID_SOURCE: "Nguồn không hợp lệ.",
  INVALID_SCENES: "Danh sách cảnh không hợp lệ.",
  EMPTY_SCRIPT: "Kịch bản đang trống.",
  SCENE_PROJECT_MISMATCH: "Cảnh này không thuộc dự án hiện tại.",
  SCENE_EXCEEDS_MODEL_DURATION:
    "Cảnh dài hơn giới hạn của model video đang chọn. Hãy chia cảnh hoặc đổi model.",
  INVALID_VIDEO_MODEL: "Model video không hợp lệ.",

  // ----- Đoạn phim và biên tập -----
  SEGMENT_INDEX_INVALID: "Vị trí đoạn phim không hợp lệ.",
  SEGMENT_RANGE_INVALID: "Khoảng cắt không hợp lệ.",
  SEGMENT_REVISION_INVALID: "Phiên bản đoạn phim không hợp lệ.",
  SEGMENT_SCOPE_MISMATCH: "Đoạn phim không thuộc tập phim này.",
  SEGMENT_SOURCE_INVALID: "Nguồn của đoạn phim không hợp lệ.",
  SEGMENT_TASK_SCOPE_MISMATCH: "Công đoạn không thuộc đoạn phim này.",
  EDIT_MANIFEST_SCOPE_MISMATCH: "Bản dựng không thuộc tập phim này.",

  // ----- Kịch bản: cấu trúc chuyện -----
  STORY_STRUCTURE_INVALID:
    "Bản nháp thiếu phần bắt buộc của một tập. Hãy cho AI viết lại.",
  STORY_BEATS_INVALID:
    "Các nhịp truyện chưa hợp lệ: cần một mở đầu, một điểm chốt, và phản ứng chỉ khi thật sự cần. Hãy cho AI viết lại.",
  STORY_WANTS_INVALID:
    "Chưa rõ mỗi nhân vật muốn gì. Hãy cho AI viết lại phần động cơ.",
  STORY_DIALOGUE_INVALID:
    "Lời thoại chưa hợp lệ: mỗi lượt cần đúng người nói, lời và hành động. Hãy cho AI viết lại.",
  STORY_DIALOGUE_LINE_TOO_LONG:
    "Có lượt thoại quá dài để diễn tự nhiên. Hãy cho AI rút gọn hoặc tách thành hai lượt.",
  STORY_WORDS:
    "Lượng lời thoại nằm ngoài khoảng hợp lý cho một tập ngắn. Hãy cho AI viết lại cho vừa.",
  STORY_SHOT_LIMIT:
    "Tập này vượt số cảnh tối đa. Hãy cho AI rút bớt lượt thoại hoặc bỏ cảnh phản ứng.",
  STORY_SHOTS_MISSING: "Thiếu mô tả cảnh cho một số lượt thoại.",
  STORY_SHOT: "Một cảnh trong storyboard chưa hợp lệ. Hãy cho AI dựng lại.",
  STORY_ENDING_INVALID:
    "Điểm dừng của tập chưa đúng chỗ. Hãy cho AI chọn lại điểm kết.",
  STORY_ENDING_REQUIRED:
    "Bản nháp chưa nêu điểm dừng. Hãy cho AI viết lại.",
  STORY_COMIC_PREMISE_INVALID:
    "Tiền đề của tập chưa rõ. Hãy cho AI viết lại.",
  STORY_COMIC_PREMISE_REQUIRED:
    "Bản nháp chưa nêu tiền đề. Hãy cho AI viết lại.",
  STORY_PERFORMANCE_LANE_INVALID:
    "Kiểu diễn của tập không hợp lệ. Hãy cho AI viết lại.",
  STORY_REPEATED_COMBINATION:
    "Ý tưởng này trùng với một tập đã có. Hãy đổi ý tưởng hoặc để AI tự đề xuất tập mới.",
  STORY_GUESTS_INVALID: "Danh sách khách mời không hợp lệ.",
  STORY_GUEST_KEY_INVALID: "Mã khách mời không hợp lệ.",
  STORY_GUEST_DESCRIPTION_REQUIRED:
    "Khách mời cần mô tả ngoại hình đủ rõ để dựng ảnh.",
  STORY_GUEST_UNDECLARED:
    "Kịch bản dùng một khách mời chưa được khai báo. Hãy cho AI viết lại.",

  // ----- Kịch bản: quy trình biên tập -----
  FAMILY_EDITORIAL_NEEDS_REVIEW:
    "Bản nháp chưa đạt yêu cầu biên tập. Hãy thử lại với ý tưởng khác, hoặc tự sửa kịch bản rồi duyệt tay.",
  FAMILY_PREMISES_NEED_REVIEW:
    "Cả ba phương án đều chưa đủ hay. Hãy nêu ý tưởng cụ thể hơn rồi thử lại.",
  FAMILY_PREMISES_MISSING:
    "Chưa có phương án nào để chọn. Hãy chạy lại bước tìm ý tưởng.",
  FAMILY_PREMISES_INVALID:
    "Các phương án AI trả về chưa hợp lệ. Hãy thử lại.",
  FAMILY_PREMISES_DUPLICATED:
    "Ba phương án quá giống nhau. Hãy thử lại hoặc nêu ý tưởng cụ thể hơn.",
  FAMILY_SELECTION_INVALID:
    "Kết quả chọn phương án chưa hợp lệ. Hãy thử lại.",
  FAMILY_DRAFT_MISSING:
    "Chưa có bản nháp. Hãy chạy lại bước viết kịch bản.",
  FAMILY_REVIEW_MISSING:
    "Bản nháp chưa qua biên tập. Hãy chạy lại bước biên tập.",
  FAMILY_EDITORIAL_REVIEW_INVALID:
    "Kết quả biên tập chưa hợp lệ. Hãy thử lại.",
  FAMILY_DIALOGUE_CHANGED:
    "AI đã tự đổi lời thoại khi dựng cảnh. Hãy chạy lại bước dựng storyboard.",
  FAMILY_PLAN_INVALID:
    "Storyboard AI dựng chưa hợp lệ. Hãy chạy lại bước dựng cảnh.",
  FAMILY_WRITING_TIMEOUT:
    "Bước viết kịch bản quá thời gian cho phép. Hãy thử lại.",
  FAMILY_CHECKPOINT_SAVE_FAILED:
    "Không lưu được tiến độ viết kịch bản. Hãy thử lại.",
  FAMILY_CHANNEL_PROFILE_MISSING:
    "Dự án chưa có hồ sơ kênh. Hãy thiết lập hồ sơ kênh trước khi làm phim.",
  FAMILY_CHANNEL_PROFILE_V11_MISMATCH:
    "Hồ sơ kênh đang ở phiên bản cũ. Hãy cập nhật hồ sơ kênh.",
  CHANNEL_PROFILE_REQUIRED:
    "Dự án chưa có hồ sơ kênh. Hãy thiết lập hồ sơ kênh trước khi làm phim.",

  // ----- Storyboard và chỉ đạo diễn xuất -----
  STORYBOARD_INVALID: "Storyboard chưa hợp lệ. Hãy cho AI dựng lại.",
  STORYBOARD_GROUPING_FAILED:
    "Không chia được storyboard thành các clip hợp lệ. Hãy cho AI dựng lại.",
  STORYBOARD_TIMING_POLICY_INVALID:
    "Nhịp thời gian của storyboard chưa hợp lệ. Hãy cho AI dựng lại.",
  STORYBOARD_PROP_IDENTITY_CHANGED:
    "Một đạo cụ đổi hình dạng giữa các cảnh. Hãy cho AI dựng lại storyboard.",
  STORYBOARD_SEGMENT_STATE_INVALID:
    "Trạng thái nối giữa các cảnh chưa khớp. Hãy cho AI dựng lại storyboard.",
  STORYBOARD_LINE_TOO_LONG:
    "Một lượt thoại dài hơn thời lượng clip cho phép. Hãy rút gọn lời hoặc tách cảnh.",
  STORYBOARD_BEAT_INVALID:
    "Một nhịp trong storyboard chưa hợp lệ: kiểm tra người nói, lời thoại và thời lượng. Hãy cho AI dựng lại.",
  STORYBOARD_DURATION_INVALID:
    "Nhịp nội dung không nằm trọn trong clip nguồn. Hãy cho AI dựng lại storyboard.",
  STORYBOARD_GROUP_TOO_LONG:
    "Một clip phải chứa nhiều lời hơn thời lượng cho phép. Hãy cho AI chia thêm clip.",
  STORYBOARD_DERIVED_FIELDS_CONFLICT:
    "Lời thoại và thời lượng của cảnh không khớp với các nhịp storyboard. Hãy cho AI dựng lại cảnh.",
  STORYBOARD_NATIVE_REQUIRED:
    "Chế độ âm thanh này cần storyboard dạng khác. Hãy lưu kịch bản sang chế độ lồng tiếng.",
  STORYBOARD_SINGLE_SPEAKER_SYNC_UNSUPPORTED:
    "Cảnh nhiều người nói không dùng được đồng bộ môi một người. Hãy tách thành các cận cảnh.",
  PERFORMANCE_DIRECTION_INVALID:
    "Hướng diễn xuất chưa hợp lệ. Hãy cho AI dựng lại cảnh.",
  PERFORMANCE_DIRECTION_WEAK:
    "Hướng diễn xuất còn chung chung, chưa đủ hành động nhìn thấy được. Hãy cho AI dựng lại cảnh.",
  PERFORMANCE_LANE_MIXED:
    "Các cảnh đang trộn nhiều kiểu diễn khác nhau. Hãy cho AI dựng lại cho nhất quán.",
  CREATIVE_PERFORMANCE_DIRECTION_MISSING:
    "Cảnh thiếu hướng diễn xuất. Hãy cho AI dựng lại.",
  SHOT_DIRECTION_EMPTY: "Cảnh thiếu mô tả hành động. Hãy cho AI dựng lại.",
  REFERENCE_PLAN_INVALID:
    "Kế hoạch ảnh tham chiếu chưa hợp lệ. Hãy cho AI dựng lại cảnh.",
  REFERENCE_PLAN_SHAPE_INVALID:
    "Kế hoạch ảnh tham chiếu sai cấu trúc. Hãy cho AI dựng lại cảnh.",
  REFERENCE_PLAN_ITEM_INVALID:
    "Một ảnh tham chiếu chưa hợp lệ. Hãy cho AI dựng lại cảnh.",
  REFERENCE_REQUIREMENT_UNCOVERED:
    "Có bằng chứng hình ảnh mà câu chuyện cần nhưng chưa ảnh nào thể hiện. Hãy cho AI dựng lại cảnh.",

  // ----- Trợ lý sáng tạo -----
  CREATIVE_ASSIST_INVALID_JSON:
    "AI trả về kết quả không đọc được. Hãy thử lại.",
  CREATIVE_ASSIST_IDEAS_INVALID: "Danh sách ý tưởng chưa hợp lệ. Hãy thử lại.",
  CREATIVE_ASSIST_IMAGE_INVALID: "Gợi ý ảnh chưa hợp lệ. Hãy thử lại.",
  CREATIVE_ASSIST_CLIP_INVALID: "Gợi ý clip chưa hợp lệ. Hãy thử lại.",
  CREATIVE_ASSIST_PLAN_INVALID: "Kịch bản AI trả về chưa hợp lệ. Hãy thử lại.",
  CREATIVE_ASSIST_SCENE: "Một cảnh AI trả về chưa hợp lệ. Hãy thử lại.",
  CREATIVE_ASSIST_REVISION_INVALID:
    "Bản chỉnh sửa chưa hợp lệ. Hãy thử lại.",
  CREATIVE_ASSIST_FAILED: "Trợ lý sáng tạo gặp sự cố. Hãy thử lại.",
  CREATIVE_RESULT_SAVE_FAILED:
    "Không lưu được kết quả. Hãy thử lại; nội dung cũ vẫn được giữ.",
  CREATIVE_REVISION_SCENES_CHANGED:
    "Số cảnh đã thay đổi so với bản đang sửa. Hãy tải lại rồi sửa lại.",
  CREATIVE_REVISION_LOCKED_SCENE_CHANGED:
    "Bản sửa đụng vào cảnh đã khoá. Hãy tải lại rồi thử lại.",
  CREATIVE_REVISION_STORYBOARD_LOST:
    "Bản sửa làm mất storyboard của một cảnh. Hãy thử lại.",

  // ----- Kiểm tra tự động -----
  AI_QA_INVALID:
    "Không đọc được kết quả kiểm tra tự động. Hãy xem lại cảnh bằng mắt trước khi duyệt.",
  QA_RESULT_TRUNCATED:
    "Kết quả kiểm tra tự động bị cắt giữa chừng. Hãy chạy lại bước kiểm tra.",
  QA_MEDIA_EMPTY: "Tệp cần kiểm tra đang rỗng.",
  QA_MEDIA_TOO_LARGE: "Tệp quá lớn để kiểm tra tự động.",

  // ----- Nhà cung cấp và cấu hình -----
  AI_KEY_NOT_CONFIGURED:
    "Hệ thống chưa cấu hình khoá AI. Hãy báo quản trị viên.",
  OPENAI_KEY_NOT_CONFIGURED:
    "Hệ thống chưa cấu hình khoá OpenAI. Hãy báo quản trị viên.",
  WAVESPEED_API_KEY_NOT_CONFIGURED:
    "Hệ thống chưa cấu hình khoá dịch vụ video. Hãy báo quản trị viên.",
  WAVESPEED_WEBHOOK_SECRET_NOT_CONFIGURED:
    "Hệ thống chưa cấu hình khoá webhook. Hãy báo quản trị viên.",
  WAVESPEED_PRICE_UNAVAILABLE:
    "Chưa lấy được giá từ nhà cung cấp. Hãy thử lại sau ít phút; bạn chưa bị trừ điểm.",
  PROVIDER_TIMEOUT:
    "Nhà cung cấp phản hồi quá lâu. Hãy thử lại sau ít phút; bạn chưa bị trừ điểm.",
  GENERATION_FAILED: "Tạo nội dung không thành công. Hãy thử lại.",
  GENERATION_JOB_PERSIST_FAILED:
    "Không lưu được yêu cầu tạo nội dung. Hãy thử lại.",
  SAFETY_BLOCKED:
    "Nội dung bị bộ lọc an toàn của nhà cung cấp từ chối. Hãy đổi mô tả rồi thử lại.",
  MEDIA_SIGN_FAILED: "Không mở được tệp. Hãy tải lại trang rồi thử lại.",

  // ----- Đóng dấu -----
  WATERMARK_CHECKPOINT_MISSING: "Thiếu dữ liệu tiến độ đóng dấu.",
  WATERMARK_OBJECT_CONFLICT:
    "Tệp đóng dấu bị ghi đè bởi một tiến trình khác. Hãy thử lại.",
  WATERMARK_PROVIDER_OUTPUT_INVALID:
    "Kết quả đóng dấu từ nhà cung cấp không hợp lệ. Hãy thử lại.",
  WATERMARK_SETTLEMENT_PENDING:
    "Khoản phí đóng dấu đang chờ quyết toán. Hãy thử lại sau.",
  WATERMARK_UPLOAD_UNVERIFIED:
    "Chưa xác nhận được tệp đã tải lên. Hãy thử lại.",

  // ----- Nội dung đầu vào -----
  VALIDATION_HEADLINE_REQUIRED: "Hãy nhập câu chữ chính cho ảnh.",
  VALIDATION_CHARACTER_REQUIRED: "Hãy chọn ít nhất một nhân vật.",
  VALIDATION_BACKGROUND_REQUIRED: "Hãy mô tả bối cảnh.",
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
