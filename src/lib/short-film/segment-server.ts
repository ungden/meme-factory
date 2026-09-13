import "server-only";
import crypto from "node:crypto";
import type { StoryboardBeat } from "../film-storyboard";
import {
  estimateImageGenerationPrice,
  estimateGeminiTtsPrice,
} from "../ai-pricing";
import {
  FILM_MODELS,
  finalClipKind,
  currentSceneTask,
  filmVideoInputs,
  isGeminiTtsModel,
  type FilmPlan,
  type FilmScene,
  type FilmTask,
} from "./contracts";
import type {
  FilmSegmentPatch,
  FilmSegmentRevision,
} from "./segment-contracts";
import { historicalSceneSource } from "./segment-contracts";
import { isProjectMediaPath } from "../project-media-path";
import { seedanceReferenceLimit } from "../video-models";
import {
  FilmError,
  type Access,
  hash,
  modelPrice,
  publicTasks,
  signed,
  storeQuote,
  task,
  tasksForPlan,
} from "./server";

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

/** Stable for legacy boards; changing text never changes editing identity. */
export function legacySegmentId(sceneId: string, sequenceIndex: number) {
  const bytes = Buffer.from(
    crypto.createHash("sha256").update(`${sceneId}:segment:${sequenceIndex}`).digest("hex").slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function identity(scene: FilmScene, beat: StoryboardBeat, index: number) {
  return beat.segmentId && UUID.test(beat.segmentId)
    ? beat.segmentId
    : legacySegmentId(scene.id, index);
}

function sourceForScene(tasks: FilmTask[], scene: FilmScene, plan: FilmPlan) {
  const finished = currentSceneTask(
    tasks,
    scene,
    finalClipKind(scene, plan.audio_mode),
    plan.audio_mode,
  );
  if (finished) return finished;
  // Historical productions sometimes mixed their locked voices only in the
  // final render and therefore have no standalone `dub` task. Their completed
  // motion clip is still the exact footage the editor must be able to inspect
  // and trim. Paid regeneration continues to require an approved source below.
  const currentMotion = currentSceneTask(tasks, scene, "video", plan.audio_mode);
  if (currentMotion) return currentMotion;

  // Saving a revised script increments the scene version even when the user
  // deliberately keeps the already-generated footage. The segment editor must
  // therefore expose the newest completed source for this stable scene id. It
  // remains visibly historical and is never treated as approval for a paid
  // regeneration.
  return historicalSceneSource(tasks, scene.id, scene.version);
}

function activeVoice(scene: FilmScene, beat: StoryboardBeat) {
  return scene.cast_snapshot.find((character) => character.characterId === beat.speakerCharacterId)?.voice;
}

export async function readFilmSegments(a: Access, plan: FilmPlan) {
  const tasks = await tasksForPlan(a, plan.id);
  const { data: rows, error } = await a.admin
    .from("short_film_segments")
    .select("*")
    .eq("project_id", a.project.id)
    .eq("plan_id", plan.id)
    .eq("workspace_version", a.project.workspace_version);
  if (error) throw error;
  const ids = (rows || []).map((row) => row.id);
  const { data: revisions, error: revisionError } = ids.length
    ? await a.admin
        .from("short_film_segment_revisions")
        .select("*")
        .in("segment_id", ids)
    : { data: [], error: null };
  if (revisionError) throw revisionError;
  const stored = new Map((rows || []).map((row) => [row.id, row]));
  const revisionByKey = new Map(
    (revisions || []).map((revision) => [
      `${revision.segment_id}:${revision.revision}`,
      revision,
    ]),
  );
  const taskPublic = await publicTasks(
    a,
    tasks.filter((candidate) => candidate.segment_id),
  );

  const result: FilmSegmentRevision[] = [];
  for (const scene of plan.video_plan_scenes) {
    const beats = scene.storyboard?.beats || [
      {
        startSeconds: 0,
        endSeconds: scene.duration_seconds,
        speakerCharacterId: scene.speaker_character_id,
        dialogue: scene.dialogue,
        action: scene.action,
        camera: scene.camera,
        motion: scene.motion_prompt,
      },
    ];
    const source = sourceForScene(tasks, scene, plan);
    for (const [sequenceIndex, beat] of beats.entries()) {
      const segmentId = identity(scene, beat, sequenceIndex);
      const row = stored.get(segmentId);
      const revision = row
        ? revisionByKey.get(`${segmentId}:${row.active_revision}`)
        : null;
      const effectiveDialogue = revision?.dialogue ?? beat.dialogue;
      const selectedTask = row?.selected_task_id || null;
      const attempts = taskPublic
        .filter(
          (candidate) =>
            candidate.segment_id === segmentId &&
            (effectiveDialogue
              ? ["dub", "lip_sync"].includes(candidate.kind)
              : candidate.kind === "video"),
        )
        .map((candidate) => ({
          taskId: candidate.id,
          segmentRevision: candidate.segment_revision ?? null,
          status: candidate.status,
          points: Number(candidate.points || 0),
          duration: Number(candidate.result?.duration) || null,
          usedDuration: Number(candidate.input.usedDuration) || null,
          url: candidate.url,
          createdAt: candidate.created_at,
          selected: candidate.id === selectedTask,
        }));
      const speaker = scene.cast_snapshot.find(
        (character) => character.characterId === (revision?.speaker_character_id ?? beat.speakerCharacterId),
      );
      result.push({
        id: revision?.id || null,
        segmentId,
        sceneId: scene.id,
        sceneIndex: scene.scene_index,
        sequenceIndex,
        revision: row?.active_revision || 0,
        planVersion: plan.version,
        sceneVersion: scene.version,
        speakerCharacterId: revision?.speaker_character_id ?? beat.speakerCharacterId,
        speakerName: speaker?.name || null,
        voiceProfileVersion:
          revision?.voice_profile_version || activeVoice(scene, beat)?.id || null,
        dialogue: effectiveDialogue,
        action: revision?.action ?? beat.action,
        camera: revision?.camera ?? beat.camera,
        motionPrompt: revision?.motion_prompt ?? beat.motion,
        imagePrompt: revision?.image_prompt ?? scene.image_prompt,
        openingState: revision?.opening_state || beat.openingState || {},
        closingState: revision?.closing_state || beat.closingState || {},
        props: revision?.props || beat.props || [],
        sourceTaskId: revision?.source_task_id || source?.id || null,
        originalSourceTaskId: source?.id || null,
        originalInSeconds: Number(beat.startSeconds),
        originalOutSeconds: Number(beat.endSeconds),
        inSeconds: Number(revision?.source_in_seconds ?? beat.startSeconds),
        outSeconds: Number(revision?.source_out_seconds ?? beat.endSeconds),
        timingSource: revision?.timing_source || "planned",
        timingEvidence: revision?.timing_evidence || {},
        selectedTaskId: selectedTask,
        selectedInSeconds:
          row?.selected_in_seconds == null ? null : Number(row.selected_in_seconds),
        selectedOutSeconds:
          row?.selected_out_seconds == null ? null : Number(row.selected_out_seconds),
        selectedAt: row?.selected_at || null,
        attempts,
      });
    }
  }
  return result;
}

export async function saveFilmSegment(
  a: Access,
  plan: FilmPlan,
  segmentId: string,
  body: Record<string, unknown>,
) {
  const current = (await readFilmSegments(a, plan)).find(
    (segment) => segment.segmentId === segmentId,
  );
  if (!current) throw new FilmError("Không tìm thấy đoạn trong phim.", 404);
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
    throw new FilmError("Phiên bản đoạn không hợp lệ.");
  const patch = body.revision as FilmSegmentPatch;
  if (!patch || typeof patch !== "object") throw new FilmError("Nội dung đoạn không hợp lệ.");
  const scene = plan.video_plan_scenes.find((item) => item.id === current.sceneId)!;
  const speaker = patch.speakerCharacterId
    ? scene.cast_snapshot.find(
        (character) => character.characterId === patch.speakerCharacterId,
      )
    : null;
  if (patch.dialogue?.trim() && !speaker)
    throw new FilmError("Người nói không thuộc cast của cảnh.");
  if (
    speaker?.voice?.id &&
    patch.voiceProfileVersion !== speaker.voice.id
  )
    throw new FilmError("Giọng của nhân vật đã được khóa theo phiên bản kịch bản.", 409);
  if (
    !Number.isFinite(patch.inSeconds) ||
    !Number.isFinite(patch.outSeconds) ||
    patch.inSeconds < 0 ||
    patch.outSeconds <= patch.inSeconds
  )
    throw new FilmError("Điểm vào/ra của đoạn không hợp lệ.");
  if (patch.sourceTaskId) {
    const tasks = await tasksForPlan(a, plan.id);
    const source = tasks.find((candidate) => candidate.id === patch.sourceTaskId);
    if (
      !source ||
      source.status !== "completed" ||
      !["video", "dub", "lip_sync"].includes(source.kind) ||
      Number(source.result?.duration || 0) + 0.05 < patch.outSeconds
    )
      throw new FilmError("Clip nguồn hoặc khoảng cắt không còn hợp lệ.", 409);
  }
  const payload = {
    ...patch,
    inputHash: hash(patch),
  };
  const { error } = await a.admin.rpc("save_film_segment_revision", {
    p_project: a.project.id,
    p_actor: a.user.id,
    p_workspace: a.project.workspace_version,
    p_plan: plan.id,
    p_plan_version: plan.version,
    p_scene: current.sceneId,
    p_segment: current.segmentId,
    p_sequence: current.sequenceIndex,
    p_expected_revision: expectedRevision || null,
    p_revision: payload,
  });
  if (error)
    throw new FilmError(
      error.message,
      error.message.includes("CONFLICT") ? 409 : 400,
    );
  return (await readFilmSegments(a, plan)).find(
    (segment) => segment.segmentId === segmentId,
  );
}

export async function selectFilmSegmentSource(
  a: Access,
  plan: FilmPlan,
  segmentId: string,
  body: Record<string, unknown>,
) {
  const current = (await readFilmSegments(a, plan)).find(
    (segment) => segment.segmentId === segmentId,
  );
  if (!current || current.revision < 1)
    throw new FilmError("Lưu chỉnh sửa đoạn trước khi chọn bản dùng.", 409);
  const tasks = await tasksForPlan(a, plan.id);
  const selectedTask = tasks.find((candidate) => candidate.id === body.taskId);
  const expectedKinds = current.dialogue ? ["dub", "lip_sync"] : ["video"];
  const originalTask = body.taskId === current.originalSourceTaskId;
  if (
    !selectedTask ||
    (!originalTask && !expectedKinds.includes(selectedTask.kind))
  )
    throw new FilmError(
      current.dialogue
        ? "Đoạn có thoại chỉ được dùng bản đã lồng đúng giọng."
        : "Đoạn không thoại cần dùng clip chuyển động hoàn tất.",
      409,
    );
  const { error } = await a.admin.rpc("select_film_segment_source", {
    p_project: a.project.id,
    p_actor: a.user.id,
    p_workspace: a.project.workspace_version,
    p_segment: segmentId,
    p_expected_revision: Number(body.expectedRevision),
    p_task: String(body.taskId || ""),
    p_in: Number(body.inSeconds),
    p_out: Number(body.outSeconds),
  });
  if (error)
    throw new FilmError(
      error.message,
      error.message.includes("CONFLICT") ? 409 : 400,
    );
  return (await readFilmSegments(a, plan)).find(
    (segment) => segment.segmentId === segmentId,
  );
}

function matchingAudio(tasks: FilmTask[], segment: FilmSegmentRevision) {
  return tasks.find(
    (candidate) =>
      candidate.kind === "tts" &&
      candidate.status === "completed" &&
      candidate.approved_at &&
      candidate.input.speakerCharacterId === segment.speakerCharacterId &&
      candidate.input.voiceProfileVersion === segment.voiceProfileVersion &&
      (candidate.input.providerInputs as Record<string, unknown>)?.text === segment.dialogue,
  );
}

export async function quoteFilmSegment(
  a: Access,
  plan: FilmPlan,
  segmentId: string,
  body: Record<string, unknown>,
) {
  if (Number(body.expectedVersion) !== plan.version)
    throw new FilmError("Kịch bản đã đổi. Hãy tải lại trước khi báo giá.", 409);
  const segment = (await readFilmSegments(a, plan)).find(
    (item) => item.segmentId === segmentId,
  );
  if (!segment || segment.revision < 1)
    throw new FilmError("Lưu chỉnh sửa đoạn trước khi báo giá.", 409);
  const scene = plan.video_plan_scenes.find((item) => item.id === segment.sceneId)!;
  const tasks = await tasksForPlan(a, plan.id);
  const audio = segment.dialogue ? matchingAudio(tasks, segment) : undefined;
  const startFrameMode = body.startFrameMode === "generated" ? "generated" : "footage";
  const approvedSegmentImage =
    startFrameMode === "generated"
      ? tasks.find(
          (candidate) =>
            candidate.kind === "image" &&
            candidate.segment_id === segmentId &&
            candidate.segment_revision === segment.revision &&
            candidate.status === "completed" &&
            (candidate.approved_at || candidate.auto_accepted_at),
        )
      : undefined;
  if (
    segment.dialogue &&
    !audio &&
    !(startFrameMode === "generated" && !approvedSegmentImage)
  ) {
    const cast = scene.cast_snapshot.find(
      (character) => character.characterId === segment.speakerCharacterId,
    );
    if (!cast?.voice) throw new FilmError("Người nói chưa có giọng được duyệt.");
    const model = cast.voice.model || FILM_MODELS.tts;
    const settings = { ...(cast.voice.settings || {}) } as Record<string, unknown>;
    const direction = String(settings.direction || "Nói tiếng Việt tự nhiên.");
    const inputs = isGeminiTtsModel(model)
      ? { text: segment.dialogue, voice: cast.voice.voice_id, direction, language: "vi" }
      : {
          text: segment.dialogue,
          voice_id: cast.voice.voice_id,
          format: "wav",
          sample_rate: 44100,
          channel: "1",
          language_boost: "Vietnamese",
        };
    const points = isGeminiTtsModel(model)
      ? estimateGeminiTtsPrice({
          model,
          text: segment.dialogue,
          requestedSeconds: segment.outSeconds - segment.inSeconds,
        }).customerPoints
      : await modelPrice(model, inputs);
    return storeQuote(
      a,
      [
        task("tts", {
          model,
          provider: isGeminiTtsModel(model) ? "google" : "wavespeed",
          providerInputs: inputs,
          voiceProfileVersion: cast.voice.id,
          speakerCharacterId: segment.speakerCharacterId,
          beatIndex: 0,
          dialogue: segment.dialogue,
          sourceSceneId: scene.id,
          sourceSceneVersion: scene.version,
          segmentId,
          segmentRevision: segment.revision,
          subjectKey: `${segmentId}:${segment.revision}:tts`,
        }, points),
      ],
      plan,
    );
  }
  if (startFrameMode === "generated" && !approvedSegmentImage) {
    const prompt = [
      segment.imagePrompt,
      `Bối cảnh: ${scene.setting}. Trạng thái mở: ${segment.openingState.note || "trước hành động của đoạn"}.`,
      segment.props.length
        ? `Đạo cụ phải đúng ledger: ${segment.props
            .map(
              (prop) =>
                `${prop.id}=${prop.label}, ${prop.color}, ${prop.size}, số lượng ${prop.count}, ${prop.position}`,
            )
            .join("; ")}.`
        : "",
      "Khung đầu phải là trạng thái trước hành động, đúng cast và trang phục đã khóa; không chữ, không lưới ảnh, không thêm người.",
    ]
      .filter(Boolean)
      .join("\n");
    const input = {
      model: FILM_MODELS.image,
      prompt,
      cast: scene.cast_snapshot,
      format: plan.format,
      segmentId,
      segmentRevision: segment.revision,
      sourceSceneId: scene.id,
      sourceSceneVersion: scene.version,
      subjectKey: `${segmentId}:${segment.revision}:image`,
    };
    const price = estimateImageGenerationPrice({
      model: FILM_MODELS.image,
      resolution: "1K",
      inputImageCount: scene.cast_snapshot.length,
      prompt,
    });
    return storeQuote(
      a,
      [task("image", input, price.customerPoints)],
      plan,
    );
  }

  const sourceTask = segment.selectedTaskId || segment.sourceTaskId;
  if (!sourceTask) throw new FilmError("Đoạn chưa có clip nguồn để lấy khung mở.");
  const sourceClip = tasks.find((candidate) => candidate.id === sourceTask);
  if (
    !sourceClip ||
    sourceClip.status !== "completed" ||
    (!sourceClip.approved_at && !sourceClip.auto_accepted_at) ||
    !sourceClip.result?.path
  )
    throw new FilmError("Clip nguồn của đoạn chưa sẵn sàng hoặc chưa được duyệt.");
  const frame = approvedSegmentImage
    ? null
    : task(
      "frame",
      {
        videoTaskId: sourceTask,
        atSeconds: segment.selectedInSeconds ?? segment.inSeconds,
        cast: scene.cast_snapshot,
        format: plan.format,
        segmentId,
        segmentRevision: segment.revision,
        subjectKey: `${segmentId}:${segment.revision}:frame`,
      },
      0,
    );
  const speechDuration = Number(audio?.result?.duration || 0);
  const usefulDuration = Math.max(
    segment.outSeconds - segment.inSeconds,
    speechDuration ? speechDuration + 0.35 : 0,
  );
  if (usefulDuration > 30)
    throw new FilmError(
      "Đoạn dài hơn giới hạn 30 giây của model. Hãy tách thành hai đoạn trước khi tạo.",
      409,
    );
  const providerDuration = Math.max(4, Math.min(30, Math.ceil(usefulDuration)));
  const board = {
    version: 2 as const,
    durationSeconds: providerDuration,
    contentEndSeconds: usefulDuration,
    timingPolicy: "audio_driven_v1" as const,
    beats: [
      {
        segmentId,
        startSeconds: 0,
        endSeconds: usefulDuration,
        speakerCharacterId: segment.speakerCharacterId,
        dialogue: segment.dialogue,
        action: segment.action,
        camera: segment.camera,
        motion: segment.motionPrompt,
        openingState: segment.openingState,
        closingState: segment.closingState,
        props: segment.props,
      },
    ],
  };
  const directed: FilmScene = {
    ...scene,
    storyboard: board,
    dialogue: segment.dialogue,
    action: segment.action,
    camera: segment.camera,
    image_prompt: segment.imagePrompt,
    motion_prompt: segment.motionPrompt,
    duration_seconds: providerDuration,
    speaker_character_id: segment.speakerCharacterId,
  };
  const measured = speechDuration ? new Map([[0, speechDuration]]) : undefined;
  // Pricing only needs a valid media URL. The worker replaces this with the
  // exact frame task output immediately before calling the provider.
  const pricingImage =
    approvedSegmentImage ||
    currentSceneTask(tasks, scene, "image", plan.audio_mode) ||
    sourceClip;
  const references: Array<{
    url: string;
    binding: string;
    source: { taskId: string } | { path: string } | { url: string };
  }> = [
    {
      url: await signed(a, String(pricingImage.result?.path)),
      binding: "scene: bố cục và trạng thái mở của đúng đoạn cần sửa",
      source: { taskId: approvedSegmentImage?.id || frame!.id },
    },
  ];
  for (const character of scene.cast_snapshot) {
    for (const source of character.referenceImages.length
      ? character.referenceImages
      : [character.imageUrl]) {
      if (!source) continue;
      references.push({
        url: isProjectMediaPath(a.project.id, source)
          ? await signed(a, source)
          : source,
        binding: `character: ảnh nhận diện đã duyệt của ${character.name}`,
        source: isProjectMediaPath(a.project.id, source)
          ? { path: source }
          : { url: source },
      });
    }
  }
  if (references.length > seedanceReferenceLimit(plan.video_model))
    throw new FilmError("Bộ ảnh tham chiếu của đoạn vượt giới hạn model.", 422);
  const packet = {
    urls: references.map((reference) => reference.url),
    bindings: references.map(
      (reference, index) => `@image${index + 1} = ${reference.binding}.`,
    ),
  };
  const providerInputs = filmVideoInputs(
    directed,
    "dubbed",
    plan.format,
    plan.resolution,
    packet,
    0,
    plan.video_model,
    measured,
  );
  const { reference_images: _signedReferenceUrls, ...storedProviderInputs } =
    providerInputs;
  void _signedReferenceUrls;
  const schedule = audio
    ? [
        {
          audioTaskId: audio.id,
          beatIndex: 0,
          speakerCharacterId: segment.speakerCharacterId,
          voiceProfileVersion: segment.voiceProfileVersion,
          voice: (audio.input.providerInputs as Record<string, unknown>).voice ||
            (audio.input.providerInputs as Record<string, unknown>).voice_id,
          dialogue: segment.dialogue,
          startSeconds: 0,
          endSeconds: speechDuration + 0.1,
          duration: speechDuration,
        },
      ]
    : [];
  const video = task(
    "video",
    {
      model: plan.video_model,
      providerInputs: storedProviderInputs,
      referenceTaskIds: [approvedSegmentImage?.id || frame!.id],
      referenceSources: references.map((reference) => reference.source),
      referenceBindings: packet.bindings,
      audioTaskIds: audio ? [audio.id] : [],
      dubbingSchedule: schedule,
      audioMode: "dubbed",
      cast: scene.cast_snapshot,
      dialogue: segment.dialogue,
      speakerCharacterId: segment.speakerCharacterId,
      storyboard: board,
      format: plan.format,
      resolution: plan.resolution,
      sourceSceneId: scene.id,
      sourceSceneVersion: scene.version,
      segmentId,
      segmentRevision: segment.revision,
      usedDuration: usefulDuration,
      subjectKey: `${segmentId}:${segment.revision}:video`,
    },
    await modelPrice(plan.video_model, providerInputs),
    undefined,
    frame ? [frame.id] : [],
  );
  const items = frame ? [frame, video] : [video];
  if (audio) {
    items.push(
      task(
        "dub",
        {
          model: "ffmpeg-dub-v1",
          videoTaskId: video.id,
          schedule,
          duration: providerDuration,
          cast: scene.cast_snapshot,
          dialogue: segment.dialogue,
          speakerCharacterId: segment.speakerCharacterId,
          sourceSceneId: scene.id,
          sourceSceneVersion: scene.version,
          segmentId,
          segmentRevision: segment.revision,
          subjectKey: `${segmentId}:${segment.revision}:dub`,
          usedDuration: usefulDuration,
        },
        0,
        undefined,
        [video.id, audio.id],
      ),
    );
  }
  return storeQuote(a, items, plan);
}

export async function quoteSegmentRender(a: Access, plan: FilmPlan) {
  const segments = await readFilmSegments(a, plan);
  const tasks = await tasksForPlan(a, plan.id);
  const clips = segments.map((segment) => {
    const scene = plan.video_plan_scenes.find((item) => item.id === segment.sceneId)!;
    const defaultClip = sourceForScene(tasks, scene, plan);
    const taskId = segment.selectedTaskId || defaultClip?.id;
    if (!taskId) throw new FilmError(`Đoạn ${segment.sequenceIndex + 1} chưa có clip nguồn.`);
    const transcript = currentSceneTask(tasks, scene, "transcribe", plan.audio_mode);
    const replacement = Boolean(
      segment.selectedTaskId &&
        segment.selectedTaskId !== segment.sourceTaskId,
    );
    return {
      taskId,
      transcriptTaskId: replacement ? null : transcript?.id,
      sceneId: scene.id,
      segmentId: segment.segmentId,
      segmentRevision: segment.revision,
      inSeconds: segment.selectedInSeconds ?? segment.inSeconds,
      outSeconds: segment.selectedOutSeconds ?? segment.outSeconds,
      trimSpeech: false,
    };
  });
  const inputHash = hash({
    clips,
    format: plan.format,
    resolution: plan.resolution,
    subtitles: plan.subtitles,
    caption: plan.caption,
  });
  const { data: existing } = await a.admin
    .from("short_film_edit_manifests")
    .select("id,version,render_task_id")
    .eq("plan_id", plan.id)
    .eq("input_hash", inputHash)
    .maybeSingle();
  const { data: latest } = await a.admin
    .from("short_film_edit_manifests")
    .select("version")
    .eq("plan_id", plan.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  let manifest = existing;
  if (manifest?.render_task_id)
    throw new FilmError(
      "Bản dựng với đúng các đoạn này đã được nhận. Hãy xem kết quả hoặc sửa task render đang lỗi.",
      409,
    );
  if (!manifest) {
    const { data, error } = await a.admin
      .from("short_film_edit_manifests")
      .insert({
        project_id: a.project.id,
        plan_id: plan.id,
        workspace_version: a.project.workspace_version,
        version: Number(latest?.version || 0) + 1,
        items: clips,
        input_hash: inputHash,
        created_by: a.user.id,
      })
      .select("id,version,render_task_id")
      .single();
    if (error) {
      if (error.code !== "23505") throw error;
      const { data: raced, error: raceError } = await a.admin
        .from("short_film_edit_manifests")
        .select("id,version,render_task_id")
        .eq("plan_id", plan.id)
        .eq("input_hash", inputHash)
        .single();
      if (raceError) throw raceError;
      if (raced.render_task_id)
        throw new FilmError("Bản dựng với đúng các đoạn này đã được nhận.", 409);
      manifest = raced;
    } else manifest = data;
  }
  if (!manifest) throw new FilmError("Không khóa được manifest bản dựng.", 500);
  const render = task("render", {
    clips,
    format: plan.format,
    resolution: plan.resolution,
    subtitles: plan.subtitles,
    caption: plan.caption,
    brief: plan.brief,
    brand: { ...a.project },
    editManifestId: manifest.id,
    editManifestVersion: manifest.version,
    subjectKey: `${plan.id}:edit-manifest:${manifest.version}`,
  }, 0);
  const quote = await storeQuote(a, [render], plan);
  return quote;
}
