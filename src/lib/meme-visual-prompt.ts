/**
 * Giữ hai khối có nhãn tách bạch: phần mô tả hình và phần hướng dẫn render chữ.
 * Trộn hai thứ này khiến model vẽ luôn chỉ dẫn lên ảnh.
 */
export function buildAutoVisualPrompt(v: {
  image_prompt?: string;
  text_rendering_notes?: string;
  visual_direction?: {
    scene?: string;
    character_styling?: string;
    composition?: string;
    camera?: string;
    lighting?: string;
    art_style?: string;
  };
}) {
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
