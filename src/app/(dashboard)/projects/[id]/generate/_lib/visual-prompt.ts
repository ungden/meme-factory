/**
 * Ghép brief hình ảnh gửi cho model. Nằm trong page.tsx 1700 dòng thì không ai
 * kiểm thử được, trong khi đây chính là chuỗi quyết định ảnh trả phí trông ra
 * sao — và thứ tự cùng các nhãn trong đó là hợp đồng với model.
 */
import type { MemeContent, SelectedCharacter } from "@/types/database";

export interface ContentVariation {
  content: MemeContent;
  suggested_characters: (SelectedCharacter & {
    reasoning: string;
    pose_id: string;
    pose_name: string;
    suggested_emotion: string;
  })[];
  headline: string;
  subtext?: string;
  caption?: string;
  image_prompt?: string;
  text_rendering_notes?: string;
  tone: string;
  text_position: string;
  visual_direction?: {
    scene?: string;
    character_styling?: string;
    composition?: string;
    camera?: string;
    lighting?: string;
    art_style?: string;
  };
}

/** Ảnh tham chiếu tối đa cho một lượt tạo, và dung lượng tối đa mỗi ảnh. */
export const MAX_REF_IMAGES = 4;
export const MAX_REF_SIZE_MB = 5;

export function isAcceptableReferenceFile(file: {
  type: string;
  size: number;
}) {
  return (
    file.type.startsWith("image/") &&
    file.size <= MAX_REF_SIZE_MB * 1024 * 1024
  );
}

/**
 * Giữ hai khối có nhãn tách bạch: phần mô tả hình và phần hướng dẫn render chữ.
 * Trộn hai thứ này khiến model vẽ luôn chỉ dẫn lên ảnh.
 */
export function buildAutoVisualPrompt(v: ContentVariation) {
  const d = v.visual_direction;
  return [
    v.image_prompt
      ? `[IMAGE BRIEF - chi mo ta phan hinh anh, KHONG phai text render]\n${v.image_prompt}`
      : "",
    d?.scene ? `Bối cảnh: ${d.scene}` : "",
    d?.character_styling ? `Nhân vật/Thần thái/Outfit: ${d.character_styling}` : "",
    d?.composition ? `Bố cục: ${d.composition}` : "",
    d?.camera ? `Góc máy: ${d.camera}` : "",
    d?.lighting ? `Ánh sáng: ${d.lighting}` : "",
    d?.art_style ? `Phong cách: ${d.art_style}` : "",
    v.text_rendering_notes
      ? `[TEXT RENDERING NOTES - chi huong dan render text tren anh]\n${v.text_rendering_notes}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
