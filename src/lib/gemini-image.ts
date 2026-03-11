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
  customPrompt?: string;
  characters: {
    name: string;
    emotion: string;
    description?: string;
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
    watermark,
    backgroundDescription,
    referenceImages,
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
  const hasDialogueHint = Boolean(
    customPrompt && /["“”':]|hội thoại|nói|thoại|speech|bubble|khung hình/i.test(customPrompt)
  );

  const defaultMemeStyle = `Phong cách: Cartoon meme fanpage Việt Nam. Bold outlines, shading rõ ràng, dynamic composition. Màu sắc tươi sáng bão hoà, bắt mắt trên news feed.`;

  const prompt = `Bạn là designer chuyên tạo meme cho fanpage comic Việt Nam. Hãy tạo một meme image hoàn chỉnh, chất lượng cao, sẵn sàng đăng social media.

${hasHeadline ? `HEADLINE TEXT (viết lên ảnh, font đậm nổi bật): "${headline}"` : hasDialogueHint ? "TEXT MODE: Không có headline cố định. Hãy render text hội thoại/tường thuật nếu user mô tả trong prompt (speech bubble/caption trong khung hình)." : "TEXT MODE: Không có headline cố định. Chỉ thêm text nếu prompt yêu cầu rõ ràng; nếu không thì ưu tiên ảnh sạch, ít chữ."}
${hasHeadline && subtext ? `SUBTEXT (nhỏ hơn, bên dưới headline): "${subtext}"` : ""}
Tone/Mood: ${tone}
${hasHeadline ? `Bố cục text: ${textPosition === "top" ? "Text ở phía trên ảnh" : textPosition === "bottom" ? "Text ở phía dưới ảnh" : textPosition === "center" ? "Text ở chính giữa" : "Text phía trên"}` : "Bố cục: tập trung vào hình minh hoạ, không dành vùng cho text."}

NHÂN VẬT trong ảnh:
${charDescriptions || "(Không có nhân vật cụ thể — tạo illustration/scene phù hợp với nội dung meme)"}

${backgroundDescription ? `BACKGROUND: ${backgroundDescription}` : "Background: Màu gradient hoặc scene đơn giản phù hợp nội dung, không quá phức tạp để text vẫn dễ đọc."}

${style ? `PHONG CÁCH: ${style}` : defaultMemeStyle}
${customPrompt ? `\nBRIEF BỔ SUNG: ${customPrompt}` : ""}
${requiredCharacters.length ? `\nNHÂN VẬT BẮT BUỘC PHẢI XUẤT HIỆN: ${requiredCharacters.join(", ")}. Không được thay thế bằng nhân vật generic.` : ""}
${watermark?.enabled ? `\nWATERMARK: Bắt buộc đặt watermark ở góc dưới bên phải (bottom-right), nhỏ gọn, không che nội dung chính.${watermark.text ? ` Nội dung watermark text: "${watermark.text}".` : ""}${watermark.logoBase64 ? " Dùng logo tham chiếu được đính kèm." : ""}` : "\nWATERMARK: Không thêm watermark."}

YÊU CẦU BẮT BUỘC:
1. ${hasHeadline ? "TEXT HEADLINE phải: font đậm (bold), kích thước LỚN, có viền đen/shadow để nổi bật trên mọi background, DỄ ĐỌC ngay từ thumbnail" : hasDialogueHint ? "Nếu prompt có thoại/câu nói thì render đúng chính tả tiếng Việt trong speech bubble/caption tương ứng từng nhân vật." : "Không bắt buộc text. Chỉ thêm text khi prompt yêu cầu rõ ràng."}
2. ${hasHeadline || hasDialogueHint ? "Text tiếng Việt PHẢI CÓ DẤU đầy đủ và chính xác (ă, â, ê, ô, ơ, ư, đ, dấu thanh...)" : "Nếu không cần text thì ưu tiên ảnh sạch."}
3. Nhân vật phải biểu cảm RÕ RÀNG, phù hợp phong cách đã chọn
4. Bố cục cân đối, bắt mắt, phù hợp tỉ lệ ${format}, có đủ breathing room giữa text và nhân vật
5. Màu sắc tươi sáng, bão hoà, nhìn nổi bật trên news feed
6. Phù hợp đăng lên Facebook, Instagram — thu hút engagement
6.1. TEXT render trên ảnh CHỈ lấy từ HEADLINE TEXT và SUBTEXT ở trên, hoặc từ phần hướng dẫn text chuyên biệt trong BRIEF BỔ SUNG. Không được biến mô tả scene trong BRIEF BỔ SUNG thành chữ mới trên ảnh.
6.2. Nếu BRIEF BỔ SUNG có nhãn [IMAGE BRIEF] thì đó là mô tả hình ảnh, KHÔNG phải text để viết lên ảnh.
6.3. Nếu BRIEF BỔ SUNG có nhãn [TEXT RENDERING NOTES] thì đó là hướng dẫn dàn trang/chèn text, không phải mô tả bối cảnh.
${characters.some((c) => c.poseImageBase64)
  ? "7. QUAN TRỌNG NHẤT — CHARACTER CONSISTENCY: Mỗi nhân vật có ảnh reference đính kèm bên dưới. Bạn PHẢI vẽ nhân vật GIỐNG CHÍNH XÁC ảnh reference: cùng loài (species), cùng khuôn mặt, cùng màu da/lông/tóc, cùng đặc điểm nhận dạng (sừng, đuôi, tai, mắt...), cùng art style. CHỈ thay đổi biểu cảm, tư thế, bối cảnh. Nếu reference là con bò cartoon thì output PHẢI là con bò cartoon đó — KHÔNG được vẽ nhân vật khác."
  : ""}
${referenceImages?.length
  ? `${characters.some((c) => c.poseImageBase64) ? "8" : "7"}. ẢNH THAM KHẢO NGỮ CẢNH: User đính kèm ${referenceImages.length} ảnh. Chỉ dùng để học bố cục/mood/context.`
  : ""}`;

  // Build content parts: text prompt + reference images
  const contents: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [{ text: prompt }];

  // Add user reference images first (up to 10 for object/style/context)
  if (referenceImages) {
    for (const [idx, img] of referenceImages.slice(0, 10).entries()) {
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

  // Add character reference images (up to 4 for character consistency)
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
  for (const char of charImages.slice(0, 4)) {
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
  const ai = getClient();

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
    throw new Error(
      "AI không tạo được ảnh. Vui lòng thử lại với mô tả khác." +
        (textContent ? ` Phản hồi: ${textContent}` : "")
    );
  }

  return { image: imageData, text: textContent };
}
