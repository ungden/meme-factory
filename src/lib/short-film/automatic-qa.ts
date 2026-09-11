import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { getGeminiApiKey } from "@/lib/server-secrets";
import type { ChannelProfile, Story } from "../family-catalogue";
import type { FilmPlan, FilmTask } from "./contracts";
import { performanceCheck } from "../performance-direction";

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
  const check = await judge([
    {
      text: `Bạn kiểm duyệt kịch bản family catalogue trước khi hệ thống chi tiền sinh media. Chỉ passed khi câu chuyện rõ trong 2 giây đầu, setup/payoff có quan hệ nhân quả, hành động khả thi theo tuổi/vóc dáng và mọi người nói thuộc cast. Đọc từng câu như lời nói thật: đánh dấu needs_review và nêu đúng câu nếu nó là văn hành chính, ẩn dụ/chơi chữ gượng, giải thích điều khán giả vừa thấy, hoặc có thể đổi người nói mà không đổi tính cách. Trẻ có thể nói như người lớn khi bắt chước để đạt một lợi ích trẻ con; không được nói câu đối đẹp hay bài học chỉ để kết êm. Payoff không được dựa vào việc nhân vật đột ngột quên hoặc làm trái điều vừa hiểu. Không bắt buộc cú lật, hòa giải hay reaction cuối; đánh dấu reaction thừa nếu bỏ nó thì kết hay hơn. Đặc biệt đánh dấu needs_review nếu trẻ nhỏ phải cõng/nâng trẻ lớn hơn, hành động nguy hiểm, lặp mô-típ gần đây, hoặc nhiều câu liên tiếp không làm tình thế thay đổi. Không sửa kịch bản.\nHỒ SƠ: ${JSON.stringify(profile)}\nKỊCH BẢN: ${JSON.stringify(story)}\nCẢNH: ${JSON.stringify(plan.video_plan_scenes.map((s) => ({ speaker: s.speaker_character_id, storyboard: s.storyboard, dialogue: s.dialogue, action: s.action, cast: s.cast_snapshot.map((c) => c.characterId) })))}`,
    },
  ]);
  const directions = plan.video_plan_scenes.map((scene) =>
    scene.performance_direction || scene.storyboard?.performanceDirection || null,
  );
  const checks = directions.map((direction) =>
    direction ? performanceCheck(direction) : null,
  );
  const directionIssues = checks.flatMap((item, index) =>
    item && item.status !== "passed"
      ? item.issues.map((issue) => `Cảnh ${index + 1}: ${issue.reason}`)
      : [],
  );
  return {
    ...check,
    status:
      directionIssues.length && check.status === "passed"
        ? "needs_review"
        : check.status,
    issues: [...check.issues, ...directionIssues].slice(0, 8),
    evidence: { ...check.evidence, performanceCheck: checks },
  };
}

async function inline(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`QA_MEDIA_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("QA_MEDIA_EMPTY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) throw new Error("QA_MEDIA_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
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
        text: `Kiểm tra ảnh hoặc toàn bộ video của một shot phim 3D. Với kind video và audioMode dubbed, đây là chuyển động im tiếng trước lồng tiếng: chỉ kiểm tra hình và đúng người diễn từng lượt, không đòi audio. Với kind dub, bắt buộc nghe/xem đúng người nói, kiểm tra lệch môi; ghép audio thành công không chứng minh khớp môi. Media đầu tiên là kết quả; các ảnh sau là ảnh chuẩn từng nhân vật. Chỉ passed khi đúng số người và đúng nhận diện, khuôn mặt/tóc/trang phục không trôi, không thêm người/chữ/lưới và hình không lỗi. Nếu có storyboard, kiểm tra từng lượt nói theo thứ tự: người nói thay đổi theo mỗi beat, chỉ đúng người ấy cử động môi theo lời trong lượt đó; các nhân vật khác nghe và phản ứng không lời. Mốc beat là dự kiến, không dùng làm bằng chứng audio thực; xem/nghe video để kiểm tra thứ tự, đủ câu và đúng người. Shot đơn không storyboard chỉ có một người nói được chỉ định xuyên suốt. Cận cảnh có thể chỉ hiện người nói; khung mở phải có đủ cast, không phạt vì camera chuyển sang cận cảnh theo storyboard. Nếu không nhìn/nghe đủ để xác định người nói, nếu miệng người khác chuyển động như đang nói, hoặc chỉ có ảnh ghép tĩnh thì needs_review. Không suy đoán và không dùng kịch bản dự kiến thay cho bằng chứng nghe/nhìn.\nTASK: ${JSON.stringify({ audioMode: task.input.audioMode, kind: task.kind, cast: task.input.cast, dialogue: task.input.dialogue, speakerCharacterId: task.input.speakerCharacterId, storyboard: task.input.storyboard })}`,
      },
      await inline(mediaUrl),
    ];
    for (const url of referenceUrls.slice(0, 4)) parts.push(await inline(url));
    return judge(parts);
  } catch (error) {
    if (error instanceof Error && error.message === "QA_MEDIA_TOO_LARGE")
      return {
        status: "needs_review",
        issues: [
          "Video quá lớn để kiểm tra người nói tự động; cần xem trực tiếp.",
        ],
        evidence: { reason: error.message },
      };
    throw error;
  }
}

/** Moving media is checked through a full-duration proxy. The delivery master
 * remains untouched and can be much larger than Gemini's inline payload. */
export function visualEvidencePath(task: FilmTask): string {
  const result = task.result || {};
  if (["video", "lip_sync", "dub"].includes(task.kind))
    return String(result.qaPreviewPath || result.path || "");
  return String(result.path || "");
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
    return Number(r.speechError) <=
      (task.input.audioMode === "dubbed" ? 0.3 : 0.2) &&
      Array.isArray(r.segments) &&
      (!task.input.dialogue || r.segments.length > 0)
      ? {
          status: "passed",
          issues: [],
          evidence: {
            speechError: r.speechError,
            segmentCount: r.segments.length,
            threshold: task.input.audioMode === "dubbed" ? 0.3 : 0.2,
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
  if (["video", "lip_sync", "dub", "frame", "image"].includes(task.kind))
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
