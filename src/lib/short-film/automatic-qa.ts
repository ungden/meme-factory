import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { getGeminiApiKey } from "@/lib/server-secrets";
import type { ChannelProfile, Story } from "../family-catalogue";
import type { FilmPlan, FilmTask } from "./contracts";

type Check = {
  status: "passed" | "needs_review" | "failed";
  issues: string[];
  evidence: Record<string, unknown>;
};
const resultSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["passed", "needs_review", "failed"] },
    issues: { type: "array", items: { type: "string" }, maxItems: 8 },
    summary: { type: "string" },
  },
  required: ["status", "issues", "summary"],
  additionalProperties: false,
};

async function judge(parts: Array<Record<string, unknown>>): Promise<Check> {
  const ai = new GoogleGenAI({ apiKey: await getGeminiApiKey() });
  const response = await ai.models.generateContent({
    model: process.env.CREATIVE_TEXT_MODEL || "gemini-3-flash-preview",
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: resultSchema,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel },
      httpOptions: { timeout: 45000 },
    },
  });
  const value = JSON.parse(response.text || "{}") as {
    status?: string;
    issues?: unknown;
    summary?: unknown;
  };
  const status = ["passed", "needs_review", "failed"].includes(
    String(value.status),
  )
    ? (value.status as Check["status"])
    : "needs_review";
  return {
    status,
    issues: Array.isArray(value.issues)
      ? value.issues
          .filter((x): x is string => typeof x === "string")
          .slice(0, 8)
      : ["AI_QA_INVALID"],
    evidence: {
      summary:
        typeof value.summary === "string" ? value.summary.slice(0, 1000) : "",
    },
  };
}

export async function checkProductionScript(
  plan: FilmPlan,
  profile: ChannelProfile | null,
): Promise<Check> {
  if (!plan.story || !profile)
    return {
      status: "needs_review",
      issues: ["Kịch bản không có hồ sơ kênh có phiên bản."],
      evidence: {},
    };
  const story = plan.story as Story;
  return judge([
    {
      text: `Bạn kiểm duyệt kịch bản family catalogue trước khi hệ thống chi tiền sinh media. Chỉ passed khi câu chuyện rõ trong 2 giây đầu, setup/payoff có quan hệ nhân quả, hành động khả thi theo tuổi/vóc dáng và mọi người nói thuộc cast. Đọc từng câu như lời nói thật: đánh dấu needs_review và nêu đúng câu nếu nó là văn hành chính, ẩn dụ/chơi chữ gượng, giải thích điều khán giả vừa thấy, hoặc có thể đổi người nói mà không đổi tính cách. Trẻ có thể nói như người lớn khi bắt chước để đạt một lợi ích trẻ con; không được nói câu đối đẹp hay bài học chỉ để kết êm. Payoff không được dựa vào việc nhân vật đột ngột quên hoặc làm trái điều vừa hiểu. Không bắt buộc cú lật, hòa giải hay reaction cuối; đánh dấu reaction thừa nếu bỏ nó thì kết hay hơn. Đặc biệt đánh dấu needs_review nếu trẻ nhỏ phải cõng/nâng trẻ lớn hơn, hành động nguy hiểm, lặp mô-típ gần đây, hoặc nhiều câu liên tiếp không làm tình thế thay đổi. Không sửa kịch bản.\nHỒ SƠ: ${JSON.stringify(profile)}\nKỊCH BẢN: ${JSON.stringify(story)}\nCẢNH: ${JSON.stringify(plan.video_plan_scenes.map((s) => ({ speaker: s.speaker_character_id, dialogue: s.dialogue, action: s.action, cast: s.cast_snapshot.map((c) => c.characterId) })))}`,
    },
  ]);
}

async function inline(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`QA_MEDIA_${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("QA_MEDIA_TOO_LARGE");
  return {
    inlineData: {
      mimeType: response.headers.get("content-type") || "image/jpeg",
      data: Buffer.from(bytes).toString("base64"),
    },
  };
}

export async function checkVisualTask(
  task: FilmTask,
  mediaUrl: string,
  referenceUrls: string[],
): Promise<Check> {
  try {
    const parts: Array<Record<string, unknown>> = [
      {
        text: `Kiểm tra ảnh hoặc toàn bộ video của một shot phim 3D. Media đầu tiên là kết quả; các ảnh sau là ảnh chuẩn từng nhân vật. Chỉ passed khi đúng số người và đúng nhận diện, khuôn mặt/tóc/trang phục không trôi, không thêm người/chữ/lưới và hình không lỗi. Nếu là video có thoại, xem xuyên suốt đoạn: đúng characterId được chỉ định phải là người duy nhất cử động môi theo lời; mọi người nghe giữ miệng đóng và chỉ phản ứng không lời. Nếu không nhìn/nghe đủ để xác định người nói, nếu miệng người khác chuyển động như đang nói, hoặc chỉ có ảnh ghép tĩnh thì needs_review. Không suy đoán và không dùng kịch bản dự kiến thay cho bằng chứng nghe/nhìn.\nTASK: ${JSON.stringify({ kind: task.kind, cast: task.input.cast, dialogue: task.input.dialogue, speakerCharacterId: task.input.speakerCharacterId })}`,
      },
      await inline(mediaUrl),
    ];
    for (const url of referenceUrls.slice(0, 4))
      parts.push(await inline(url));
    return judge(parts);
  } catch (error) {
    if (error instanceof Error && error.message === "QA_MEDIA_TOO_LARGE")
      return {
        status: "needs_review",
        issues: ["Video quá lớn để kiểm tra người nói tự động; cần xem trực tiếp."],
        evidence: { reason: error.message },
      };
    throw error;
  }
}

export function checkTechnicalTask(task: FilmTask): Check {
  const r = task.result || {};
  if (task.kind === "tts")
    return Number(r.duration) > 0 && r.audio === true
      ? {
          status: "passed",
          issues: [],
          evidence: { duration: r.duration, audio: true },
        }
      : { status: "failed", issues: ["TTS thiếu audio hợp lệ."], evidence: r };
  if (task.kind === "transcribe")
    return Number(r.speechError) <= 0.2 && Array.isArray(r.segments)
      ? {
          status: "passed",
          issues: [],
          evidence: {
            speechError: r.speechError,
            segmentCount: r.segments.length,
          },
        }
      : {
          status: "needs_review",
          issues: ["Lời thực tế lệch kịch bản hoặc thiếu timestamp."],
          evidence: { speechError: r.speechError },
        };
  if (task.kind === "render")
    return r.path &&
      r.poster &&
      r.srt &&
      Number(r.duration) > 0 &&
      r.video === true &&
      r.audio === true
      ? {
          status: "passed",
          issues: [],
          evidence: { duration: r.duration, video: true, audio: true },
        }
      : {
          status: "failed",
          issues: ["Thành phẩm thiếu MP4, poster, SRT hoặc audio."],
          evidence: r,
        };
  if (["video", "lip_sync", "frame", "image"].includes(task.kind))
    return {
      status: "needs_review",
      issues: ["Cần kiểm tra hình ảnh."],
      evidence: {},
    };
  return {
    status: "needs_review",
    issues: ["Chưa có bộ kiểm tra cho công đoạn."],
    evidence: {},
  };
}
