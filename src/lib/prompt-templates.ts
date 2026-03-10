// ============================================
// Prompt Template Library
// Thư viện style mẫu cho AI image generation
// ============================================

export interface PromptTemplate {
  id: string;
  name: string;
  nameVi: string;
  description: string;
  preview: string; // emoji/icon fallback khi chưa có ảnh preview
  previewUrl?: string; // ảnh preview (sẽ generate và lưu static)
  // Prompt fragments
  characterStyle: string; // style cho character generation
  memeStyle: string; // style cho meme generation
  // Gợi ý mô tả nhân vật
  exampleDescription: string;
  exampleEmotion: string;
  tags: string[];
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "streetwear-flex",
    name: "Streetwear Flex",
    nameVi: "Streetwear Ngông",
    description: "Nhân vật con vật nhân hóa mặc đồ streetwear, sneakers, dây chuyền vàng. Thái độ tự tin, flexing. Style Money Studio / Bò và Gấu.",
    preview: "🔥",
    previewUrl: "/templates/streetwear-flex.webp",
    characterStyle: `Cartoon nhân hóa (anthropomorphic) style fanpage meme tài chính Việt Nam.
- Nhân vật con vật đứng 2 chân như người, tỉ lệ cơ thể semi-realistic (không chibi)
- Trang phục streetwear: hoodie/jacket, quần short/jeans, sneakers
- Accessories tuỳ nhân vật: dây chuyền, kính mát, mũ, đồng hồ... (theo mô tả nhân vật)
- Semi-realistic cartoon rendering: bóng đổ rõ, texture vải, chi tiết sắc nét
- Bold outlines 2-3px, nét sắc sảo professional
- Thái độ: tự tin, năng lượng mạnh, power pose
- Góc nhìn: slight low-angle perspective cho dramatic effect
- Tông màu chủ đạo: teal/cyan, đỏ, vàng gold`,
    memeStyle: `Cartoon meme fanpage tài chính VN. Nhân vật anthropomorphic streetwear, semi-realistic shading, bold outlines, dynamic low-angle pose. Background: cityscape/speed lines. Tông teal-đỏ-vàng.`,
    exampleDescription: "Con bò đực nhân hóa, màu nâu, sừng nhọn, mõm hồng. Mặc hoodie xanh teal, sneakers đỏ, đeo dây chuyền vàng",
    exampleEmotion: "Tự tin flexing, nhếch mép cười, tay giơ 2 điện thoại",
    tags: ["finance", "streetwear", "flex", "trending"],
  },
  {
    id: "chibi-cute",
    name: "Chibi Cute",
    nameVi: "Chibi Dễ Thương",
    description: "Chibi đầu to mắt tròn, nét vẽ đậm, flat color. Style Thỏ Bảy Màu, Mèo Mập.",
    preview: "🥰",
    previewUrl: "/templates/chibi-cute.webp",
    characterStyle: `Chibi cartoon dễ thương style fanpage meme Việt Nam (Thỏ Bảy Màu, Mèo Mập).
- Tỉ lệ chibi: đầu chiếm 40% cơ thể, mắt to tròn chiếm 1/3 khuôn mặt
- Thân nhỏ, tay chân ngắn mập, dáng tròn trĩnh
- Flat shading hoặc cel shading đơn giản, ít gradient
- Bold outlines đậm 3-4px, clean vector lines
- Màu pastel tươi sáng, bão hoà vừa phải
- Biểu cảm cường điệu hoá: mắt sáng lấp lánh, miệng rộng, má hồng
- Trang phục đơn giản, dễ nhận diện
- Không cần chi tiết phức tạp, focus vào sự cute`,
    memeStyle: `Chibi meme cute style fanpage VN (Thỏ Bảy Màu). Đầu to mắt tròn, flat color, bold outlines, pastel tươi sáng, biểu cảm cường điệu dễ thương.`,
    exampleDescription: "Con thỏ trắng chibi, tai dài hồng, mắt to tròn đen láy, má ửng hồng, mặc áo thun vàng",
    exampleEmotion: "Vui sướng nhảy lên, mắt sáng lấp lánh, tay giơ cao",
    tags: ["cute", "chibi", "pastel", "kawaii"],
  },
  {
    id: "flat-vector",
    name: "Flat Vector",
    nameVi: "Vector Tối Giản",
    description: "Flat design tối giản, geometric shapes, màu sắc bold. Style hiện đại cho tech/startup.",
    preview: "🎨",
    previewUrl: "/templates/flat-vector.webp",
    characterStyle: `Modern flat vector illustration style.
- Geometric shapes đơn giản, minimal detail
- Flat colors không gradient, không bóng đổ
- Bold outlines uniform thickness
- Tỉ lệ cơ thể stylized: hơi elongated hoặc blocky
- Palette giới hạn 4-6 màu bold, contrast cao
- Clean, modern, professional look
- Phù hợp style startup/tech/corporate meme
- Nhân vật có tính biểu tượng cao, dễ nhận diện từ xa`,
    memeStyle: `Modern flat vector meme. Minimal detail, geometric shapes, bold flat colors, uniform outlines, clean professional look. High contrast palette.`,
    exampleDescription: "Con cáo cam đơn giản, geometric shapes, mắt tam giác, thân hình blocky, mặc vest xanh navy",
    exampleEmotion: "Tự tin, đứng thẳng, tay khoanh trước ngực",
    tags: ["minimal", "tech", "startup", "modern"],
  },
  {
    id: "manga-anime",
    name: "Manga/Anime",
    nameVi: "Manga Anime",
    description: "Style manga Nhật, mắt anime lớn, tóc dynamic, shading chi tiết. Phù hợp meme otaku/gaming.",
    preview: "⚡",
    previewUrl: "/templates/manga-anime.webp",
    characterStyle: `Manga/anime style illustration.
- Mắt anime lớn chi tiết: có highlight, reflection, iris màu sắc
- Tóc dynamic nhiều lọn, có movement
- Semi-realistic body proportion (không chibi)
- Cel shading rõ ràng: shadow layer + highlight layer
- Speed lines và effect particles khi cần
- Trang phục anime: school uniform, battle outfit, hoặc casual cool
- Biểu cảm dramatic kiểu manga: mồ hôi rơi, vein pop, sparkle eyes
- Nét vẽ clean, thin lines cho chi tiết, thick lines cho outline`,
    memeStyle: `Anime/manga meme style. Mắt anime lớn, cel shading, speed lines, dramatic expressions, dynamic composition. Biểu cảm cường điệu kiểu manga.`,
    exampleDescription: "Nhân vật nữ tóc xanh dài, mắt anime đỏ, mặc blazer đen, cà vạt đỏ, váy xếp ly",
    exampleEmotion: "Shocked, mắt mở to, mồ hôi rơi, miệng há hốc",
    tags: ["anime", "manga", "otaku", "gaming"],
  },
  {
    id: "watercolor-soft",
    name: "Watercolor Soft",
    nameVi: "Màu Nước Nhẹ Nhàng",
    description: "Watercolor mềm mại, pastel, dreamy. Phù hợp meme tình cảm, healing, motivational.",
    preview: "🌸",
    previewUrl: "/templates/watercolor-soft.webp",
    characterStyle: `Soft watercolor illustration style.
- Watercolor texture: paint bleed, wet edges, pigment pooling
- Pastel palette nhẹ nhàng: hồng, lavender, mint, baby blue
- Soft edges, không có outlines cứng — dùng color contrast thay outline
- Nhân vật mềm mại, tròn trĩnh, proportions dễ thương
- Light, airy, dreamy atmosphere
- Minimal detail, focus vào mood và emotion
- Có thể có hoa, lá, bong bóng trang trí nhẹ xung quanh
- Shading: watercolor wash nhẹ, transparency layers`,
    memeStyle: `Watercolor meme style. Soft pastel palette, watercolor texture, dreamy atmosphere, gentle emotion. Không outline cứng, mềm mại healing.`,
    exampleDescription: "Con mèo trắng fluffy, má hồng pastel, đeo nơ lavender, ngồi trên đám mây",
    exampleEmotion: "Dịu dàng mỉm cười, mắt khép hờ hạnh phúc",
    tags: ["soft", "healing", "romantic", "pastel"],
  },
  {
    id: "pixel-retro",
    name: "Pixel Retro",
    nameVi: "Pixel Art Retro",
    description: "Pixel art 16-32bit, retro gaming aesthetic. Phù hợp meme gaming, nostalgia.",
    preview: "👾",
    previewUrl: "/templates/pixel-retro.webp",
    characterStyle: `Pixel art retro style 32-bit era.
- Pixel art rõ ràng, mỗi pixel nhìn thấy được
- Palette giới hạn 16-32 màu kiểu retro game
- Character sprite style: front-facing hoặc 3/4 view
- Chi tiết vừa đủ trong giới hạn pixel grid
- Dithering cho gradient/shading
- Clean pixel work, không anti-aliasing mờ
- Kích thước character khoảng 64x64 đến 128x128 pixels, scale up clean
- Retro gaming aesthetic: bright, bold, nostalgic`,
    memeStyle: `Pixel art retro meme. 32-bit style, limited palette, clean pixel work, retro gaming aesthetic. Nostalgic, bold colors.`,
    exampleDescription: "Con rồng pixel xanh lá, 32-bit style, cánh spread, mắt đỏ, thân có vảy",
    exampleEmotion: "Phun lửa, mắt sáng rực, tư thế battle-ready",
    tags: ["pixel", "retro", "gaming", "8bit"],
  },
  {
    id: "graffiti-urban",
    name: "Graffiti Urban",
    nameVi: "Graffiti Đường Phố",
    description: "Street art graffiti, spray paint texture, bold colors. Edgy, rebellious vibe.",
    preview: "🎤",
    previewUrl: "/templates/graffiti-urban.webp",
    characterStyle: `Street art graffiti style illustration.
- Spray paint texture, drip effects, paint splatter
- Bold vivid colors: neon, primary colors mạnh
- Thick irregular outlines kiểu graffiti tag
- Urban art aesthetic: raw, energetic, rebellious
- Character design edgy: expression ngông, attitude strong
- Mixed media feel: stencil + freehand + marker
- Background elements: brick wall, concrete, tags
- Trang phục urban/street theo mô tả nhân vật`,
    memeStyle: `Graffiti street art meme. Spray paint texture, bold neon colors, thick irregular lines, urban rebellious energy. Edgy, raw, energetic.`,
    exampleDescription: "Con khỉ nhân hóa, mặc bomber jacket đen, cap ngược, cầm bình spray paint",
    exampleEmotion: "Ngông, cười toe toét, tay chỉ thẳng vào camera",
    tags: ["urban", "graffiti", "hiphop", "edgy"],
  },
  {
    id: "corporate-mascot",
    name: "Corporate Mascot",
    nameVi: "Mascot Doanh Nghiệp",
    description: "Clean, professional mascot style. Phù hợp brand, công ty, sản phẩm.",
    preview: "🏢",
    previewUrl: "/templates/corporate-mascot.webp",
    characterStyle: `Professional corporate mascot illustration style.
- Clean, polished, high-quality rendering
- Smooth gradients và soft shadows
- Proportions friendly: không quá cartoon, không quá realistic
- Trang phục professional: suit, tie, hoặc branded uniform
- Biểu cảm friendly, approachable, trustworthy
- Color palette clean: 2-3 brand colors + neutrals
- Phù hợp in ấn, web, app icon — scalable design
- Nét vẽ smooth, clean curves, no rough edges`,
    memeStyle: `Corporate mascot meme style. Clean polished rendering, smooth gradients, professional friendly look. Brand-appropriate colors, approachable expressions.`,
    exampleDescription: "Con sư tử nhân hóa, mặc suit xanh navy, cà vạt đỏ, tóc gọn gàng, cầm laptop",
    exampleEmotion: "Tự tin chuyên nghiệp, mỉm cười thân thiện, ngón tay cái giơ lên",
    tags: ["corporate", "professional", "brand", "mascot"],
  },
];

// ============================================
// Helper: Lấy template theo ID
// ============================================
export function getTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}

// ============================================
// Helper: Tạo full prompt từ template + user input
// ============================================
export function buildCharacterPrompt(params: {
  templateId: string;
  characterName: string;
  characterDescription: string;
  emotion: string;
  customStyle?: string;
}): { style: string; description: string } {
  const template = getTemplate(params.templateId);

  const style = params.customStyle || template?.characterStyle || PROMPT_TEMPLATES[0].characterStyle;

  // Nếu user không nhập description, dùng example
  const description = params.characterDescription.trim()
    || (template ? `${template.exampleDescription}` : params.characterName);

  return { style, description };
}

export function buildMemePrompt(params: {
  templateId: string;
  customStyle?: string;
}): string {
  const template = getTemplate(params.templateId);
  return params.customStyle || template?.memeStyle || PROMPT_TEMPLATES[0].memeStyle;
}
