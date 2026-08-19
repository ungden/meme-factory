import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/lib/server-secrets";
import { resolveArtDirection, type ArtDirectionId } from "@/lib/mascot-art-direction";
import { stripImageMetadata } from "@/lib/image-metadata";

// ============================================
// Gemini Nano Banana 2 - Image Generation
// Uses the stable gemini-3.1-flash-image model
// Server-side only (called from API routes)
// ============================================

export const IMAGE_MODEL = "gemini-3.1-flash-image";

export interface ImageGenerationUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
  candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
}

export interface GeneratedImageResult {
  image: string;
  text?: string;
  usage?: ImageGenerationUsage;
}

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
  artDirection?: ArtDirectionId;
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

  const memeDirection = resolveArtDirection(params.artDirection);
  const defaultMemeStyle = `Phong cách: ${memeDirection.memeStyle} Bố cục rõ ràng, bắt mắt trên news feed. Đây là ảnh dựng 3D, KHÔNG phải ảnh chụp thật.`;

  return `Bạn là art director dựng ảnh 3D cho mạng xã hội Việt Nam.
Nhiệm vụ của bạn là dựng một ảnh 3D chất lượng cao theo đúng các yêu cầu bên dưới.

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
${defaultMemeStyle}${style ? `\nGhi chú thương hiệu (chỉ chỉnh tông màu và cảm xúc, KHÔNG đổi phong cách dựng hình): ${style}` : ""}
Tone/Mood: ${tone}
${watermark?.enabled ? `\nWatermark: Góc dưới cùng bên phải. ${watermark.text ? `Chữ: "${watermark.text}"` : ""}` : ""}

=== 5. QUY TẮC CẤM (NEGATIVE PROMPT) ===
- KHÔNG ảnh chụp người thật, KHÔNG phong cách tài liệu/đời thực. Đây là nhân vật hoạt hình được dựng 3D.
- KHÔNG viền nét đen kiểu truyện tranh, KHÔNG màu phẳng.
- KHÔNG tạo nhân vật mới khác loài nếu đã có ảnh tham khảo (Reference). Bắt buộc dựng giống hệt ảnh mẫu.
`;
}

