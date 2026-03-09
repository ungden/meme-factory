import { GoogleGenAI } from "@google/genai";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key") {
    throw new Error("GEMINI_API_KEY is not configured in .env.local");
  }
  return new GoogleGenAI({ apiKey });
}

export interface MemeContentResult {
  headline: string;
  subtext?: string;
  caption?: string;
  tone: string;
  text_position: "top" | "bottom" | "center" | "split";
  suggested_characters: {
    character_id: string;
    character_name: string;
    suggested_emotion: string;
    reasoning: string;
    position: "left" | "right" | "center";
  }[];
}

export async function generateMemeContent(params: {
  idea: string;
  projectStyle?: string;
  characters: {
    id: string;
    name: string;
    personality: string;
    description: string;
    available_emotions: string[];
  }[];
  numVariations?: number;
  referenceImages?: { base64: string; mimeType: string }[];
}): Promise<MemeContentResult[]> {
  const ai = getClient();
  const { idea, projectStyle, characters, numVariations = 3, referenceImages } = params;

  const characterList = characters
    .map(
      (c) =>
        `- "${c.name}" (ID: ${c.id}): ${c.description}. Tính cách: ${c.personality}. Biểu cảm có sẵn: ${c.available_emotions.join(", ")}`
    )
    .join("\n");

  const hasRefImages = referenceImages && referenceImages.length > 0;

  const prompt = `Bạn là chuyên gia sáng tạo meme cho fanpage Việt Nam, giống phong cách "Bò và Gấu", "Thỏ Bảy Màu".

NHIỆM VỤ: Chuyển ý tưởng của user thành ${numVariations} phiên bản meme content khác nhau.

Ý TƯỞNG GỐC: "${idea}"
${hasRefImages ? `\nẢNH THAM KHẢO: User đã đính kèm ${referenceImages!.length} ảnh reference. Hãy PHÂN TÍCH KỸ nội dung, context, mood, style của các ảnh này để:\n- Hiểu rõ hơn ý tưởng user muốn truyền tải\n- Tham khảo bố cục, style, cách đặt text nếu ảnh là meme mẫu\n- Lấy thông tin context nếu ảnh là screenshot tin tức, biểu đồ, sự kiện\n- Tạo content phù hợp với mood/tone từ ảnh reference` : ""}

${projectStyle ? `PHONG CÁCH FANPAGE: ${projectStyle}` : ""}

CÁC NHÂN VẬT CÓ SẴN:
${characterList}

YÊU CẦU:
1. Headline: Ngắn gọn, dễ đọc trên ảnh (tối đa 50 ký tự), đúng giọng meme Việt Nam
2. Subtext (optional): Câu phụ bổ sung nếu cần (tối đa 30 ký tự)
3. Caption: Nội dung đăng kèm trên social media (2-3 câu)
4. Chọn nhân vật phù hợp nhất với nội dung, giải thích lý do
5. Gợi ý biểu cảm phù hợp từ danh sách có sẵn
6. Gợi ý vị trí text (top/bottom/center/split)

Trả về JSON array, mỗi phần tử có format:
{
  "headline": "...",
  "subtext": "...",
  "caption": "...",
  "tone": "hài hước/châm biếm/tình cảm/motivational/...",
  "text_position": "top|bottom|center|split",
  "suggested_characters": [
    {
      "character_id": "...",
      "character_name": "...",
      "suggested_emotion": "...",
      "reasoning": "...",
      "position": "left|right|center"
    }
  ]
}

CHỈ trả về JSON array, không có text khác.`;

  // Build multimodal contents: text + reference images
  const contents: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [{ text: prompt }];

  if (hasRefImages) {
    for (const img of referenceImages!.slice(0, 4)) {
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: contents,
    config: {
      responseMimeType: "application/json",
      temperature: 0.9,
    },
  });

  const text = response.text ?? "[]";
  
  try {
    const results = JSON.parse(text) as MemeContentResult[];
    return results;
  } catch {
    console.error("Failed to parse Gemini response:", text);
    return [];
  }
}
