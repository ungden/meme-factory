import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/lib/server-secrets";

// ============================================
// Gemini Nano Banana 2 - Image Generation
// Uses gemini-3.1-flash-image-preview model
// Server-side only (called from API routes)
// ============================================

export const IMAGE_MODEL = "gemini-3.1-flash-image-preview";

async function getClient(): Promise<GoogleGenAI> {
  const apiKey = await getGeminiApiKey();
  return new GoogleGenAI({ apiKey });
}

// Map our MemeFormat to Gemini aspect ratios
const FORMAT_TO_ASPECT: Record<string, string> = {
  "1:1": "1:1",
  "9:16": "9:16",
  "16:9": "16:9",
  "4:5": "4:5",
};

export interface GenerateMemeImageParams {
  headline: string;
  subtext?: string;
  tone: string;
  textPosition: string;
  customPrompt?: string;
  characters: {
    name: string;
    emotion: string;
    description?: string;
    characterId?: string;
    poseId?: string;
    poseImageBase64?: string;
    poseMimeType?: string;
  }[];
  format: string;
  style?: string;
  watermark?: {
    enabled: boolean;
    text?: string;
    logoBase64?: string;
    logoMimeType?: string;
  };
  backgroundDescription?: string;
  referenceImages?: { base64: string; mimeType: string }[];
}

export function compileMemeImagePrompt(params: GenerateMemeImageParams) {
  const {
    headline,
    subtext,
    tone,
    textPosition,
    characters,
    style,
    watermark,
    backgroundDescription,
    customPrompt,
  } = params;

  const charDescriptions = characters
    .map(
      (c) =>
        `- "${c.name}": biểu cảm ${c.emotion}${c.description ? `\n  Mô tả: ${c.description}` : ""}${c.poseImageBase64 ? "\n  (có ảnh reference đính kèm — BẮT BUỘC vẽ giống ảnh reference)" : ""}`
    )
    .join("\n");

  const hasHeadline = Boolean(headline?.trim());
  const requiredCharacters = characters.map((c) => c.name).filter(Boolean);

  const defaultMemeStyle = `Phong cách: Cartoon meme fanpage Việt Nam. Bold outlines, shading rõ ràng, dynamic composition. Màu sắc tươi sáng bão hoà, bắt mắt trên news feed. Đây là ảnh minh hoạ (illustration), KHÔNG phải ảnh chụp thật.`;

  return `Bạn là một họa sĩ minh họa (Illustrator) chuyên nghiệp tạo meme cho mạng xã hội Việt Nam.
Nhiệm vụ của bạn là tạo một bức tranh (Illustration) chất lượng cao theo đúng các yêu cầu bên dưới.

=== 1. CHỈ DẪN VẼ HÌNH ẢNH (VISUAL BRIEF) ===
${customPrompt ? customPrompt : "Sáng tạo hình ảnh phù hợp với văn bản."}
${backgroundDescription ? `\nChi tiết background: ${backgroundDescription}` : ""}

=== 2. NHÂN VẬT (CHARACTERS) ===
${charDescriptions || "Sáng tạo nhân vật phù hợp với ngữ cảnh."}
${requiredCharacters.length ? `\nBắt buộc xuất hiện: ${requiredCharacters.join(", ")}` : ""}

=== 3. CHỈ DẪN VĂN BẢN (TYPOGRAPHY) ===
${hasHeadline ? `BẮT BUỘC VẼ CHÍNH XÁC dòng chữ sau lên ảnh (font đậm, to, dễ đọc):
"${headline}"
${subtext ? `Dòng chữ nhỏ hơn bên dưới: "${subtext}"` : ""}
Vị trí văn bản: ${textPosition === "top" ? "Phía trên cùng" : textPosition === "bottom" ? "Phía dưới cùng" : textPosition === "center" ? "Chính giữa" : "Bất kỳ"}` 
: `LƯU Ý QUAN TRỌNG VỀ VĂN BẢN:
- Đọc kỹ phần VISUAL BRIEF ở trên. 
- Nếu có các câu thoại nằm trong ngoặc kép ("..."), hãy cho vào bong bóng thoại (speech bubbles) chỉ về phía người nói.
- TUYỆT ĐỐI KHÔNG BÊ NGUYÊN kịch bản lên ảnh. KHÔNG VIẾT các từ khóa chỉ đạo kịch bản (ví dụ: "Khung hình 1", "Khung dưới", "nói:", "gọi điện:"). CHỈ VẼ CÂU THOẠI.`}
- Bắt buộc đúng chính tả tiếng Việt có dấu.

=== 4. PHONG CÁCH & MOOD (STYLE) ===
${style ? style : defaultMemeStyle}
Tone/Mood: ${tone}
${watermark?.enabled ? `\nWatermark: Góc dưới cùng bên phải. ${watermark.text ? `Chữ: "${watermark.text}"` : ""}` : ""}

=== 5. QUY TẮC CẤM (NEGATIVE PROMPT) ===
- KHÔNG vẽ ảnh chụp thật (photorealistic), KHÔNG 3D render thực tế. CHỈ VẼ tranh minh họa (comic/illustration).
- KHÔNG tạo nhân vật mới khác loài nếu đã có ảnh tham khảo (Reference). Bắt buộc vẽ giống hệt ảnh mẫu.
`;
}