// ============================================
// 1. Generate Full Meme Image
// ============================================
export async function generateMemeImage(
  params: GenerateMemeImageParams
): Promise<GeneratedImageResult> {
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
export type BaseLayoutGroup = "tight_closeup" | "medium_portrait" | "offset_composition";

export interface GenerateCharacterPoseParams {
  characterName: string;
  characterDescription: string;
  emotion: string;
  /** House art direction. Defaults to the 3D look. */
  artDirection?: ArtDirectionId;
  /** Free-text brand note. Layered on top of the art direction, never replacing it. */
  style?: string;
  existingPoseImages?: { base64: string; mimeType: string }[];
  /** Set when generating a meme template: framing plus a reserved caption area. */
  layoutGroup?: BaseLayoutGroup;
  subjectSide?: "left" | "right";
  aspectRatio?: string;
}

/**
 * Framing and reserved empty space per layout group. The reserved region matches
 * the safe zones in `layout_presets`, so the caption the editor places later lands
 * on flat background rather than on the mascot.
 */
const LAYOUT_BRIEFS: Record<BaseLayoutGroup, { framing: string; reserved: string }> = {
  tight_closeup: {
    framing: "Cận mặt: đầu và vai chiếm phần giữa khung, cắt ngang ngực. KHÔNG vẽ toàn thân.",
    reserved: "20% phía trên và 22% phía dưới khung",
  },
  medium_portrait: {
    framing: "Trung cảnh: thấy rõ đầu, vai và phần thân trên, cắt ngang eo.",
    reserved: "26% phía trên khung",
  },
  offset_composition: {
    framing: "Toàn thân đặt lệch hẳn sang MỘT BÊN khung, chừa nguyên nửa khung còn lại trống.",
    reserved: "45% chiều ngang ở phía đối diện nhân vật",
  },
};

export function compileCharacterPosePrompt(params: GenerateCharacterPoseParams) {
  const { characterName, characterDescription, emotion, style, existingPoseImages, layoutGroup } =
    params;

  const brief = layoutGroup ? LAYOUT_BRIEFS[layoutGroup] : null;
  const sideText =
    params.subjectSide === "right"
      ? " Nhân vật đứng lệch sang PHẢI, vùng trống nằm bên TRÁI."
      : params.subjectSide === "left"
        ? " Nhân vật đứng lệch sang TRÁI, vùng trống nằm bên PHẢI."
        : "";
  // Requirement 1 demands a full body, which is impossible for a close-up, so a
  // template request replaces it instead of appending to it.
  const framingRule = brief
    ? `1. BỐ CỤC: ${brief.framing}${sideText}
   CHỪA TRỐNG HOÀN TOÀN ${brief.reserved} — không chi tiết, không tay/chân/tóc/phụ kiện/hiệu ứng lấn vào; vùng đó chỉ là nền phẳng để ghép chữ sau.`
    : "1. Full body character (toàn thân), KHÔNG bị cắt, nhìn rõ từ đầu đến chân";

  // The art direction always applies; a project's free-text style is a brand note
  // layered on top. Previously any style string replaced the whole block, which is
  // how projects silently lost the house look.
  const direction = resolveArtDirection(params.artDirection);
  const artDirectionBlock = `${direction.characterStyle}
- Phong cách chỉ quyết định NÉT DỰNG / ÁNH SÁNG / CHẤT LIỆU / TỈ LỆ / MÀU SẮC
- KHÔNG dùng phong cách để tự thêm trang phục, phụ kiện, nghề nghiệp hay đổi loài nhân vật
- Biểu cảm khuôn mặt rõ ràng, có cá tính, đúng cảm xúc được yêu cầu`;

  const brandNoteBlock = style
    ? `\n\nGHI CHÚ THƯƠNG HIỆU (chỉ chỉnh tông màu và cảm xúc, KHÔNG đổi phong cách dựng hình): ${style}`
    : "";

  return `Bạn là art director dựng nhân vật 3D cho thương hiệu. Hãy dựng một mascot 3D chất lượng cao, có cá tính rõ, dùng được cho fanpage Việt Nam.

NHÂN VẬT: "${characterName}"
MÔ TẢ CHI TIẾT: ${characterDescription}
BIỂU CẢM/TƯ THẾ CẦN THỂ HIỆN: ${emotion}

${artDirectionBlock}${brandNoteBlock}

YÊU CẦU BẮT BUỘC:
${framingRule}
2. Background: TRẮNG TINH (#FFFFFF) hoặc gradient nhạt đơn giản — để dễ tách nền
3. Dựng hình sạch, chi tiết rõ, chất lượng như phim hoạt hình rạp
4. Biểu cảm khuôn mặt: Emotion "${emotion}" phải thể hiện RÕ RÀNG trên mặt — phù hợp tính cách nhân vật
5. Trang phục và phụ kiện: THEO ĐÚNG MÔ TẢ NHÂN VẬT bên trên — KHÔNG tự thêm trang phục/phụ kiện ngoài mô tả, kể cả khi phong cách gợi nhớ streetwear/corporate/graffiti/anime...
6. Tư thế tự nhiên, có năng lượng, phù hợp với emotion và tính cách nhân vật
7. Rendering chất lượng cao, đúng chất liệu và ánh sáng của phong cách đã chọn
8. KHÔNG có text, chữ viết, watermark, logo trên ảnh
9. Nhân vật phải có đặc điểm nhận dạng UNIQUE, dễ nhớ, phù hợp làm mascot fanpage
${existingPoseImages?.length ? "10. QUAN TRỌNG NHẤT: Giữ CHÍNH XÁC design, phong cách, tỉ lệ cơ thể, màu sắc outfit, và mọi đặc điểm nhận dạng của nhân vật từ các ảnh reference đính kèm. Chỉ thay đổi biểu cảm và tư thế." : ""}`;
}

export async function generateCharacterPose(
  params: GenerateCharacterPoseParams
): Promise<GeneratedImageResult> {
  const ai = await getClient();
  const { existingPoseImages } = params;
  const prompt = compileCharacterPosePrompt(params);
  const poseAspectRatio = FORMAT_TO_ASPECT[params.aspectRatio ?? "1:1"] || "1:1";

  const contents: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [{ text: prompt }];

  // Existing poses arrive pre-routed by the deterministic Reference Router,
  // which already applies the provider identity budget. Do not slice again here.
  if (existingPoseImages) {
    for (const img of existingPoseImages) {
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
        aspectRatio: poseAspectRatio,
        imageSize: "1K",
      },
    },
  });

  return extractImageFromResponse(response);
}

