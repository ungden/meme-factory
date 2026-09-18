/**
 * Dữ liệu và phép biến đổi cho luồng khởi tạo 3 bước.
 *
 * Tách khỏi React để test được: phần dễ sai ở đây không phải giao diện mà là
 * những gì được ghép thành mô tả dự án và brief gửi cho AI.
 */

export type ContentField = {
  id: string;
  label: string;
  /** Gợi ý ý tưởng cho ảnh đầu tiên, viết như người dùng sẽ tự gõ. */
  ideas: string[];
  /** Giọng thương hiệu mặc định, người dùng sửa sau trong Thương hiệu. */
  voice: string;
};

export const CONTENT_FIELDS: ContentField[] = [
  {
    id: "an-uong",
    label: "Ăn uống · Quán xá",
    voice: "Thân thiện, thèm thuồng, hơi hài",
    ideas: [
      "Ly cà phê sáng cho dân văn phòng",
      "Món mới trong tuần, chụp cận cảnh",
      "Khách quen kể lý do quay lại quán",
    ],
  },
  {
    id: "thoi-trang",
    label: "Thời trang · Làm đẹp",
    voice: "Sang, tối giản, tự tin",
    ideas: [
      "Phối đồ đi làm mùa này",
      "Trước và sau khi thay đổi phong cách",
      "Món đồ đáng tiền nhất tủ quần áo",
    ],
  },
  {
    id: "me-va-be",
    label: "Mẹ và bé",
    voice: "Ấm áp, tin cậy, gần gũi",
    ideas: [
      "Một ngày của mẹ bỉm sữa",
      "Mẹo cho bé ăn ngon không phải dỗ",
      "Đồ dùng mua rồi mới thấy cần",
    ],
  },
  {
    id: "giao-duc",
    label: "Giáo dục · Khoá học",
    voice: "Rõ ràng, đáng tin, không lên gân",
    ideas: [
      "Lỗi sai hay gặp của người mới học",
      "Một mẹo học nhớ lâu trong 30 giây",
      "Học viên kể lại thay đổi sau khoá học",
    ],
  },
  {
    id: "cong-nghe",
    label: "Công nghệ · Ứng dụng",
    voice: "Gọn, thực dụng, có ví dụ",
    ideas: [
      "Một tính năng ít người biết",
      "So sánh cách làm cũ và cách làm mới",
      "Lỗi thường gặp và cách xử lý",
    ],
  },
  {
    id: "du-lich",
    label: "Du lịch · Trải nghiệm",
    voice: "Phóng khoáng, kể chuyện",
    ideas: [
      "Điểm đến cuối tuần gần thành phố",
      "Chi phí thật cho một chuyến đi",
      "Một khoảnh khắc đáng nhớ trên đường",
    ],
  },
  {
    id: "suc-khoe",
    label: "Sức khoẻ · Thể thao",
    voice: "Động viên, không phán xét",
    ideas: [
      "Bài tập 5 phút cho người ngồi nhiều",
      "Bữa ăn đủ chất mà nấu nhanh",
      "Thói quen nhỏ giữ được lâu dài",
    ],
  },
  {
    id: "khac",
    label: "Lĩnh vực khác",
    voice: "Thân thiện, dí dỏm",
    ideas: [
      "Giới thiệu fanpage bằng một hình ảnh",
      "Câu chuyện đằng sau cái tên",
      "Điều khách hay hỏi nhất",
    ],
  },
];

export function fieldById(id: string | null | undefined): ContentField {
  return CONTENT_FIELDS.find((field) => field.id === id) ?? CONTENT_FIELDS[CONTENT_FIELDS.length - 1];
}

export type OnboardingInput = {
  name: string;
  fieldId: string;
  /** Câu trả lời cho "Bạn muốn nói với ai?" — không bắt buộc. */
  audience?: string;
};

/**
 * Ghép dữ liệu 3 câu hỏi thành đúng những trường mà bảng `projects` cần.
 *
 * Người mới không biết "style_prompt" là gì, nên chúng ta suy ra nó từ lĩnh vực
 * đã chọn thay vì bắt họ tự viết. Họ sửa lại sau trong phần Thương hiệu.
 */
export function projectDraft(input: OnboardingInput): {
  name: string;
  description: string;
  style_prompt: string;
} {
  const field = fieldById(input.fieldId);
  const name = input.name.trim();
  const audience = (input.audience || "").trim();
  const description = audience
    ? `${field.label}. Nói với: ${audience}.`
    : `${field.label}.`;
  return {
    name,
    description,
    style_prompt: `Giọng thương hiệu: ${field.voice}. Hình ảnh sạch, sáng, hợp với fanpage ${field.label.toLocaleLowerCase("vi")}.`,
  };
}

/** Brief gửi cho AI gợi ý nhân vật — càng cụ thể càng ít gợi ý chung chung. */
export function fanpageBrief(input: OnboardingInput): string {
  const field = fieldById(input.fieldId);
  const audience = (input.audience || "").trim();
  return [
    `Fanpage "${input.name.trim()}" trong lĩnh vực ${field.label}.`,
    audience ? `Khán giả: ${audience}.` : "",
    `Giọng mong muốn: ${field.voice}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export type CharacterSuggestion = {
  name: string;
  role?: string;
  personality?: string;
  description?: string;
  why_fit?: string;
};

/**
 * Chuẩn hoá gợi ý từ AI về đúng ba trường mà bảng `characters` nhận.
 *
 * Gemini thỉnh thoảng bỏ trống `personality` hoặc trả `role` thay cho mô tả;
 * người dùng vẫn phải lưu được nhân vật trong những lần như vậy.
 */
export function characterFromSuggestion(suggestion: CharacterSuggestion): {
  name: string;
  description: string;
  personality: string;
} | null {
  const name = (suggestion.name || "").trim();
  if (!name) return null;
  const description = (suggestion.description || suggestion.role || "").trim();
  const personality = (suggestion.personality || suggestion.why_fit || "").trim();
  return { name, description, personality };
}

/** Có dấu tiếng Việt = thông điệp đã viết cho người dùng, không phải cho log. */
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu;

/**
 * Câu báo lỗi cho bước gợi ý nhân vật.
 *
 * Route trả cả thông điệp kỹ thuật ("Unauthorized", "RPC error: …"). Ném thẳng
 * ra màn hình thì người dùng đọc một câu tiếng Anh giữa một luồng tiếng Việt và
 * không biết phải làm gì tiếp.
 */
export function suggestionError(status: number, message?: string): string {
  if (status === 401 || status === 403)
    return "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi quay lại bước này nhé.";
  if (status === 429) return "Hệ thống AI đang bận. Thử lại sau vài phút, hoặc bỏ qua bước này.";
  if (status === 503) return "Hệ thống AI chưa sẵn sàng. Bạn có thể bỏ qua và thêm nhân vật sau.";
  const text = (message || "").trim();
  return text && VIETNAMESE.test(text) ? text : "Chưa gợi ý được nhân vật lúc này.";
}
