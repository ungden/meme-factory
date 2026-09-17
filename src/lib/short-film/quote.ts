import "server-only";
import {
  estimateImageGenerationPrice,
  estimateGeminiTtsPrice,
} from "@/lib/ai-pricing";
import { isProjectMediaPath } from "@/lib/project-media-path";
import type { Story } from "../family-catalogue";
import {
  FILM_MODELS,
  assertFixedVoiceShot,
  currentSceneTask,
  sceneReferenceImageTasks,
  referencePackReady,
  speechLines,
  speechDirection,
  speechTasks,
  dubbingSchedule,
  measuredDubbedScene,
  finalClipKind,
  filmVideoInputs,
  isAcceptedTask as accepted,
  isGeminiTtsModel,
  type FilmPlan,
  type FilmScene,
  type FilmTask,
  type FilmKind,
  type QuotedTask,
} from "./contracts";
import { fixedVoiceEnabled } from "./features";
import {
  seedanceMaxDuration,
  seedanceReferenceLimit,
} from "../video-models";
import { performanceCheck } from "../performance-direction";
import { assertMediaCoherent, coherenceMessage } from "./media-coherence";
import { FILM_MOTION_PROMPT_VERSION } from "../film-motion-policy";
import {
  SHORT_FORM_SPEECH_POLICY_VERSION,
  spokenSeconds,
} from "../film-storyboard";
import {
  FilmError,
  channelProfileAt,
  checkVersion,
  latestChannelProfile,
  modelPrice,
  signed,
  storeQuote,
  task,
  tasksForPlan,
  type Access,
} from "./server";

/**
 * Chạy phần việc của từng cảnh song song, nhưng báo lỗi ĐẦU TIÊN THEO THỨ TỰ
 * CẢNH. Dùng Promise.all trần thì thông điệp người dùng nhận được phụ thuộc vào
 * cảnh nào reject trước về mặt thời gian — cùng một kịch bản hỏng có thể lúc
 * báo "Cảnh 2", lúc báo "Cảnh 5".
 *
 * Đánh đổi: mọi cảnh đều chạy kể cả khi một cảnh hỏng, nên có thể tốn vài lời
 * gọi tra giá thừa trên một lượt báo giá thất bại. Không tốn điểm của người
 * dùng: giá chỉ được tính, chưa hề trừ.
 */
export async function perScene<T>(
  scenes: FilmScene[],
  work: (scene: FilmScene) => Promise<T[]>,
): Promise<T[]> {
  const settled = await Promise.allSettled(scenes.map(work));
  for (const result of settled)
    if (result.status === "rejected") throw result.reason;
  return settled.flatMap(
    (result) => (result as PromiseFulfilledResult<T[]>).value,
  );
}

