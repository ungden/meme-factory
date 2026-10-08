import { resolveArtDirection } from "../mascot-art-direction";

/**
 * Bộ ảnh chuẩn để một nhân vật lên phim.
 *
 * Khâu quay chỉ nhận nhân vật có phiên bản ảnh đã khoá; trước đây chỉ script
 * chạy tay mới tạo được nó, nên khách mới không bao giờ quay được phim. Ba góc
 * là thứ Seedance cần để giữ người qua mọi cảnh: cận mặt khoá khuôn mặt (một
 * ảnh toàn thân để mặt quá nhỏ), toàn thân khoá vóc dáng và đồ, sau lưng khoá
 * tóc gáy và lưng áo khi bé quay đi.
 */
export const FILM_REFERENCE_VIEWS = [
  { view: "face", role: "identity_face", aspectRatio: "4:5", priority: 100 },
  { view: "body", role: "identity_body", aspectRatio: "9:16", priority: 90 },
  { view: "back", role: "look", aspectRatio: "9:16", priority: 80 },
] as const;
export type FilmReferenceView = (typeof FILM_REFERENCE_VIEWS)[number]["view"];

export function isFilmReferenceView(value: unknown): value is FilmReferenceView {
  return FILM_REFERENCE_VIEWS.some((item) => item.view === value);
}

export type FilmMedium = "photoreal" | "animated";

/** Nhân vật người thật lên phim kiểu quay điện thoại; mascot 3D lên phim hoạt hình 3D. */
export function filmMediumFor(artDirection: unknown): FilmMedium {
  return resolveArtDirection(artDirection).medium === "photorealistic" ? "photoreal" : "animated";
}

/** Kênh có cả hai loại thì theo số đông; hoà thì theo nhân vật đầu tiên. */
export function channelFilmMedium(artDirections: unknown[]): FilmMedium {
  const media = artDirections.map(filmMediumFor);
  const photoreal = media.filter((medium) => medium === "photoreal").length;
  if (photoreal * 2 > media.length) return "photoreal";
  if (photoreal * 2 < media.length) return "animated";
  return media[0] || "animated";
}

export const CHANNEL_VISUAL_DIRECTIONS: Record<FilmMedium, { id: string; prompt: string; medium: FilmMedium }> = {
  photoreal: {
    id: "channel-phone-real-v1",
    medium: "photoreal",
    prompt:
      "Live-action như do chính người nhà quay bằng điện thoại: người Việt thật, giải phẫu và tỷ lệ tự nhiên, da có lỗ chân lông, tóc có sợi lẻ, vải có thớ và nếp nhăn. Ánh sáng có sẵn tại nơi quay, HDR và độ nét kiểu điện thoại, màu tự nhiên không chỉnh điện ảnh, không retouch. Giữ chính xác khuôn mặt, tuổi, tóc, vóc dáng và trang phục từ từng ảnh chuẩn. Không CGI, không 3D render, không hoạt hình.",
  },
  animated: {
    id: "channel-animated-3d-v1",
    medium: "animated",
    prompt:
      "Phim hoạt hình 3D chất lượng rạp: nhân vật giữ đúng hình khối, chất liệu, màu và tỷ lệ của ảnh chuẩn; bối cảnh dựng 3D cùng chất, ánh sáng mềm có chiều sâu. Không chuyển sang người thật, không vẽ 2D, không viền nét.",
  },
};

const VIEW_BRIEF: Record<FilmReferenceView, string> = {
  face: "Ảnh cận vai, ngang tầm mắt nhân vật, khuôn mặt chiếm nửa trên khung, nhìn thẳng ống kính, biểu cảm bình thường, miệng khép.",
  body: "Ảnh toàn thân từ đầu đến chân, đứng tự nhiên quay mặt về máy, tay buông thả lỏng, thấy rõ bàn chân trên sàn, máy ngang ngực nhân vật để tỷ lệ đúng.",
  back: "Ảnh toàn thân nhìn từ 3/4 phía sau, nhân vật đang bước đi và ngoái lại qua vai, thấy rõ tóc sau gáy và lưng trang phục, chân chạm sàn.",
};

const MEDIUM_LOOK: Record<FilmMedium, string> = {
  photoreal:
    "Ảnh chụp bằng điện thoại trong một căn hộ Việt thật: tường trơn sáng, sàn gỗ hoặc gạch, ánh sáng cửa sổ. Da thật có lỗ chân lông và lông tơ, tóc có sợi lẻ, vải có thớ. HDR điện thoại nhẹ, không retouch, không làm đẹp da. Không CGI, không 3D, không hoạt hình, không búp bê.",
  animated:
    "Render 3D chất lượng phim hoạt hình rạp, cùng chất liệu và màu với ảnh đính kèm, nền studio sáng đơn giản, ánh sáng mềm có bóng đổ tiếp xúc. Không vẽ 2D, không viền nét, không chuyển sang người thật.",
};

/**
 * Prompt cho một góc của bộ ảnh. Ảnh sau (thân, lưng) được dựng từ ảnh mặt vừa
 * tạo, nên chỉ ảnh mặt phải tự giữ nhận diện từ ảnh gốc của nhân vật.
 */
export function filmReferencePrompt(
  view: FilmReferenceView,
  character: { name: string; description: string },
  medium: FilmMedium,
): string {
  return [
    `Các ảnh đính kèm là nhân vật "${character.name}"${character.description ? ` (${character.description})` : ""}. Dựng MỘT ảnh mới của đúng nhân vật này: giữ chính xác khuôn mặt, tuổi, tóc, màu da, vóc dáng và trang phục thường ngày.`,
    VIEW_BRIEF[view],
    MEDIUM_LOOK[medium],
    "Chỉ một nhân vật trong khung. Không chữ, không logo, không watermark, không hình in hoạt hình trên quần áo.",
  ].join("\n");
}

/** Đủ để lên phim: phải có cận mặt và toàn thân; ảnh lưng là thêm. */
export function filmPackReady(roles: string[]): boolean {
  return roles.includes("identity_face") && roles.includes("identity_body");
}
