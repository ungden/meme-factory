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
    requirementResults: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["passed", "uncertain", "failed"] },
          observation: { type: "string" },
          region: { type: "string" },
        },
        required: ["id", "status", "observation", "region"],
        additionalProperties: false,
      },
    },
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
  // maxOutputTokens là 1200 và requirementResults có thể tới 24 mục, nên phản
  // hồi hoàn toàn có thể bị cắt giữa chừng. Một SyntaxError trần sẽ trôi lên
  // tận catch cuối của production và hiện ra dưới dạng "Unexpected end of JSON
  // input" — vô nghĩa với người vận hành. Một kết quả QA bị cắt phải hỏng rõ
  // ràng, tuyệt đối không đoán tiếp.
  let value: {
    status?: string;
    issues?: unknown;
    summary?: unknown;
    requirementResults?: unknown;
  };
  try {
    value = JSON.parse(response.text || "{}");
  } catch {
    throw new Error("QA_RESULT_TRUNCATED");
  }
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
      requirementResults: Array.isArray(value.requirementResults)
        ? value.requirementResults.slice(0, 24)
        : [],
    },
  };
}

export async function checkProductionScript(
  plan: FilmPlan,
  profile: ChannelProfile | null,
): Promise<Check> {
  // Hand-written plans can predate the channel-profile link. Keep the QA gate
  // useful by deriving a minimal local profile from the frozen cast. A real
  // project profile is always preferred; this fallback never writes data back.
  const effectiveProfile: ChannelProfile = profile || {
    version: 0,
    positioning: "Family catalogue",
    audience: "Khán giả gia đình",
    tone: "Đời thường, tự nhiên, hài đảo vai",
    roles: [
      ...new Map(
        plan.video_plan_scenes.flatMap((scene) =>
          scene.cast_snapshot.map((member) => [
            member.characterId,
            {
              characterId: member.characterId,
              name: member.name,
              personality: "Nhân vật cố định trong project.",
            },
          ] as const),
        ),
      ).values(),
    ],
    series: ["Bố mẹ bị bắt bài"],
    avoid: [],
    references: [],
  };
  // Plans authored directly in the short-film editor may intentionally have
  // no writer metadata.  Build a small, deterministic story envelope from the
  // saved scenes so the same AI quality gate still runs without rejecting a
  // valid hand-written script.  This is only a QA view; it never mutates the
  // frozen plan or invents dialogue/media.
  const story = (plan.story as Story | null) || (() => {
    const scenes = plan.video_plan_scenes || [];
    const castIds = [
      ...new Set(
        scenes.flatMap((scene) =>
          scene.cast_snapshot.map((member) => member.characterId),
        ),
      ),
    ];
    const last = Math.max(0, scenes.length - 1);
    return {
      profileVersion: effectiveProfile.version,
      series: "Bố mẹ bị bắt bài",
      situation: plan.brief || plan.title,
      mechanism: "Đảo chiều người bị đánh giá",
      outcome: plan.caption || "Một lần so sánh bị quay ngược lại người lớn.",
      wants: castIds.map((characterId) => ({
        characterId,
        want: "Tham gia đúng vai trong câu chuyện.",
      })),
      beats: scenes.map((scene, index) => ({
        purpose: index === 0 ? "hook" : index === last ? "payoff" : "turn",
        description: scene.action || scene.dialogue || `Cảnh ${index + 1}`,
      })),
      payoff:
        plan.caption || scenes[last]?.action || "Người bị so sánh đảo chiều câu hỏi.",
      setup: plan.brief || plan.title,
      caption: plan.caption || "",
      dialogue: scenes
        .filter((scene) => scene.dialogue && scene.speaker_character_id)
        .map((scene) => ({
          characterId: scene.speaker_character_id as string,
          text: scene.dialogue as string,
          action: scene.action || "",
        })),
    } satisfies Story;
  })();
  // Guest scenes store plan-scoped ids while the story keeps its writer keys;
  // give the reviewer names for both so guest lines are verifiable cast.
  const nameById = new Map<string, string>();
  for (const scene of plan.video_plan_scenes)
    for (const member of scene.cast_snapshot) {
      nameById.set(member.characterId, member.name);
      if (member.guestKey) nameById.set(member.guestKey, member.name);
    }
  const storyForCheck = {
    ...story,
    dialogue: story.dialogue.map((line) => ({
      ...line,
      speakerName: nameById.get(line.characterId) || line.characterId,
    })),
    wants: (story.wants || []).map((want) => ({
      ...want,
      speakerName: nameById.get(want.characterId) || want.characterId,
    })),
  };
  const check = await judge([
    {
      text: `Bạn kiểm duyệt family catalogue trước khi hệ thống chi tiền sinh media. Kênh có cả tập HÀI và tập CINEMATIC CẢM ĐỘNG; bám đúng tone/diễn biến mà ý tưởng yêu cầu, không bắt mọi tập có joke, đảo vai hay parody. Chỉ passed khi câu chuyện rõ trong 2 giây đầu, setup/payoff có quan hệ nhân quả, hành động khả thi theo tuổi/vóc dáng và mọi người nói thuộc cast. Lượt có text rỗng là nhịp không lời có chủ đích (hồi tưởng, hành động), không phải thiếu thoại. Đọc từng câu như lời nói thật: đánh dấu needs_review và nêu đúng câu nếu nó là văn hành chính, ẩn dụ/chơi chữ gượng, giải thích điều khán giả vừa thấy, hoặc có thể đổi người nói mà không đổi tính cách. Với tập parody, đánh dấu needs_review nếu action không cho thấy nhân vật dùng đạo cụ nhận diện của chính format đó hoặc một hoạt động trẻ con không liên quan thay chỗ nghi thức format. Với tập cảm động mà ý tưởng nêu rõ, cho phép lời kết chân thành nếu hành động, đạo cụ hoặc ký ức nhìn thấy được đã gieo nguyên nhân cảm xúc trước đó (nguyên nhân phải nằm trong action của một lượt trước câu kết, không chỉ trong chính câu kết); chỉ từ chối khi câu xúc động là triết lý/bài học chung chung hoặc không được cảnh trước nâng đỡ. Payoff không được dựa vào việc nhân vật đột ngột quên hoặc làm trái điều vừa hiểu. Không bắt buộc cú lật, hòa giải hay reaction cuối; đánh dấu reaction thừa nếu bỏ nó thì kết hay hơn. Đặc biệt đánh dấu needs_review nếu trẻ nhỏ phải cõng/nâng trẻ lớn hơn, hành động nguy hiểm, trang phục/đạo cụ tự đổi giữa các cảnh mà không có hành động gây ra, lặp mô-típ gần đây, hoặc nhiều câu liên tiếp không làm tình thế thay đổi. Không sửa kịch bản.\nHỒ SƠ: ${JSON.stringify(effectiveProfile)}\nKỊCH BẢN: ${JSON.stringify(storyForCheck)}\nCẢNH: ${JSON.stringify(plan.video_plan_scenes.map((s) => ({ speaker: s.speaker_character_id, speakerName: nameById.get(s.speaker_character_id || "") || null, storyboard: s.storyboard, dialogue: s.dialogue, action: s.action, cast: s.cast_snapshot.map((c) => ({ id: c.characterId, name: c.name })) })))}`,
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
    evidence: {
      ...check.evidence,
      performanceCheck: checks,
      profileSource: profile ? "project" : "cast_fallback",
    },
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

/** Cảnh liền trước đã duyệt, dùng để bắt lỗi liên tục giữa hai clip sinh độc lập. */
export type PreviousSceneEvidence = {
  contactSheetUrl: string;
  action: string;
  setting: string;
};

export async function checkVisualTask(
  task: FilmTask,
  mediaUrl: string,
  referenceUrls: string[],
  previous?: PreviousSceneEvidence,
): Promise<Check> {
  try {
    const parts: Array<Record<string, unknown>> = [
      {
        text: `Kiểm tra media của một shot phim theo đúng phong cách ảnh chuẩn. Media đầu tiên là kết quả; các ảnh sau là ảnh chuẩn từng nhân vật. Với kind image, kiểm tra đúng mục đích và role của reference image trong TASK: scene khóa bố cục/trạng thái, character khóa nhận diện, prop có thể chỉ là cận đạo cụ, environment khóa bối cảnh. Không buộc mọi ref chứa toàn bộ cast và không đòi ảnh tĩnh thể hiện chuyển động ngoài moment đã yêu cầu. Những ảnh đã đạt sẽ được gửi cùng nhau qua reference_images, không phải first/last frame. Với kind video và audioMode dubbed, đây là chuyển động im tiếng trước lồng tiếng: chỉ kiểm tra hình và đúng người diễn từng lượt, không đòi audio; riêng khi ambientAudio=true (cảnh không lời), audio chỉ được là âm thanh môi trường, có lời nói, tiếng người hoặc nhạc thì needs_review. Với kind dub, FFmpeg giữ nguyên bitstream hình của video nguồn đã kiểm tra và chỉ ghép các audio TTS đã khóa theo schedule; tập trung nghe đúng giọng, đúng thứ tự, đủ nguyên văn, đúng khoảng thời gian và không chồng tiếng. Đây là bản lồng tiếng/voice-over, không resynthesize khuôn mặt. Với media hình, chỉ passed khi đúng số người cần có, đúng nhận diện, trang phục, đạo cụ và hình không lỗi. Chữ/số thật trên đạo cụ được phép và phải đọc đúng khi visualRequirements yêu cầu; chỉ cấm phụ đề, nhãn giao diện và chữ trang trí tự sinh. Trả requirementResults cho TỪNG visualRequirement với id nguyên vẹn, status, observation mô tả điều thực sự nhìn thấy và region chỉ vùng ảnh. countable/readable chỉ passed khi đếm/đọc được ở ảnh thật; không suy từ prompt. Nếu thiếu bằng chứng thì uncertain và toàn media needs_review. Với video có storyboard, kiểm tra từng lượt theo thứ tự; người khác phản ứng không lời. Mốc beat là dự kiến, không dùng làm bằng chứng audio thực. Không suy đoán và không dùng kịch bản dự kiến thay cho bằng chứng nghe/nhìn.\nTASK: ${JSON.stringify({ audioMode: task.input.audioMode, ambientAudio: task.input.audioMode !== "native" && (task.input.providerInputs as { generate_audio?: boolean } | undefined)?.generate_audio === true, kind: task.kind, cast: task.input.cast, dialogue: task.input.dialogue, speakerCharacterId: task.input.speakerCharacterId, setting: task.input.setting, schedule: task.input.schedule, storyboard: task.input.storyboard, referenceImageId: task.input.referenceImageId, referenceRole: task.input.referenceRole, referencePurpose: task.input.referencePurpose, referenceBindings: task.input.referenceBindings, visualStoryMechanism: task.input.visualStoryMechanism, visualRequirements: task.input.visualRequirements })}`,
      },
      await inline(mediaUrl),
    ];
    for (const url of referenceUrls.slice(0, 4)) parts.push(await inline(url));
    // Mỗi clip được sinh riêng nên dễ gãy liên tục: đang cõng thành đứng dưới
    // đất, chân trần thành đi giày. So với cảnh liền trước đã được duyệt.
    if (previous) {
      parts.push({
        text: `LIÊN TỤC VỚI CẢNH LIỀN TRƯỚC: ảnh tiếp theo là 3 khung (đầu/giữa/cuối) của cảnh trước, hành động "${previous.action}", bối cảnh "${previous.setting}". So với khung cuối của nó, media kết quả phải giữ tư thế đang duy trì (đang cõng/bế/ngồi), trang phục, giày dép, đạo cụ trên tay và thời điểm ánh sáng, trừ khi TASK mô tả rõ hành động làm đổi hoặc đây là hồi tưởng/chuyển cảnh có chủ đích. Lệch vô lý thì needs_review và nêu đúng điểm lệch trong issues.`,
      });
      parts.push(await inline(previous.contactSheetUrl));
    }
    const check = await judge(parts);
    const requirements = Array.isArray(task.input.visualRequirements)
      ? (task.input.visualRequirements as Array<{ id?: string; importance?: string }>)
      : [];
    if (!requirements.length) return check;
    const results = Array.isArray(check.evidence.requirementResults)
      ? (check.evidence.requirementResults as Array<{ id?: string; status?: string }>)
      : [];
    const missingCritical = requirements
      .filter((requirement) => requirement.importance === "critical")
      .filter(
        (requirement) =>
          !results.some(
            (result) =>
              result.id === requirement.id && result.status === "passed",
          ),
      );
    return missingCritical.length
      ? {
          ...check,
          status: check.status === "failed" ? "failed" : "needs_review",
          issues: [
            ...check.issues,
            ...missingCritical.map(
              (requirement) =>
                `Chưa chứng minh được yêu cầu hình ảnh ${requirement.id}.`,
            ),
          ].slice(0, 8),
        }
      : check;
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
  if (task.kind === "tts") {
    if (
      task.input.pacePolicyVersion &&
      r.paceWithinTarget === false
    )
      return {
        status: "needs_review",
        issues: [
          "Thoại vẫn chậm hơn nhịp short-form sau mức chuẩn hóa an toàn; cần nghe lại trước khi mua video.",
        ],
        evidence: {
          duration: r.duration,
          originalDuration: r.originalDuration,
          paceTargetSeconds: r.paceTargetSeconds,
          paceTempoApplied: r.paceTempoApplied,
        },
      };
    return Number(r.duration) > 0 && r.audio === true
      ? {
          status: "passed",
          issues: [],
          evidence: {
            duration: r.duration,
            audio: true,
            paceTargetSeconds: r.paceTargetSeconds,
            paceTempoApplied: r.paceTempoApplied,
            paceStatus: r.paceStatus,
          },
        }
      : { status: "failed", issues: ["TTS thiếu audio hợp lệ."], evidence: r };
  }
  if (task.kind === "transcribe" && r.asrIssue)
    return {
      status: "needs_review",
      issues: [
        "Máy nhận dạng giọng không đọc được lời (thường do đoạn im lặng dài ở đầu cảnh); phụ đề dùng lời lồng tiếng đã khoá, cần nghe lại cảnh này.",
      ],
      evidence: { asrIssue: r.asrIssue, transcriptSource: r.transcriptSource },
    };
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