export async function quotePlan(
  a: Access,
  plan: FilmPlan,
  body: Record<string, unknown>,
) {
  checkVersion(a, body, plan);
  // Coherence gate: never pay to render scenes that mix two revisions (fresh
  // dialogue over the previous episode's prompts/cast). Fails before quotes.
  try {
    assertMediaCoherent(plan, await latestChannelProfile(a));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("PLAN_MEDIA_INCOHERENT")) throw e;
    throw new FilmError(coherenceMessage(message), 409);
  }
  // Route báo giá có maxDuration 180 giây; chừa lại phần cho phần còn lại của
  // request thay vì để chuỗi tra giá ăn hết rồi chết không thông báo.
  const priceDeadline = Date.now() + 120_000;
  const stage = String(body.stage || "prepare");
  if (stage === "frame")
    throw new FilmError(
      "Phim ngắn hiện dùng bộ ảnh tham chiếu; không còn lấy khung đầu/cuối để tạo video.",
      410,
    );
  if (plan.audio_mode === "native" && ["prepare", "video"].includes(stage))
    throw new FilmError(
      "Lưu phiên bản kịch bản sang lồng tiếng trước khi tạo mới.",
      409,
    );
  if (["prepare", "video"].includes(stage)) {
    const { count, error } = await a.admin
      .from("channel_profiles")
      .select("version", { head: true, count: "exact" })
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version);
    if (error) throw error;
    let automaticScriptPassed = false;
    if (body.productionRunId) {
      const { data: run } = await a.admin
        .from("short_film_production_runs")
        .select("id,snapshot")
        .eq("id", String(body.productionRunId))
        .eq("project_id", a.project.id)
        .eq("plan_id", plan.id)
        .eq("plan_version", plan.version)
        .maybeSingle();
      automaticScriptPassed = run?.snapshot?.scriptCheck === "passed";
    }
    if (count && !plan.script_review && !automaticScriptPassed)
      throw new FilmError(
        "Duyệt bản kịch bản hiện tại trước khi chuẩn bị media. Bản sửa cần duyệt lại.",
        409,
      );
  }
  const selected = Array.isArray(body.sceneIds)
    ? body.sceneIds
    : plan.video_plan_scenes.map((s) => s.id);
  const scenes = plan.video_plan_scenes.filter((s) => selected.includes(s.id));
  if (!scenes.length) throw new FilmError("Chọn cảnh cần tạo.");
  if (plan.audio_mode === "fixed" && ["prepare", "video"].includes(stage))
    scenes.forEach(assertFixedVoiceShot);
  const existing = await tasksForPlan(a, plan.id);
  let visualDirection = "";
  const profileVersion = (plan.story as Story | null)?.profileVersion;
  if (profileVersion) {
    const { profile } = await channelProfileAt(a, profileVersion);
    visualDirection = String(profile?.visualDirection?.prompt || "").trim();
  }
  // An automatic run may only continue from work created by that run. Human
  // approved media can be reused deliberately; an unreviewed result from an
  // older attempt must never be pulled into a new production implicitly.
  const productionRunId =
    typeof body.productionRunId === "string" ? body.productionRunId : null;
  const eligible = productionRunId
    ? existing.filter(
        (candidate) =>
          candidate.production_run_id === productionRunId ||
          Boolean(candidate.approved_at || candidate.auto_accepted_at),
      )
    : existing;
  const latest = (s: FilmScene, kind: FilmKind) =>
    currentSceneTask(eligible, s, kind, plan.audio_mode);
  const context: QuoteContext = {
    a, plan, body, scenes, eligible, latest, visualDirection, priceDeadline,
  };
  const tasks =
    stage === "prepare"
      ? await quotePreparation(context)
      : stage === "video"
        ? await quoteVideo(context)
        : stage === "finish" || stage === "transcript"
          ? await quoteFinishing({ ...context, stage })
          : stage === "render"
            ? await quoteRender(context)
            : (() => {
                throw new FilmError("Bước sản xuất không hợp lệ.");
              })();
  return storeQuote(a, tasks, plan, productionRunId || undefined);
}

/**
 * Mọi thứ một nhánh báo giá cần. Gom lại thành một chỗ để từng công đoạn là một
 * hàm có tên, thay vì bốn nhánh nối nhau trong một hàm 500 dòng.
 */
type QuoteContext = {
  a: Access;
  plan: FilmPlan;
  body: Record<string, unknown>;
  scenes: FilmScene[];
  eligible: FilmTask[];
  latest: (scene: FilmScene, kind: FilmKind) => FilmTask | undefined;
  visualDirection: string;
  priceDeadline: number;
};