// ============================================
// 1. Generate Full Meme Image
// ============================================
export async function generateMemeImage(
  params: GenerateMemeImageParams
): Promise<{ image: string; text?: string }> {
  const ai = await getClient();
  const { characters, format, watermark, referenceImages } = params;
  const prompt = compileMemeImagePrompt(params);

  // Build content parts: text prompt + reference images
  const contents: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [{ text: prompt }];

  // Character references arrive pre-routed; do not silently slice again here.
  const charImages = characters.filter((c) => c.poseImageBase64);
  if (charImages.length > 0) {
    contents.push({
      text: `=== ẢNH THAM CHIẾU NHÂN VẬT — BẮT BUỘC TUÂN THỦ ===
Dưới đây là ảnh reference chính thức của từng nhân vật. Bạn PHẢI vẽ nhân vật GIỐNG CHÍNH XÁC ảnh reference:
- GIỐNG CHÍNH XÁC: khuôn mặt, tỉ lệ cơ thể, màu da/lông/tóc, đặc điểm nhận dạng (sừng, đuôi, tai, mắt, mũi...)
- GIỐNG CHÍNH XÁC: phong cách vẽ (nét vẽ, shading, art style) từ ảnh reference
- ĐƯỢC PHÉP thay đổi: biểu cảm, tư thế, trang phục, bối cảnh theo nội dung meme
- KHÔNG ĐƯỢC: tự sáng tạo nhân vật mới, thay đổi loài/species, thay đổi đặc điểm nhận dạng cốt lõi
Nếu nhân vật trong ảnh reference là con bò thì PHẢI vẽ con bò, là con gấu thì PHẢI vẽ con gấu — KHÔNG ĐƯỢC đổi sang loài khác.`,
    });
  }
  for (const char of charImages) {
    contents.push({
      text: `[REFERENCE] Nhân vật "${char.name}" — Hãy vẽ nhân vật này GIỐNG CHÍNH XÁC ảnh bên dưới.${char.description ? ` Mô tả: ${char.description}` : ""}`,
    });
    contents.push({
      inlineData: {
        mimeType: char.poseMimeType || "image/png",
        data: char.poseImageBase64!,
      },
    });
  }

  if (watermark?.enabled && watermark.logoBase64) {
    contents.push({
      text: "Ảnh logo watermark tham chiếu: đặt đúng ở góc dưới bên phải, kích thước nhỏ, rõ ràng.",
    });
    contents.push({
      inlineData: {
        mimeType: watermark.logoMimeType || "image/png",
        data: watermark.logoBase64,
      },
    });
  }

  // Keep the exact provider image order aligned with the persisted manifest:
  // character identities -> owned item/logo -> contextual/style references.
  // The deterministic Reference Router already enforces the provider budget.
  if (referenceImages) {
    for (const [idx, img] of referenceImages.entries()) {
      contents.push({
        text: `Ảnh tham khảo ngữ cảnh #${idx + 1}: dùng để học bố cục, ánh sáng, bối cảnh.`,
      });
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
  }

  const aspectRatio = FORMAT_TO_ASPECT[format] || "1:1";

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: contents,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: "1K",
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
  const ai = await getClient();

  const { characterName, characterDescription, emotion, style, existingPoseImages } =
    params;

  const defaultStyle = `PHONG CÁCH:
- Cartoon nhân hóa (anthropomorphic) chất lượng cao, phù hợp fanpage meme Việt Nam
- Bold outlines sắc sảo (2-3px), nét vẽ professional
- Semi-realistic cartoon shading: có bóng đổ, highlights, texture rõ ràng
- Phong cách chỉ ảnh hưởng NÉT VẼ / RENDERING / SHADING / TỈ LỆ / MÀU SẮC TỔNG THỂ
- KHÔNG dùng phong cách để tự thêm trang phục, phụ kiện, nghề nghiệp, archetype hay đổi loài nhân vật
- Biểu cảm khuôn mặt rõ ràng, có cá tính, phù hợp emotion được yêu cầu
- Tư thế dynamic, có năng lượng, phù hợp tính cách nhân vật
- Màu sắc tươi sáng, bão hoà, hài hoà với tổng thể`;

  const prompt = `Bạn là họa sĩ chuyên vẽ mascot/nhân vật cho fanpage meme Việt Nam (chứng khoán, tài chính, đời sống). Hãy tạo một character illustration chất lượng cao, có cá tính mạnh.

NHÂN VẬT: "${characterName}"
MÔ TẢ CHI TIẾT: ${characterDescription}
BIỂU CẢM/TƯ THẾ CẦN THỂ HIỆN: ${emotion}

${style ? `PHONG CÁCH YÊU CẦU: ${style}
QUY TẮC DIỄN GIẢI PHONG CÁCH: Phần PHONG CÁCH YÊU CẦU chỉ được dùng để quyết định nét vẽ, chất liệu, shading, line art, bảng màu, tỉ lệ minh hoạ, level chi tiết. KHÔNG được suy ra hay tự thêm outfit, phụ kiện, nghề nghiệp hoặc persona nếu mô tả nhân vật không nói tới.` : defaultStyle}

YÊU CẦU BẮT BUỘC:
1. Full body character (toàn thân), KHÔNG bị cắt, nhìn rõ từ đầu đến chân
2. Background: TRẮNG TINH (#FFFFFF) hoặc gradient nhạt đơn giản — để dễ tách nền
3. Bold outlines sắc sảo, chi tiết rõ ràng, professional quality
4. Biểu cảm khuôn mặt: Emotion "${emotion}" phải thể hiện RÕ RÀNG trên mặt — phù hợp tính cách nhân vật
5. Trang phục và phụ kiện: THEO ĐÚNG MÔ TẢ NHÂN VẬT bên trên — KHÔNG tự thêm trang phục/phụ kiện ngoài mô tả, kể cả khi phong cách gợi nhớ streetwear/corporate/graffiti/anime...
6. Tư thế tự nhiên, có năng lượng, phù hợp với emotion và tính cách nhân vật
7. Rendering chất lượng cao, phù hợp phong cách đã chọn (có thể semi-realistic, chibi, flat... tuỳ style)
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
  const ai = await getClient();

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
    throw new Error("Không nhận được kết quả từ AI. Vui lòng thử lại.");
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
    // Log AI response for debugging but don't expose to user
    if (textContent) {
      console.error("AI returned text instead of image:", textContent);
    }
    throw new Error("AI không tạo được ảnh. Vui lòng thử lại với mô tả khác.");
  }

  return { image: imageData, text: textContent };
}
