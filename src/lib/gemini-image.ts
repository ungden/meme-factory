import { GoogleGenAI } from "@google/genai";

// ============================================
// Gemini Nano Banana 2 - Image Generation
// Uses gemini-3.1-flash-image-preview model
// Server-side only (called from API routes)
// ============================================

const IMAGE_MODEL = "gemini-3.1-flash-image-preview";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key") {
    throw new Error("GEMINI_API_KEY is not configured in .env.local");
  }
  return new GoogleGenAI({ apiKey });
}

// Map our MemeFormat to Gemini aspect ratios
const FORMAT_TO_ASPECT: Record<string, string> = {
  "1:1": "1:1",
  "9:16": "9:16",
  "16:9": "16:9",
  "4:5": "4:5",
};

// ============================================
// 1. Generate Full Meme Image
// ============================================
export async function generateMemeImage(params: {
  headline: string;
  subtext?: string;
  tone: string;
  textPosition: string;
  characters: {
    name: string;
    emotion: string;
    description?: string;
    poseImageBase64?: string;
    poseMimeType?: string;
  }[];
  format: string;
  style?: string;
  backgroundDescription?: string;
  referenceImages?: { base64: string; mimeType: string }[];
}): Promise<{ image: string; text?: string }> {
  const ai = getClient();

  const {
    headline,
    subtext,
    tone,
    textPosition,
    characters,
    format,
    style,
    backgroundDescription,
    referenceImages,
  } = params;

  const charDescriptions = characters
    .map(
      (c) =>
        `- "${c.name}": biểu cảm ${c.emotion}${c.description ? `, ${c.description}` : ""}`
    )
    .join("\n");

  const defaultMemeStyle = `Phong cách: Cartoon meme fanpage Việt Nam (Money Studio, Bò và Gấu). Nhân vật nhân hóa streetwear, semi-realistic shading, bold outlines, dynamic pose, low-angle perspective. Màu tươi sáng, tông teal/đỏ/vàng.`;

  const prompt = `Bạn là designer chuyên tạo meme cho fanpage comic Việt Nam. Hãy tạo một meme image hoàn chỉnh, chất lượng cao, sẵn sàng đăng social media.

HEADLINE TEXT (viết lên ảnh, font đậm nổi bật): "${headline}"
${subtext ? `SUBTEXT (nhỏ hơn, bên dưới headline): "${subtext}"` : ""}
Tone/Mood: ${tone}
Bố cục text: ${textPosition === "top" ? "Text ở phía trên ảnh" : textPosition === "bottom" ? "Text ở phía dưới ảnh" : textPosition === "center" ? "Text ở chính giữa" : "Text phía trên"}

NHÂN VẬT trong ảnh:
${charDescriptions || "(Không có nhân vật cụ thể — tạo illustration/scene phù hợp với nội dung meme)"}

${backgroundDescription ? `BACKGROUND: ${backgroundDescription}` : "Background: Màu gradient hoặc scene đơn giản phù hợp nội dung, không quá phức tạp để text vẫn dễ đọc."}

${style ? `PHONG CÁCH: ${style}` : defaultMemeStyle}

YÊU CẦU BẮT BUỘC:
1. TEXT HEADLINE phải: font đậm (bold), kích thước LỚN, có viền đen/shadow để nổi bật trên mọi background, DỄ ĐỌC ngay từ thumbnail
2. Text tiếng Việt PHẢI CÓ DẤU đầy đủ và chính xác (ă, â, ê, ô, ơ, ư, đ, dấu thanh...)
3. Nhân vật phải biểu cảm RÕ RÀNG, cute/chibi style, mắt to, đầu to tỉ lệ chibi
4. Bố cục cân đối, bắt mắt, phù hợp tỉ lệ ${format}, có đủ breathing room giữa text và nhân vật
5. Màu sắc tươi sáng, bão hoà, nhìn nổi bật trên news feed
6. Phù hợp đăng lên Facebook, Instagram — thu hút engagement
${characters.some((c) => c.poseImageBase64) ? "7. QUAN TRỌNG NHẤT: Giữ CHÍNH XÁC phong cách, màu sắc, đặc điểm nhận dạng của nhân vật từ ảnh reference đính kèm" : ""}
${referenceImages?.length ? `${characters.some((c) => c.poseImageBase64) ? "8" : "7"}. ẢNH THAM KHẢO: User đính kèm ${referenceImages.length} ảnh reference. Hãy tham khảo bố cục, style, mood, context từ các ảnh này khi tạo meme. Nếu ảnh là meme mẫu → tham khảo cách bố trí. Nếu ảnh là tin tức/biểu đồ → lấy context thông tin.` : ""}`;

  // Build content parts: text prompt + reference images
  const contents: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [{ text: prompt }];

  // Add user reference images first (up to 4)
  if (referenceImages) {
    for (const img of referenceImages.slice(0, 4)) {
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
  }

  // Add character reference images (up to 4 for character consistency)
  const charImages = characters.filter((c) => c.poseImageBase64);
  for (const char of charImages.slice(0, 4)) {
    contents.push({
      inlineData: {
        mimeType: char.poseMimeType || "image/png",
        data: char.poseImageBase64!,
      },
    });
  }

  const aspectRatio = FORMAT_TO_ASPECT[format] || "1:1";

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: contents,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: "2K",
      },
    },
  });

  return extractImageFromResponse(response);
}