/** Ảnh tham chiếu và lời thoại: bước đầu tiên có trả tiền của một cảnh. */
async function quotePreparation({
  plan, body, scenes, eligible, latest, visualDirection, priceDeadline,
}: QuoteContext): Promise<QuotedTask[]> {
  const tasks: QuotedTask[] = [];
  tasks.push(...(await perScene(scenes, async (s) => {
    // Mỗi cảnh gom việc của mình rồi mới trả về; không cảnh nào ghi chung vào
    // mảng tasks, nên chạy song song vẫn giữ nguyên thứ tự kết quả.
    const sceneTasks: QuotedTask[] = [];
    const performance = s.performance_direction || s.storyboard?.performanceDirection;
    if (performance) {
      const check = performanceCheck(performance);
      if (check.status !== "passed")
        throw new FilmError(
          `Hướng biểu cảm cảnh ${s.scene_index + 1} cần chỉnh trước khi tạo: ${check.issues.map((issue) => issue.reason).join(" ")}`,
          422,
        );
    }
    {
      const referencePlan = s.storyboard?.referencePlan;
      const references = referencePlan?.referenceImages || [
        {
          id: "legacy_start",
          role: "scene" as const,
          purpose: "Bố cục chính của cảnh",
          framing: s.camera || "Khung vừa",
          moment: "Trước hành động",
          prompt: s.image_prompt,
          requirementIds: [] as string[],
        },
      ];
      const currentReferences = new Map(
        sceneReferenceImageTasks(eligible, s).map((item) => [
          item.referenceId,
          item.task,
        ]),
      );
      for (const [referenceIndex, reference] of references.entries()) {
        if (
          accepted(currentReferences.get(reference.id)) &&
          body.regenerate !== true
        )
          continue;
        const requirements = (referencePlan?.requirements || []).filter(
          (requirement) => reference.requirementIds.includes(requirement.id),
        );
        const imported =
          referenceIndex === 0 &&
          s.source_mode === "manual" &&
          s.start_image_url;
        const prompt = [
          reference.prompt || s.image_prompt,
          `MỤC ĐÍCH KHUNG: ${reference.purpose}. CỠ CẢNH: ${reference.framing}. THỜI ĐIỂM: ${reference.moment}.`,
          requirements.length
            ? `BẰNG CHỨNG BẮT BUỘC TRÊN ẢNH: ${JSON.stringify(requirements)}. Chỉ đạt khi chính ảnh thể hiện được các bằng chứng này ở kích thước xem thực tế.`
            : "",
          referencePlan
            ? `LOGIC CÂU CHUYỆN: ${referencePlan.storyMechanism}. KHÁN GIẢ PHẢI THẤY: ${referencePlan.audienceMustSee.join("; ")}.`
            : "",
          `Bối cảnh ${s.setting}. Hành động ${s.action}. Máy quay ${s.camera}.`,
          visualDirection ||
            "Dựng đúng một khung ảnh điện ảnh theo phong cách của ảnh chuẩn, không lưới ảnh.",
          "Chỉ nhân vật cần thiết trong khung được xuất hiện; giữ nhận diện, tuổi, tỷ lệ cơ thể và trang phục. Không thêm người khác.",
          "Không phụ đề, nhãn giao diện, mũi tên hoặc watermark giả. Nếu bằng chứng yêu cầu chữ/số thật trên đạo cụ thì phải giữ đúng, rõ và đọc được.",
          reference.role === "scene"
            ? "Đây là ảnh bố cục/trạng thái của cảnh để model hiểu không gian và quan hệ nhân vật."
            : reference.role === "prop"
              ? "Đây là ảnh cận đạo cụ quyết định câu chuyện; ưu tiên số lượng, hình dáng và chữ/số phải đọc."
              : reference.role === "character"
                ? "Đây là ảnh khóa nhận diện nhân vật; giữ đúng mặt, tóc, vóc dáng và trang phục."
                : "Đây là ảnh khóa bối cảnh, ánh sáng và phong cách không gian.",
        ]
          .filter(Boolean)
          .join("\n");
        const input = {
          model: FILM_MODELS.image,
          ...(imported ? { importPath: imported } : {}),
          prompt,
          cast: s.cast_snapshot,
          dialogue: s.dialogue,
          speakerCharacterId: s.speaker_character_id,
          storyboard: s.storyboard || null,
          performanceDirection:
            s.performance_direction || s.storyboard?.performanceDirection || null,
          format: plan.format,
          referenceImageId: reference.id,
          referenceRole: reference.role,
          referencePurpose: reference.purpose,
          visualRequirements: requirements,
          visualStoryMechanism: referencePlan?.storyMechanism || "",
          displayName: `Ảnh ${referenceIndex + 2} · ${reference.purpose}`,
          subjectKey: `${s.id}:${s.version}:reference:${reference.id}:1`,
        };
        const p = input.importPath
          ? { customerPoints: 0 }
          : estimateImageGenerationPrice({
              model: FILM_MODELS.image,
              resolution: "1K",
              inputImageCount: s.cast_snapshot.length,
              prompt: input.prompt,
            });
        sceneTasks.push(task("image", input, p.customerPoints, s));
      }
    }
    if (s.dialogue && plan.audio_mode !== "native") {
      for (const line of speechLines(s)) {
        const c = s.cast_snapshot.find(
          (character) => character.characterId === line.speakerCharacterId,
        );
        if (!c?.voice)
          throw new FilmError(
            `Duyệt giọng của ${c?.name || "người nói"} trước.`,
          );
        const voiceContinuityKey = `${plan.id}:${c.voice.id}:${line.speakerCharacterId}`;
        const prior =
          plan.audio_mode === "fixed"
            ? latest(s, "tts")
            : speechTasks(eligible, s).find(
                (t) => t?.input.beatIndex === line.beatIndex,
              );
        if (accepted(prior) && body.regenerate !== true) {
          continue;
        }
        const voiceSettings = { ...(c.voice.settings || {}) };
        const direction = speechDirection(
          s,
          line.beatIndex,
          voiceSettings.direction,
        );
        delete voiceSettings.designedProfile;
        delete voiceSettings.provider;
        delete voiceSettings.voicePreset;
        delete voiceSettings.voiceName;
        delete voiceSettings.direction;
        const voiceModel = c.voice.model || FILM_MODELS.tts;
        const inputs = isGeminiTtsModel(voiceModel)
          ? {
              text: line.dialogue,
              voice: c.voice.voice_id,
              direction,
              language: "vi",
            }
          : {
              text: line.dialogue,
              voice_id: c.voice.voice_id,
              ...voiceSettings,
              format: "wav",
              sample_rate: 44100,
              channel: "1",
              language_boost: "Vietnamese",
            };
        const points = isGeminiTtsModel(voiceModel)
          ? estimateGeminiTtsPrice({
              model: voiceModel,
              text: line.dialogue,
              requestedSeconds: line.endSeconds - line.startSeconds,
            }).customerPoints
          : await modelPrice(voiceModel, inputs, priceDeadline);
        const quoted = task(
          "tts",
          {
            model: voiceModel,
            provider: isGeminiTtsModel(voiceModel)
              ? "google"
              : "wavespeed",
            providerInputs: inputs,
            voiceProfileVersion: c.voice.id,
            speakerCharacterId: line.speakerCharacterId,
            beatIndex: line.beatIndex,
            dialogue: line.dialogue,
            pacePolicyVersion: SHORT_FORM_SPEECH_POLICY_VERSION,
            paceTargetSeconds: spokenSeconds(line.dialogue),
            voiceContinuityKey,
            subjectKey:
              plan.audio_mode === "fixed"
                ? `${s.id}:${s.version}:tts`
                : `${s.id}:${s.version}:tts:${line.beatIndex}`,
          },
          points,
          s,
          [],
        );
        sceneTasks.push(quoted);
      }
    }
    return sceneTasks;
  })));
  return tasks;
}