// ============================================
// 3. Generate Background
// ============================================
export interface GenerateBackgroundParams {
  description: string;
  mood?: string;
  format: string;
}

export function compileBackgroundPrompt(params: GenerateBackgroundParams) {
  const { description, mood, format } = params;

  return `Tạo một background image cho meme fanpage Việt Nam.

MÔ TẢ: ${description}
${mood ? `MOOD/TONE: ${mood}` : ""}

YÊU CẦU:
1. KHÔNG có text, chữ viết, hoặc watermark trên background
2. KHÔNG có nhân vật hoặc người
3. Để nhiều negative space (khoảng trống) ở phần trên và giữa cho việc ghép text và nhân vật lên sau
4. Màu sắc hài hòa, phù hợp với mood
5. Chất lượng cao, phù hợp đăng social media
6. Tỉ lệ ${format}`;
}

export async function generateBackground(
  params: GenerateBackgroundParams
): Promise<GeneratedImageResult> {
  const ai = await getClient();
  const aspectRatio = FORMAT_TO_ASPECT[params.format] || "1:1";
  const prompt = compileBackgroundPrompt(params);

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
function extractImageFromResponse(response: any): GeneratedImageResult {
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

  // Gỡ metadata (EXIF/XMP/C2PA/text chunk...) ngay tại điểm ảnh rời khỏi
  // provider, để mọi đường ra sau đó — trả về client, tải xuống, upload lên
  // storage — đều dùng chung một bản đã sạch.
  imageData = sanitizeGeneratedImage(imageData);

  const metadata = response?.usageMetadata;
  const usage: ImageGenerationUsage | undefined = metadata ? {
    promptTokenCount: metadata.promptTokenCount,
    candidatesTokenCount: metadata.candidatesTokenCount,
    thoughtsTokenCount: metadata.thoughtsTokenCount,
    totalTokenCount: metadata.totalTokenCount,
    promptTokensDetails: metadata.promptTokensDetails,
    candidatesTokensDetails: metadata.candidatesTokensDetails,
  } : undefined;

  return { image: imageData, text: textContent, usage };
}

// ============================================
// Helper: Strip provenance metadata from provider output
// ============================================
// Chỉ gỡ metadata trong file (EXIF, XMP, IPTC, C2PA/Content Credentials, text
// chunk). KHÔNG gỡ được SynthID — watermark ẩn Google nhúng vào pixel.
function sanitizeGeneratedImage(base64Image: string): string {
  try {
    const raw = Buffer.from(base64Image, "base64");
    const result = stripImageMetadata(new Uint8Array(raw));
    if (result.bytesRemoved === 0) return base64Image;

    console.info(
      `[image-metadata] stripped ${result.removed.join(", ")} (${result.bytesRemoved} bytes) from ${result.format}`
    );
    return Buffer.from(result.bytes).toString("base64");
  } catch (error) {
    // Ảnh vẫn dùng được — không để bước dọn metadata làm hỏng cả lần generate.
    console.error("[image-metadata] strip failed, returning original image:", error);
    return base64Image;
  }
}