// ============================================
// 2. Generate Character Pose
// ============================================
export async function generateCharacterPose(params: {
  characterName: string;
  characterDescription: string;
  emotion: string;
  style?: string;
  existingPoseImages?: { base64: string; mimeType: string }[];
}): Promise<{ image: string; text?: string }> {
  const ai = getClient();

  const { characterName, characterDescription, emotion, style, existingPoseImages } =
    params;

  const defaultStyle = `PHONG CÁCH: 
- Cartoon nhân hóa (anthropomorphic) style giống fanpage meme tài chính/chứng khoán Việt Nam (Money Studio, Bò và Gấu)
- Nhân vật con vật mặc đồ streetwear: hoodie, sneakers, dây chuyền vàng, kính mát
- Semi-realistic cartoon shading — có bóng đổ, texture vải, chi tiết giày rõ
- Bold outlines, nét vẽ sắc sảo, chất lượng cao
- Thái độ tự tin, ngông, flexing — kiểu "big boss" energy
- Góc nhìn dynamic, tư thế mạnh mẽ (power pose), low-angle perspective
- Màu sắc: teal/cyan, đỏ, vàng gold — tông trendy`;

  const prompt = `Bạn là họa sĩ chuyên vẽ mascot/nhân vật cho fanpage meme Việt Nam (chứng khoán, tài chính, đời sống). Hãy tạo một character illustration chất lượng cao, có cá tính mạnh.

NHÂN VẬT: "${characterName}"
MÔ TẢ CHI TIẾT: ${characterDescription}
BIỂU CẢM/TƯ THẾ CẦN THỂ HIỆN: ${emotion}

${style ? `PHONG CÁCH YÊU CẦU: ${style}` : defaultStyle}

YÊU CẦU BẮT BUỘC:
1. Full body character (toàn thân), KHÔNG bị cắt, nhìn rõ từ đầu đến chân
2. Background: TRẮNG TINH (#FFFFFF) hoặc gradient nhạt đơn giản — để dễ tách nền
3. Bold outlines sắc sảo, chi tiết rõ ràng, professional quality
4. Biểu cảm khuôn mặt CÓ CÁ TÍNH — nhân vật phải có "thái độ", không hiền lành nhạt nhẽo. Emotion "${emotion}" phải thể hiện rõ trên mặt
5. Trang phục streetwear/urban: hoodie, sneakers, accessories (dây chuyền, kính, mũ...) — trừ khi mô tả nói khác
6. Tư thế dynamic, có năng lượng — KHÔNG đứng thẳng tay xuôi nhàm chán
7. Semi-realistic cartoon rendering: có bóng đổ, highlight, texture vải/da — KHÔNG flat boring
8. KHÔNG có text, chữ viết, watermark, logo trên ảnh
9. Nhân vật phải có đặc điểm nhận dạng UNIQUE, dễ nhớ, phù hợp làm mascot fanpage
${existingPoseImages?.length ? "10. QUAN TRỌNG NHẤT: Giữ CHÍNH XÁC design, phong cách, tỉ lệ cơ thể, màu sắc outfit, và mọi đặc điểm nhận dạng của nhân vật từ các ảnh reference đính kèm. Chỉ thay đổi biểu cảm và tư thế." : ""}`;

  const contents: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [{ text: prompt }];

  // Add existing pose images for character consistency (up to 4)
  if (existingPoseImages) {
    for (const img of existingPoseImages.slice(0, 4)) {
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
  }

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: contents,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K",
      },
    },
  });

  return extractImageFromResponse(response);
}

// ============================================
// 3. Generate Background
// ============================================
export async function generateBackground(params: {
  description: string;
  mood?: string;
  format: string;
}): Promise<{ image: string; text?: string }> {
  const ai = getClient();

  const { description, mood, format } = params;
  const aspectRatio = FORMAT_TO_ASPECT[format] || "1:1";

  const prompt = `Tạo một background image cho meme fanpage Việt Nam.

MÔ TẢ: ${description}
${mood ? `MOOD/TONE: ${mood}` : ""}

YÊU CẦU:
1. KHÔNG có text, chữ viết, hoặc watermark trên background
2. KHÔNG có nhân vật hoặc người
3. Để nhiều negative space (khoảng trống) ở phần trên và giữa cho việc ghép text và nhân vật lên sau
4. Màu sắc hài hòa, phù hợp với mood
5. Chất lượng cao, phù hợp đăng social media
6. Tỉ lệ ${format}`;

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: "2K",
      },
    },
  });

  return extractImageFromResponse(response);
}

// ============================================
// Helper: Extract image from Gemini response
// ============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImageFromResponse(response: any): { image: string; text?: string } {
  let imageData: string | null = null;
  let textContent: string | undefined;

  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("No content returned from Gemini image generation");
  }

  for (const part of parts) {
    if (part.thought) continue; // Skip thinking tokens
    if (part.text) {
      textContent = part.text;
    } else if (part.inlineData?.data) {
      imageData = part.inlineData.data;
    }
  }

  if (!imageData) {
    throw new Error(
      "No image data returned from Gemini. The model may have refused the request or returned text only." +
        (textContent ? ` Model response: ${textContent}` : "")
    );
  }

  return { image: imageData, text: textContent };
}