/** Seedance dựng chuyển động từ bộ ảnh đã duyệt. */
async function quoteVideo({
  a, plan, body, scenes, eligible, latest, priceDeadline,
}: QuoteContext): Promise<QuotedTask[]> {
  const tasks: QuotedTask[] = [];
  if (plan.audio_mode === "fixed" && !fixedVoiceEnabled(a.project.id))
    throw new FilmError(
      "Giọng cố định đang kiểm chứng. Bạn vẫn có thể chuẩn bị ảnh và nghe thử giọng.",
      409,
    );
  tasks.push(...(await perScene(scenes, async (s) => {
    const image = latest(s, "image"),
      audio = latest(s, "tts");
    if (latest(s, "video") && body.regenerate !== true) return [];
    if (!image || !accepted(image) || !referencePackReady(eligible, s))
      throw new FilmError(
        `Duyệt đủ bộ ảnh đạo diễn của cảnh ${s.scene_index + 1} trước.`,
      );
    if (plan.audio_mode === "fixed" && s.dialogue && !accepted(audio))
      throw new FilmError(
        `Nghe và duyệt thoại cảnh ${s.scene_index + 1} trước.`,
      );
    const directed = plan.audio_mode === "dubbed"
      ? measuredDubbedScene(eligible, s, seedanceMaxDuration(plan.video_model))
      : { scene: s, measuredSpeechSeconds: undefined };
    const schedule =
      plan.audio_mode === "dubbed" ? dubbingSchedule(eligible, directed.scene) : [];
    if (
      plan.audio_mode === "dubbed" &&
      speechTasks(eligible, s).some((t) => !accepted(t))
    )
      throw new FilmError("Duyệt các lượt thoại trước khi tạo video.");
    // `referencePackReady` ở trên đã bảo đảm mọi ảnh đều có task được duyệt,
    // nhưng nó kiểm trên một biến khác. Lọc thật thay vì khẳng định non-null:
    // nếu điều kiện kia có đổi, ở đây hỏng rõ ràng thay vì nổ undefined lúc
    // đang dựng payload trả tiền.
    const referenceTasks = sceneReferenceImageTasks(eligible, s).flatMap(
      ({ referenceId, task: referenceTask }) =>
        referenceTask ? [{ referenceId, task: referenceTask }] : [],
    );
    if (referenceTasks.length !== sceneReferenceImageTasks(eligible, s).length)
      throw new FilmError(
        `Bộ ảnh đạo diễn của cảnh ${s.scene_index + 1} chưa đủ. Hãy tạo lại phần còn thiếu.`,
      );
    const references: Array<{
      url: string;
      binding: string;
      source: { taskId: string } | { path: string } | { url: string };
    }> = [];
    for (const { referenceId, task: referenceTask } of referenceTasks) {
      if (!referenceTask?.result?.path)
        throw new FilmError("Bộ ảnh đạo diễn chưa lưu đủ file.");
      const authored = s.storyboard?.referencePlan?.referenceImages.find(
        (reference) => reference.id === referenceId,
      );
      references.push({
        url: await signed(a, String(referenceTask.result.path)),
        binding: `${authored?.role || "scene"}: ${authored?.purpose || "bố cục cảnh"}`,
        source: { taskId: referenceTask.id },
      });
    }
    for (const character of s.cast_snapshot) {
      for (const source of character.referenceImages.length
        ? character.referenceImages
        : [character.imageUrl]) {
        if (!source || references.some((reference) => reference.url === source)) continue;
        references.push({
          url: isProjectMediaPath(a.project.id, source)
            ? await signed(a, source)
            : source,
          binding: `character: ảnh nhận diện đã duyệt của ${character.name}; chỉ khóa mặt, tóc, vóc dáng và trang phục`,
          source: isProjectMediaPath(a.project.id, source)
            ? { path: source }
            : { url: source },
        });
      }
    }
    const referenceLimit = seedanceReferenceLimit(plan.video_model);
    if (references.length > referenceLimit)
      throw new FilmError(
        `Cảnh ${s.scene_index + 1} có ${references.length} ảnh tham chiếu, vượt giới hạn ${referenceLimit} của model. Chia cảnh hoặc bỏ ảnh hỗ trợ không thiết yếu trước khi mua video.`,
        422,
      );
    const packet = {
      urls: references.map((reference) => reference.url),
      bindings: references.map(
        (reference, index) => `@image${index + 1} = ${reference.binding}.`,
      ),
    };
    const inputs = filmVideoInputs(
      directed.scene,
      plan.audio_mode,
      plan.format,
      plan.resolution,
      packet,
      plan.audio_mode === "fixed" ? Number(audio?.result?.duration || 0) : 0,
      plan.video_model,
      directed.measuredSpeechSeconds,
    );
    const { reference_images: _signedReferenceUrls, ...storedInputs } = inputs;
    void _signedReferenceUrls;
    const v = task(
      "video",
      {
        model: plan.video_model,
        promptVersion: FILM_MOTION_PROMPT_VERSION,
        providerInputs: storedInputs,
        referenceTaskIds: referenceTasks.map(({ task: referenceTask }) => referenceTask.id),
        referenceSources: references.map((reference) => reference.source),
        referenceBindings: packet.bindings,
        visualRequirements: s.storyboard?.referencePlan?.requirements || [],
        visualStoryMechanism:
          s.storyboard?.referencePlan?.storyMechanism || "",
        audioTaskId: audio?.id,
        audioTaskIds: schedule.map((cue) => cue.audioTaskId),
        dubbingSchedule: schedule,
        audioMode: plan.audio_mode,
        cast: s.cast_snapshot,
        dialogue: s.dialogue,
        speakerCharacterId: s.speaker_character_id,
        storyboard: directed.scene.storyboard || null,
        performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
        format: plan.format,
        resolution: plan.resolution,
      },
      await modelPrice(plan.video_model, inputs, priceDeadline),
      s,
    );
    return [v];
  })));
  return tasks;
}

