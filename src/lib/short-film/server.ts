import "server-only";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { normalizeScene, type SceneInput } from "@/lib/multiscene-video";
import {
  estimateImageGenerationPrice,
  AI_PRICE_MARKUP_MULTIPLIER,
  AI_PRICING_USD_VND,
  BILLING_POINT_FLOOR_VND,
} from "@/lib/ai-pricing";
import {
  FILM_MODELS,
  currentSceneTask,
  compileFilmMotion,
  shotDuration,
  type FilmPlan,
  type FilmCast,
  type FilmScene,
  type FilmTask,
  type QuotedTask,
  type FilmKind,
} from "./contracts";
export const hash = (v: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
export class FilmError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const fail = (e: unknown) =>
  NextResponse.json(
    { error: e instanceof Error ? e.message : "Không xử lý được phim." },
    { status: e instanceof FilmError ? e.status : 500 },
  );
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export async function access(request: NextRequest, ref: string) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) throw new FilmError("Phiên đăng nhập đã hết hạn.", 401);
  const q = supabase
    .from("projects")
    .select(
      "id,workspace_version,watermark_url,watermark_position,watermark_opacity",
    )
    .limit(1);
  const { data: project, error } = await (
    UUID.test(ref) ? q.eq("id", ref) : q.eq("slug", ref)
  ).maybeSingle();
  if (error || !project)
    throw new FilmError("Không tìm thấy dự án hoặc đã hết quyền.", 404);
  return { supabase, admin: getSupabaseAdmin(), user, project };
}
export type Access = Awaited<ReturnType<typeof access>>;
export async function readPlan(a: Access, id: string) {
  const { data, error } = await a.admin
    .from("video_plans")
    .select("*,video_plan_scenes(*)")
    .eq("id", id)
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .single();
  if (error || !data)
    throw new FilmError("Không tìm thấy phim trong workspace hiện tại.", 404);
  return {
    ...data,
    video_plan_scenes: data.video_plan_scenes
      .filter((s: FilmScene) => !s.deleted_at)
      .sort((x: FilmScene, y: FilmScene) => x.scene_index - y.scene_index),
  } as FilmPlan;
}
export function checkVersion(
  a: Access,
  body: Record<string, unknown>,
  plan?: FilmPlan,
) {
  if (Number(body.workspaceVersion) !== a.project.workspace_version)
    throw new FilmError(
      "Workspace đã thay đổi. Hãy tải lại bản hiện tại.",
      409,
    );
  if (plan && Number(body.expectedVersion) !== plan.version)
    throw new FilmError(
      "Bản nháp đã đổi ở tab khác. Nội dung đang nhập vẫn được giữ.",
      409,
    );
}
export async function freezeCast(
  a: Access,
  ids: string[],
  previous: FilmCast[] = [],
) {
  if (ids.length > 4) throw new FilmError("Tối đa bốn nhân vật trong phim.");
  if (!ids.length) return [];
  const { data: chars, error } = await a.admin
    .from("characters")
    .select("id,name,description,personality,continuity_asset_id")
    .eq("project_id", a.project.id)
    .in("id", ids);
  if (error || chars?.length !== ids.length)
    throw new FilmError("Nhân vật không thuộc dự án.");
  const cast: FilmCast[] = [];
  for (const c of chars) {
    const old = previous.find((x) => x.characterId === c.id);
    const { data: v } = await a.admin
      .from("asset_versions")
      .select("id,version,reference_images(image_url,is_primary,role)")
      .eq("asset_id", c.continuity_asset_id)
      .eq("status", "locked")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const primary = v?.reference_images.find(
      (r: { is_primary: boolean }) => r.is_primary,
    )?.image_url;
    if (!old && (!v || !primary))
      throw new FilmError(`${c.name} cần ảnh chuẩn được duyệt.`);
    const { data: voice } = await a.admin
      .from("character_voice_versions")
      .select("id,voice_id,model,settings")
      .eq("character_id", c.id)
      .eq("workspace_version", a.project.workspace_version)
      .not("approved_at", "is", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Never mix a locked reference set with mutable avatars or expression grids.
    cast.push({
      ...old,
      ...(!old
        ? {
            characterId: c.id,
            name: c.name,
            description: c.description || "",
            personality: c.personality || "",
            imageUrl: primary,
            referenceImages: [primary],
            assetVersionId: v!.id,
            assetVersion: v!.version,
          }
        : {}),
      ...(voice ? { voice } : {}),
    } as FilmCast);
  }
  return cast;
}
export async function savePlan(
  a: Access,
  body: Record<string, unknown>,
  old?: FilmPlan,
) {
  checkVersion(a, body, old);
  const inputs = body.scenes as (SceneInput & { camera?: string })[];
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 12)
    throw new FilmError("Cần 1–12 cảnh.");
  const ids = [...new Set(inputs.flatMap((s) => s.characterIds || []))];
  const cast = await freezeCast(a, ids, old?.cast_snapshot);
  const rows = inputs.map((raw, i) => {
    const s = normalizeScene(raw);
    if (
      s.characterIds.some((id) => !ids.includes(id)) ||
      (s.speakerCharacterId &&
        !s.characterIds.includes(s.speakerCharacterId)) ||
      (s.dialogue && !s.speakerCharacterId)
    )
      throw new FilmError(`Cảnh ${i + 1} cần đúng người nói trong cast.`);
    const row = {
      id: raw.id || crypto.randomUUID(),
      scene_index: i,
      cast_snapshot: cast.filter((c) => s.characterIds.includes(c.characterId)),
      speaker_character_id: s.speakerCharacterId,
      dialogue: s.dialogue,
      action: s.action,
      setting: s.setting,
      camera: String(raw.camera || "").slice(0, 600),
      duration_seconds: s.durationSeconds,
      start_image_url: s.startImageUrl,
      end_image_url: s.endImageUrl,
      follows_previous: s.followsPrevious,
      image_prompt: s.imagePrompt,
      motion_prompt: s.motionPrompt,
      source_mode: s.sourceMode,
    };
    const { id, scene_index, ...visual } = row;
    void id;
    void scene_index;
    return { ...row, input_hash: hash(visual) };
  });
  const plan = {
    title: String(body.title || "Phim ngắn").slice(0, 160),
    brief: String(body.brief || "").slice(0, 4000),
    caption: String(body.caption || "").slice(0, 5000),
    format: ["9:16", "1:1", "16:9", "4:5"].includes(String(body.format))
      ? body.format
      : "9:16",
    resolution: body.resolution === "1080p" ? "1080p" : "720p",
    audio_mode: body.audioMode === "native" ? "native" : "fixed",
    subtitles: body.subtitles !== false,
    target_duration_seconds: [15, 30, 60].includes(
      Number(body.targetDurationSeconds),
    )
      ? Number(body.targetDurationSeconds)
      : 30,
    cast_snapshot: cast,
  };
  const { data, error } = await a.admin.rpc("save_film_plan", {
    p_project: a.project.id,
    p_actor: a.user.id,
    p_workspace: a.project.workspace_version,
    p_id: old?.id || crypto.randomUUID(),
    p_expected: old?.version ?? null,
    p_plan: plan,
    p_scenes: rows,
  });
  if (error)
    throw new FilmError(
      error.message,
      error.message.includes("VERSION") ? 409 : 400,
    );
  if (old && old.caption !== plan.caption) {
    const { data: current } = await a.admin
      .from("video_plans")
      .select("latest_content_output_id")
      .eq("id", old.id)
      .single();
    if (current?.latest_content_output_id) {
      const { error: captionError } = await a.admin
        .from("content_outputs")
        .update({ caption: plan.caption })
        .eq("id", current.latest_content_output_id);
      if (captionError) throw captionError;
    }
  }
  return readPlan(a, data);
}
export async function signed(a: Access, path: string) {
  if (!path.startsWith(`${a.project.id}/`))
    throw new FilmError("Media không thuộc dự án.", 403);
  const { data, error } = await a.admin.storage
    .from("content-media")
    .createSignedUrl(path, 3600);
  if (error || !data) throw new FilmError("Không đọc được media.");
  return data.signedUrl;
}
export async function tasksForPlan(a: Access, id: string) {
  const { data, error } = await a.admin
    .from("short_film_tasks")
    .select("*")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .eq("plan_id", id)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw error;
  return data as FilmTask[];
}
export async function publicTasks(a: Access, tasks: FilmTask[]) {
  return Promise.all(
    tasks.map(async (t) => ({
      id: t.id,
      kind: t.kind,
      displayName:
        typeof t.input.displayName === "string"
          ? t.input.displayName
          : undefined,
      scene_id: t.scene_id,
      scene_version: t.scene_version,
      status: t.status,
      error: t.error,
      approved_at: t.approved_at,
      created_at: t.created_at,
      input: {
        imageTaskId: t.input.imageTaskId,
        audioTaskId: t.input.audioTaskId,
        videoTaskId: t.input.videoTaskId,
      },
      result: t.result,
      url: t.result?.path ? await signed(a, String(t.result.path)) : undefined,
      posterUrl: t.result?.poster
        ? await signed(a, String(t.result.poster))
        : undefined,
      srtUrl: t.result?.srt ? await signed(a, String(t.result.srt)) : undefined,
    })),
  );
}
export async function modelPrice(
  model: string,
  inputs: Record<string, unknown>,
) {
  const r = await fetch("https://api.wavespeed.ai/api/v3/model/price", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model_id: model, inputs }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  const n = Number((j.data || j).discounted_price ?? (j.data || j).price);
  if (!r.ok || !Number.isFinite(n) || n <= 0)
    throw new FilmError(
      "Provider chưa trả giá hợp lệ. Chưa gửi lượt tạo.",
      503,
    );
  return Math.max(
    1,
    Math.ceil(
      (n * AI_PRICE_MARKUP_MULTIPLIER * AI_PRICING_USD_VND) /
        BILLING_POINT_FLOOR_VND,
    ),
  );
}
export async function storeQuote(
  a: Access,
  tasks: QuotedTask[],
  plan?: FilmPlan,
) {
  if (!tasks.length) throw new FilmError("Không có bước mới cần tạo.");
  const points = tasks.reduce((s, t) => s + t.points, 0);
  const { data, error } = await a.admin
    .from("short_film_quotes")
    .insert({
      project_id: a.project.id,
      plan_id: plan?.id,
      plan_version: plan?.version,
      workspace_version: a.project.workspace_version,
      created_by: a.user.id,
      tasks,
      points,
    })
    .select("id,points,expires_at")
    .single();
  if (error) throw error;
  return {
    ...data,
    items: tasks.map((t) => ({
      kind: t.kind,
      sceneId: t.sceneId,
      points: t.points,
    })),
  };
}
export function task(
  kind: FilmKind,
  input: Record<string, unknown>,
  points: number,
  scene?: FilmScene,
  dependencies: string[] = [],
): QuotedTask {
  return {
    id: crypto.randomUUID(),
    kind,
    input: {
      ...input,
      subjectKey: input.subjectKey || `${scene?.id}:${scene?.version}:${kind}`,
    },
    points,
    sceneId: scene?.id,
    sceneVersion: scene?.version,
    dependencies,
    hash: hash(input),
  };
}
export async function quotePlan(
  a: Access,
  plan: FilmPlan,
  body: Record<string, unknown>,
) {
  checkVersion(a, body, plan);
  const stage = String(body.stage || "prepare");
  const selected = Array.isArray(body.sceneIds)
    ? body.sceneIds
    : plan.video_plan_scenes.map((s) => s.id);
  const scenes = plan.video_plan_scenes.filter((s) => selected.includes(s.id));
  if (!scenes.length) throw new FilmError("Chọn cảnh cần tạo.");
  const existing = await tasksForPlan(a, plan.id);
  const tasks: QuotedTask[] = [];
  const latest = (s: FilmScene, kind: FilmKind) =>
    currentSceneTask(existing, s, kind, plan.audio_mode);
  if (stage === "prepare")
    for (const s of scenes) {
      if (
        (!latest(s, "image") || body.regenerate === true) &&
        !s.follows_previous
      ) {
        const input = {
          model: FILM_MODELS.image,
          prompt: [
            s.image_prompt,
            `Bối cảnh ${s.setting}. Hành động ${s.action}. Máy quay ${s.camera}.`,
            "Dựng đúng một khung ảnh điện ảnh 3D, không chữ, không lưới ảnh. Đủ cast được đính kèm; giữ nhận diện và trang phục.",
          ].join("\n"),
          cast: s.cast_snapshot,
          format: plan.format,
        };
        const p = estimateImageGenerationPrice({
          model: FILM_MODELS.image,
          resolution: "1K",
          inputImageCount: s.cast_snapshot.length,
          prompt: input.prompt,
        });
        tasks.push(task("image", input, p.customerPoints, s));
      }
      if (
        s.dialogue &&
        plan.audio_mode === "fixed" &&
        (!latest(s, "tts") || body.regenerate === true)
      ) {
        const c = s.cast_snapshot.find(
          (c) => c.characterId === s.speaker_character_id,
        );
        if (!c?.voice)
          throw new FilmError(
            `Duyệt giọng của ${c?.name || "người nói"} trước.`,
          );
        const inputs = {
          text: s.dialogue,
          voice_id: c.voice.voice_id,
          ...c.voice.settings,
          format: "wav",
          sample_rate: 44100,
          channel: "1",
          language_boost: "Vietnamese",
        };
        tasks.push(
          task(
            "tts",
            {
              model: FILM_MODELS.tts,
              providerInputs: inputs,
              voiceProfileVersion: c.voice.id,
            },
            await modelPrice(FILM_MODELS.tts, inputs),
            s,
          ),
        );
      }
    }
  else if (stage === "frame") {
    for (const s of scenes) {
      const prev = plan.video_plan_scenes[s.scene_index - 1];
      const clip =
        prev &&
        latest(
          prev,
          plan.audio_mode === "fixed" && prev.dialogue ? "lip_sync" : "video",
        );
      if (!clip?.approved_at)
        throw new FilmError("Duyệt clip cảnh trước để lấy khung nối tiếp.");
      tasks.push(
        task(
          "frame",
          { videoTaskId: clip.id, cast: s.cast_snapshot, format: plan.format },
          0,
          s,
        ),
      );
    }
  } else if (stage === "video") {
    if (
      plan.audio_mode === "fixed" &&
      process.env.SHORT_FILM_FIXED_VOICE_ENABLED !== "true"
    )
      throw new FilmError(
        "Giọng cố định đang kiểm chứng. Bạn vẫn có thể chuẩn bị ảnh và nghe thử giọng.",
        409,
      );
    for (const s of scenes) {
      const image = latest(s, "image"),
        audio = latest(s, "tts");
      if (s.follows_previous) {
        const prev = plan.video_plan_scenes[s.scene_index - 1];
        const clip =
          prev &&
          latest(
            prev,
            plan.audio_mode === "fixed" && prev.dialogue ? "lip_sync" : "video",
          );
        if (
          !clip ||
          image?.kind !== "frame" ||
          image.result?.fromTaskId !== clip.id
        )
          throw new FilmError(
            "Lấy và duyệt khung cuối từ clip mới nhất của cảnh trước.",
          );
      }
      if (!image?.approved_at)
        throw new FilmError(`Duyệt ảnh đầu cảnh ${s.scene_index + 1} trước.`);
      if (plan.audio_mode === "fixed" && s.dialogue && !audio?.approved_at)
        throw new FilmError(
          `Nghe và duyệt thoại cảnh ${s.scene_index + 1} trước.`,
        );
      const duration = shotDuration(
        Number(audio?.result?.duration || 0),
        s.duration_seconds,
      );
      const inputs = {
        prompt: compileFilmMotion(s, plan.audio_mode, plan.format),
        image: await signed(a, String(image.result?.path)),
        duration,
        resolution: plan.resolution,
        generate_audio: plan.audio_mode === "native",
      };
      const v = task(
        "video",
        {
          model: FILM_MODELS.video,
          providerInputs: inputs,
          imageTaskId: image.id,
          audioTaskId: audio?.id,
          cast: s.cast_snapshot,
          dialogue: s.dialogue,
          format: plan.format,
          resolution: plan.resolution,
        },
        await modelPrice(FILM_MODELS.video, inputs),
        s,
      );
      tasks.push(v);
    }
  } else if (stage === "finish" || stage === "transcript") {
    for (const s of scenes) {
      const kind =
        stage === "finish" && plan.audio_mode === "fixed" && s.dialogue
          ? "lip_sync"
          : "transcribe";
      if (!s.dialogue || latest(s, kind)) continue;
      const video = latest(
        s,
        kind === "transcribe" && plan.audio_mode === "fixed"
          ? "lip_sync"
          : "video",
      );
      const audio = latest(s, "tts");
      if (!video?.result?.path)
        throw new FilmError(`Cảnh ${s.scene_index + 1} chưa có clip nguồn.`);
      const inputVideo = await signed(a, String(video.result.path));
      if (kind === "lip_sync") {
        if (!audio?.result?.path) throw new FilmError("Thiếu audio đã duyệt.");
        const inputs = {
          video: inputVideo,
          audio: await signed(a, String(audio.result.path)),
          sync_mode: "silence",
        };
        tasks.push(
          task(
            kind,
            {
              model: FILM_MODELS.lip_sync,
              providerInputs: inputs,
              videoTaskId: video.id,
              audioTaskId: audio.id,
              duration: video.result.duration,
              dialogue: s.dialogue,
            },
            await modelPrice(FILM_MODELS.lip_sync, inputs),
            s,
          ),
        );
      } else {
        const inputs = {
          video: inputVideo,
          language: "vi",
          task: "transcribe",
          enable_timestamps: true,
        };
        tasks.push(
          task(
            kind,
            {
              model: FILM_MODELS.transcribe,
              providerInputs: inputs,
              videoTaskId: video.id,
              dialogue: s.dialogue,
              duration: video.result.duration,
            },
            await modelPrice(FILM_MODELS.transcribe, inputs),
            s,
          ),
        );
      }
    }
  } else if (stage === "render") {
    const clips = plan.video_plan_scenes.map((s) => {
      const clip = latest(
        s,
        plan.audio_mode === "fixed" && s.dialogue ? "lip_sync" : "video",
      );
      const transcript = latest(s, "transcribe");
      if (!clip || !clip.approved_at)
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
  } else throw new FilmError("Bước sản xuất không hợp lệ.");
  return storeQuote(a, tasks, plan);
}
