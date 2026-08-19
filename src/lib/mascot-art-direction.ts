/**
 * Art direction for mascot artwork.
 *
 * The house look is 3D: soft global illumination, plush material, rounded appealing
 * shapes on a clean studio backdrop. The older 2D fanpage styles in
 * `prompt-templates.ts` stay available, but they are no longer the default — a flat
 * outlined cartoon reads cheaper next to the 3D set.
 */

export type ArtDirectionId = "soft_3d" | "glossy_3d" | "clay_3d" | "minimal_3d";

export interface ArtDirection {
  id: ArtDirectionId;
  label: string;
  description: string;
  /** Prompt block for generating the mascot itself. */
  characterStyle: string;
  /** Shorter block for whole-meme generation, where the subject is not the only element. */
  memeStyle: string;
}

const SHARED_3D_RULES = `- Render 3D chất lượng phim hoạt hình rạp, KHÔNG phải vẽ 2D
- Tuyệt đối KHÔNG viền nét (outline), KHÔNG cel shading, KHÔNG màu phẳng
- Ánh sáng studio mềm: một nguồn sáng chính dịu, sáng phụ nhẹ, bóng đổ tiếp xúc mềm
- Chất liệu có chiều sâu: tán xạ dưới bề mặt ở da, sợi lông/vải thấy rõ ở cự ly gần
- Tạo hình tròn trịa, khối chắc, tỉ lệ dễ thương nhưng không chibi hoá quá đà
- Mắt to, ướt, có đốm sáng phản chiếu rõ — đây là chỗ quyết định thần thái
- Nền studio liền mạch, sạch, hơi tối dần ở rìa; KHÔNG bối cảnh rối
- Độ sâu trường ảnh nông vừa phải, hậu cảnh mờ nhẹ
- Cảm giác tổng thể: cao cấp, ấm, đáng tin — không rẻ tiền, không lòe loẹt`;

export const ART_DIRECTIONS: Record<ArtDirectionId, ArtDirection> = {
  soft_3d: {
    id: "soft_3d",
    label: "3D mềm mại",
    description: "Lông nhung, ánh sáng dịu, nền kem ấm. Mặc định của hệ thống.",
    characterStyle: `PHONG CÁCH: Mascot 3D cao cấp, chất liệu nhung/nỉ mềm.
${SHARED_3D_RULES}
- Bề mặt lông ngắn mềm như nhung, bắt sáng mượt, không bóng gắt
- Bảng màu ấm và dịu; nền kem ngà (#F3EDE3) hoặc be nhạt
- Hoàn thiện mờ (matte), tránh phản chiếu kim loại`,
    memeStyle: `Mascot 3D chất liệu nhung mềm, ánh sáng studio dịu, nền kem ngà, không viền nét, không cel shading. Cảm giác cao cấp và ấm áp.`,
  },
  glossy_3d: {
    id: "glossy_3d",
    label: "3D bóng",
    description: "Như mô hình vinyl, bề mặt bóng, màu no.",
    characterStyle: `PHONG CÁCH: Mascot 3D như mô hình đồ chơi vinyl cao cấp.
${SHARED_3D_RULES}
- Bề mặt nhựa vinyl bóng, có highlight rõ nhưng vẫn mềm
- Màu no và tương phản hơn, viền sáng nhẹ tách khỏi nền
- Nền gradient trung tính hoặc pastel đậm`,
    memeStyle: `Mascot 3D kiểu mô hình vinyl bóng, highlight rõ, màu no, nền gradient sạch, không viền nét.`,
  },
  clay_3d: {
    id: "clay_3d",
    label: "Đất nặn",
    description: "Cảm giác stop-motion, bề mặt đất sét có vân tay.",
    characterStyle: `PHONG CÁCH: Mascot 3D kiểu phim đất nặn stop-motion.
${SHARED_3D_RULES}
- Bề mặt đất sét mờ, thấy vân tay và vết nặn tinh tế
- Khối hơi thô mộc, bất đối xứng nhẹ cho tự nhiên
- Bảng màu đất ấm, nền phông vải hoặc giấy`,
    memeStyle: `Mascot 3D đất nặn stop-motion, bề mặt có vân tay, khối thô mộc ấm, nền phông giấy, không viền nét.`,
  },
  minimal_3d: {
    id: "minimal_3d",
    label: "3D tối giản",
    description: "Hình khối đơn giản, ít màu, rất sạch.",
    characterStyle: `PHONG CÁCH: Mascot 3D tối giản, hình khối cơ bản.
${SHARED_3D_RULES}
- Hình khối rút gọn về cơ bản, ít chi tiết thừa
- Tối đa ba đến bốn màu, pastel nhạt
- Nền một màu phẳng, bóng đổ rất nhẹ`,
    memeStyle: `Mascot 3D tối giản, hình khối cơ bản, ba đến bốn màu pastel, nền một màu, bóng đổ nhẹ, không viền nét.`,
  },
};

export const DEFAULT_ART_DIRECTION: ArtDirectionId = "soft_3d";

export const ART_DIRECTION_LIST = Object.values(ART_DIRECTIONS);

export function isArtDirectionId(value: unknown): value is ArtDirectionId {
  return typeof value === "string" && value in ART_DIRECTIONS;
}

export function resolveArtDirection(value: unknown): ArtDirection {
  return isArtDirectionId(value) ? ART_DIRECTIONS[value] : ART_DIRECTIONS[DEFAULT_ART_DIRECTION];
}