/** Lồng tiếng, đồng bộ môi và soát lời trên clip đã có. */
async function quoteFinishing({
  a, plan, scenes, latest, priceDeadline, stage,
}: QuoteContext & { stage: string }): Promise<QuotedTask[]> {
  const tasks: QuotedTask[] = [];
  tasks.push(...(await perScene(scenes, async (s) => {
    const kind =
      stage === "finish" && plan.audio_mode !== "native" && s.dialogue
        ? finalClipKind(s, plan.audio_mode)
        : "transcribe";
    if (!s.dialogue || latest(s, kind)) return [];
    const video = latest(
      s,
      kind === "transcribe" && plan.audio_mode !== "native"
        ? finalClipKind(s, plan.audio_mode)
        : "video",
    );
    const audio = latest(s, "tts");
    if (!video?.result?.path)
      throw new FilmError(`Cảnh ${s.scene_index + 1} chưa có clip nguồn.`);
    const inputVideo = await signed(a, String(video.result.path));
    if (kind === "dub") {
      const schedule = video.input.dubbingSchedule;
      if (!Array.isArray(schedule) || !schedule.length)
        throw new FilmError(
          "Clip chưa có lịch lồng tiếng. Tạo bản chuyển động theo bản thoại đã duyệt.",
        );
      return [
        task(
          "dub",
          {
            model: "ffmpeg-dub-v1",
            videoTaskId: video.id,
            schedule,
            duration: video.result.duration,
            cast: s.cast_snapshot,
            dialogue: s.dialogue,
            storyboard: video.input.storyboard || s.storyboard || null,
            performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
            speakerCharacterId: s.speaker_character_id,
          },
          0,
          s,
          [video.id, ...schedule.map((cue) => String(cue.audioTaskId))],
        ),
      ];
    } else if (kind === "lip_sync") {
      if (!audio?.result?.path) throw new FilmError("Thiếu audio đã duyệt.");
      const inputs = {
        video: inputVideo,
        audio: await signed(a, String(audio.result.path)),
        sync_mode: "silence",
      };
      return [
        task(
          kind,
          {
            model: FILM_MODELS.lip_sync,
            providerInputs: inputs,
            videoTaskId: video.id,
            audioTaskId: audio.id,
            duration: video.result.duration,
            dialogue: s.dialogue,
            speakerCharacterId: s.speaker_character_id,
            storyboard: s.storyboard || null,
            performanceDirection: s.performance_direction || s.storyboard?.performanceDirection || null,
            cast: s.cast_snapshot,
          },
          await modelPrice(FILM_MODELS.lip_sync, inputs, priceDeadline),
          s,
        ),
      ];
    } else {
      const inputs = {
        video: inputVideo,
        language: "vi",
        task: "transcribe",
        enable_timestamps: true,
        prompt: s.dialogue,
      };
      return [
        task(
          kind,
          {
            model: FILM_MODELS.transcribe,
            providerInputs: inputs,
            videoTaskId: video.id,
            dialogue: s.dialogue,
            audioMode: plan.audio_mode,
            dubbingSchedule:
              plan.audio_mode === "dubbed" ? video.input.schedule : null,
            speakerCharacterId: s.speaker_character_id,
            storyboard: s.storyboard || null,
            duration: video.result.duration,
          },
          await modelPrice(FILM_MODELS.transcribe, inputs, priceDeadline),
          s,
        ),
      ];
    }
  })));
  return tasks;
}

