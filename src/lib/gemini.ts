import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/lib/server-secrets";

async function getClient() {
  const apiKey = await getGeminiApiKey();
  return new GoogleGenAI({ apiKey });
}

export interface MemeContentResult {
  headline: string;
  subtext?: string;
  caption?: string;
  image_prompt?: string;
  text_rendering_notes?: string;
  tone: string;
  text_position: "top" | "bottom" | "center" | "split";
  visual_direction?: {
    scene: string;
    character_styling: string;
    composition: string;
    camera: string;
    lighting: string;
    art_style: string;
  };
  suggested_characters: {
    character_id: string;
    character_name: string;
    suggested_emotion: string;
    reasoning: string;
    position: "left" | "right" | "center";
  }[];
}

export interface SuggestedCharacterResult {
  name: string;
  role: string;
  personality: string;
  description: string;
  why_fit: string;
}

export async function suggestCharactersForFanpage(params: {
  fanpageDescription: string;
  projectStyle?: string;
  count?: number;
}): Promise<SuggestedCharacterResult[]> {
  const ai = await getClient();
  const count = Math.min(Math.max(params.count || 4, 2), 6);

  const prompt = `Bạn là chuyên gia xây mascot/fanpage character cho social content Việt Nam.

Mô tả fanpage:
${params.fanpageDescription}

${params.projectStyle ? `Phong cách thương hiệu: ${params.projectStyle}` : ""}

Nhiệm vụ:
- Gợi ý ${count} nhân vật mascot phù hợp để làm nội dung fanpage lâu dài.
- Mỗi nhân vật phải khác nhau rõ về vai trò trong team content.
- Viết tiếng Việt tự nhiên, ngắn gọn, thực dụng.
- Tránh tên quá dài hoặc trùng nhau.

Trả về JSON array theo schema:
[
  {
    "name": "...",
    "role": "...",
    "personality": "...",
    "description": "...",
    "why_fit": "..."
  }
]

Chỉ trả JSON array, không kèm văn bản khác.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const text = response.text ?? "[]";
  try {
    const parsed = JSON.parse(text) as SuggestedCharacterResult[];
    return Array.isArray(parsed) ? parsed.slice(0, count) : [];
  } catch {
    console.error("Failed to parse character suggestion response:", text);
    return [];
  }
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
  adHocCharacters?: string[];
  noCharacters?: boolean;
  numVariations?: number;
  referenceImages?: { base64: string; mimeType: string }[];
}): Promise<MemeContentResult[]> {
  const ai = await getClient();
  const { idea, projectStyle, characters, adHocCharacters = [], noCharacters = false, numVariations = 3, referenceImages } = params;

  const characterList = noCharacters ? "" : characters
    .map(
      (c) =>
        `- "${c.name}" (ID: ${c.id}): ${c.description}. Tính cách: ${c.personality}. Biểu cảm có sẵn: ${c.available_emotions.join(", ")}`
    )
    .join("\n");

  const hasRefImages = referenceImages && referenceImages.length > 0;

  const characterSection = noCharacters
    ? `CHẾ ĐỘ: KHÔNG DÙNG NHÂN VẬT THƯ VIỆN.
User muốn tạo meme KHÔNG có nhân vật mascot riêng. Meme này dùng người nổi tiếng, meme template, hoặc tình huống đời thường.
- suggested_characters PHẢI để rỗng [].
- image_prompt mô tả người/nhân vật cụ thể theo ý tưởng (VD: Donald Trump, Elon Musk, anh shipper, cô gái văn phòng...) hoặc scene thuần tuý.
- KHÔNG tự bịa nhân vật mascot hay character_id.`
    : `NHÂN VẬT CÓ SẴN:
${characterList || "(Chưa có nhân vật sẵn)"}

NHÂN VẬT MENTION 1 LẦN:
${adHocCharacters.length > 0 ? adHocCharacters.map((n) => `- ${n}`).join("\n") : "(Không có)"}`;

  const prompt = `Bạn là admin fanpage meme Việt Nam lâu năm, chuyên viết content viral. Bạn hiểu rõ cách nói chuyện trên mạng xã hội VN: tự nhiên, sắc, đời thường, hơi láo đúng lúc. Đọc lên phải thấy như người thật nghĩ ra, không phải AI hay copywriter.

NHIỆM VỤ: Viết ${numVariations} phiên bản meme từ ý tưởng bên dưới. Mỗi phiên bản phải khác nhau rõ ràng về góc nhìn hoặc cách đẩy joke. BÁM SÁT ý tưởng gốc — không được đi xa khỏi chủ đề user đưa ra.

Ý TƯỞNG: "${idea}"
${hasRefImages ? `\nẢNH THAM KHẢO: User đính kèm ${referenceImages!.length} ảnh. Phân tích context, mood, style từ ảnh để content sát thực tế hơn.` : ""}

${projectStyle ? `PHONG CÁCH FANPAGE: ${projectStyle}` : ""}

${characterSection}

=== TÁCH RÕ TEXT TRÊN ẢNH VS PROMPT ẢNH ===
- headline = CHÍNH XÁC text chính phải render lên ảnh
- subtext = CHÍNH XÁC text phụ phải render lên ảnh, nếu không cần thì null
- image_prompt = mô tả cảnh/hành động/biểu cảm/bối cảnh chỉ dành cho AI vẽ ảnh
- text_rendering_notes = ghi chú về cách đặt text, kiểu text, speech bubble hay caption trong khung hình
- TUYỆT ĐỐI không nhét mô tả cảnh vào headline hoặc subtext
- TUYỆT ĐỐI không nhét text cần render lên ảnh vào image_prompt, trừ khi đó là yêu cầu về speech bubble và phải ghi ở text_rendering_notes

=== GIỌNG VĂN — QUAN TRỌNG NHẤT ===
Headline PHẢI giống cách người Việt thực sự nói/nghĩ. Hãy tưởng tượng đây là câu người ta lẩm bẩm trong đầu, nhắn trong group chat, hoặc post story than thở.

VÍ DỤ HEADLINE HAY:
- "Lương chưa về mà Shopee đã gửi mã"
- "Khi sếp nói 'cuối tuần rảnh không'"
- "Thứ 2 lại đến rồi, ai cho nó đến vậy"
- "Cầm 10 triệu vào crypto, ra 3 triệu kinh nghiệm"
- "Debug từ sáng, bug từ hôm qua"
- "Khi bạn nói '5 phút nữa' lần thứ 4"
- "Ơ sao tự nhiên tháng này hết tiền sớm vậy"
- "Thị trường xanh nhưng mã mình vẫn đỏ như thường"

VÍ DỤ GƯỢNG / AI VIBE — CẤM DÙNG:
- "Hành trình tài chính đầy thử thách!"
- "Khi công nghệ và đam mê gặp nhau"
- "Nỗi đau của nhà đầu tư thông minh"
- "Chiến binh thị trường chứng khoán"
- "Cùng nhau vượt qua khó khăn nào!"
- "Đây chính là khoảnh khắc đáng nhớ"
- "Bài học sâu sắc sau biến động"
- "Trạng thái cảm xúc khó diễn tả"

NGUYÊN TẮC VIẾT:
- BÁM SÁT Ý TƯỞNG GỐC: Headline/subtext/image_prompt phải xoay quanh đúng chủ đề user nhập. Không được đổi sang chủ đề khác dù có liên quan. Nếu user nói về Trump thì meme phải về Trump, không được chuyển thành meme chung chung.
- Viết như đang kể chuyện, than, cà khịa hoặc tự bóc phốt bản thân
- Ưu tiên 1 tình huống cụ thể, có thể hình dung ngay, thay vì ý lớn chung chung
- Headline tối đa 2 vế; tránh văn mẫu, tránh khẩu hiệu, tránh triết lý sống
- Được phép dùng từ rất đời thường nếu hợp tone: "ơ", "ủa", "vãi", "chán vl", "toang", "cay", "éo hiểu"...
- Không dùng giọng MC event, motivational speaker, brand manager, content tuyển dụng, báo chí
- Nếu đọc lên mà không tưởng tượng nổi một người thật sẽ nói câu đó, thì phải tự viết lại
- Headline tối đa 80 ký tự; đừng cắt cụt câu chỉ để ngắn
- Subtext chỉ dùng khi thật sự tăng lực cho punchline; không bắt buộc
- Caption ngắn, 1-2 câu, giọng nói chuyện; có thể để null nếu headline đã đủ mạnh

=== COMEDIC ANGLE ===
Mỗi variation phải chọn 1 angle khác nhau. Không được chỉ thay vài từ rồi gọi là variation mới.
Các angle nên rải ra giữa các kiểu sau:
- relatable complaint: than thở đúng nỗi đau thường ngày
- self-burn: tự dìm bản thân, tự nhận ngu
- observational: chọc đúng một pattern ai cũng từng gặp
- dialogue/thought bubble: câu thoại hoặc suy nghĩ nội tâm
- absurd escalation: phóng đại vô lý nhưng vẫn đúng mood
- deadpan: câu rất tỉnh nhưng buồn cười vì quá thật

=== QUY TẮC CHỌN NHÂN VẬT ===
${noCharacters ? `- User đã chọn KHÔNG DÙNG NHÂN VẬT THƯ VIỆN. suggested_characters BẮT BUỘC là mảng rỗng [].
- KHÔNG tự tạo character_id hay character_name. image_prompt mô tả trực tiếp người/nhân vật trong scene.` : `- Ưu tiên nhân vật có sẵn nếu phù hợp. Giải thích ngắn gọn, thật cụ thể.
- Nhân vật mention 1 lần được phép dùng dù không có trong thư viện
- Nếu không nhân vật nào hợp thì để suggested_characters rỗng []
- Gợi ý biểu cảm từ danh sách có sẵn (nếu dùng nhân vật thư viện)`}

=== VISUAL DIRECTION ===
Tạo visual_direction chi tiết cho AI image gen:
- scene: bối cảnh cụ thể, có chi tiết đời thường
- character_styling: thần thái, outfit, nét mặt đúng tình huống
- composition: vị trí nhân vật, foreground/background rõ ràng
- camera: góc máy, cỡ cảnh
- lighting: ánh sáng
- art_style: phong cách minh hoạ

image_prompt phải là 1 đoạn ngắn 1-3 câu, viết như art director brief:
- mô tả rõ ai đang làm gì, ở đâu, cảm xúc nào, vật thể nào cần xuất hiện
- chỉ mô tả phần hình ảnh, không lặp lại headline/subtext
- đủ cụ thể để model ảnh hiểu scene ngay cả khi bỏ qua phần headline

text_rendering_notes phải nói thật rõ:
- text nào là headline cố định trên ảnh
- có/không có subtext
- text nằm top/bottom/center/split hay trong speech bubble
- nếu là thoại nhân vật thì ghi rõ nhân vật nào nói câu nào

=== TỰ KIỂM TRA TRƯỚC KHI TRẢ KẾT QUẢ ===
Tự chấm từng variation theo 4 tiêu chí sau, thang điểm 1-10:
- naturalness: có giống người Việt thật nói không?
- specificity: có đủ cụ thể để tưởng tượng ra tình huống không?
- memeability: có punchline hoặc độ relatable không?
- distinctness: có khác hẳn các variation còn lại không?
Chỉ giữ variation đạt ít nhất 8/10 ở cả naturalness và memeability.
Loại bỏ mọi câu có mùi PR, self-help, thơ ca, báo chí, hoặc "AI trying to be funny".

Trả về JSON array, mỗi phần tử:
{
  "headline": "...",
  "subtext": "..." hoặc null,
  "caption": "..." hoặc null,
  "image_prompt": "...",
  "text_rendering_notes": "..." hoặc null,
  "tone": "hài hước/châm biếm/tự sự/absurd/wholesome/dark humor/...",
  "text_position": "top|bottom|center|split",
  "visual_direction": {
    "scene": "...",
    "character_styling": "...",
    "composition": "...",
    "camera": "...",
    "lighting": "...",
    "art_style": "..."
  },
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
    model: "gemini-3-flash-preview",
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