/** Ghép bản phim cuối từ các clip đã duyệt. */
async function quoteRender({
  a, plan, latest,
}: QuoteContext): Promise<QuotedTask[]> {
  const tasks: QuotedTask[] = [];
  const clips = plan.video_plan_scenes.map((s) => {
    const clip = latest(s, finalClipKind(s, plan.audio_mode));
    const transcript = latest(s, "transcribe");
    if (!clip || !accepted(clip))
      throw new FilmError(
        `Duyệt clip cảnh ${s.scene_index + 1} trước khi ghép.`,
      );
    if (s.dialogue && !transcript)
      throw new FilmError(`Cảnh ${s.scene_index + 1} chưa chép lời xong.`);
    return {
      taskId: clip.id,
      transcriptTaskId: transcript?.id,
      sceneId: s.id,
      version: s.version,
      trimSpeech: !!plan.trim_speech && !!s.dialogue,
      minimumOutSeconds: (clip.input.storyboard as FilmScene["storyboard"])?.contentEndSeconds || s.storyboard?.contentEndSeconds || 0,
      // Storyboard xếp nội dung từ giây 0 và có thể mở bằng nhịp không lời.
      keepStart: Boolean(clip.input.storyboard || s.storyboard),
    };
  });
  tasks.push(
    task(
      "render",
      {
        clips,
        format: plan.format,
        resolution: plan.resolution,
        subtitles: plan.subtitles,
        caption: plan.caption,
        brief: plan.brief,
        brand: { ...a.project },
        subjectKey: `${plan.id}:${plan.version}:render`,
      },
      0,
    ),
  );
  return tasks;
}
