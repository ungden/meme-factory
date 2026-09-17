import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compactDevelopmentTrace } from "../family-development";
import {
  FamilyScriptDirector,
  FAMILY_SCRIPT_STAGES,
  nextScriptStage,
  emptyFamilyScriptState,
  type FamilyScriptPipelineState,
  type FamilyScriptStageKind,
} from "../family-script-director";
import type {
  CreativeContext,
  CreativeAssistResult,
} from "../creative-assist";
import {
  compactStory,
  type ChannelProfile,
  type Story,
} from "../family-catalogue";
import {
  checkProductionScript,
  type PreviousSceneEvidence,
  checkTechnicalTask,
  checkVisualTask,
  visualEvidencePath,
} from "./automatic-qa";
import {
  speechTasks,
  finalClipKind,
  isAcceptedTask as accepted,
  currentSceneTask,
  referencePackReady,
  type FilmPlan,
  type FilmTask,
} from "./contracts";
import {
  readPlan,
  savePlan,
  tasksForPlan,
  type Access,
} from "./server";
import { quotePlan } from "./quote";
import {
  seedanceReferenceModel,
  seedanceMaxDuration,
} from "../video-models";
import { isProjectMediaPath } from "../project-media-path";
import { errorCode, kindLabel, stageLabel } from "../error-messages";

/** Mã báo hết ngân sách/điểm; mọi mã khác là lỗi thật và phải nổi lên. */
const BUDGET_CODES = new Set([
  "PRODUCTION_BUDGET_EXCEEDED",
  "INSUFFICIENT_POINTS",
  "BUDGET_BELOW_COMMITTED",
]);

type Run = {
  id: string;
  project_id: string;
  workspace_version: number;
  plan_id: string | null;
  plan_version: number | null;
  source: "manual" | "scheduled";
  intent: string;
  guests: Array<{
    key: string;
    name: string;
    description?: string;
    personality?: string;
  }>;
  /** Các giá trị short_film_production_runs.status thực sự cho phép. */
  status:
    | "queued"
    | "scripting"
    | "running"
    | "paused"
    | "budget_blocked"
    | "needs_review"
    | "completed"
    | "failed"
    | "cancelled";
  /**
   * `phase` là text tự do trong DB và được đặt động từ tên stage/kind
   * (vd `${task.kind}_check`), nên không thu về union được; nhãn hiển thị nằm
   * ở STAGE_LABELS trong error-messages.ts.
   */
  phase: string;
  snapshot: Record<string, unknown>;
  input_snapshot?: Record<string, unknown>;
  created_by: string;
  lease_owner: string;
  video_model?: string;
};

/**
 * Một hồ sơ kênh lấy từ snapshot chỉ dùng được khi có đủ các trường mà
 * checkProductionScript thật sự đọc. Thiếu thì trả null để gọi lại từ DB.
 */
function snapshotChannelProfile(value: unknown): ChannelProfile | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Partial<ChannelProfile>;
  return typeof profile.version === "number" &&
    Array.isArray(profile.roles) &&
    typeof profile.positioning === "string" &&
    typeof profile.tone === "string"
    ? (profile as ChannelProfile)
    : null;
}

function frozenPlan(run: Run): FilmPlan | null {
  const value = run.input_snapshot?.plan;
  if (!value || typeof value !== "object") return null;
  const plan = value as FilmPlan;
  return plan.id === run.plan_id && plan.version === run.plan_version
    ? plan
    : null;
}

async function heartbeatRun(admin: SupabaseClient, run: Run) {
  const { data, error } = await admin.rpc("heartbeat_film_production_run", {
    p_id: run.id,
    p_owner: run.lease_owner,
  });
  if (error || !data) throw new Error(error?.message || "RUN_LEASE_LOST");
}

async function accessForRun(admin: SupabaseClient, run: Run): Promise<Access> {
  const { data: project, error } = await admin
    .from("projects")
    .select(
      "id,user_id,name,brand_voice,audience,content_guidelines,default_format,workspace_version,watermark_url,watermark_position,watermark_opacity",
    )
    .eq("id", run.project_id)
    .eq("workspace_version", run.workspace_version)
    .single();
  if (error || !project) throw new Error("WORKSPACE_OR_ACCESS_CHANGED");
  return {
    supabase: admin,
    admin,
    user: { id: run.created_by } as Access["user"],
    project,
  } as Access;
}

async function creativeContext(a: Access) {
  const [
    { data: characters },
    { data: channel },
    { data: plans },
    { data: recent },
  ] = await Promise.all([
    a.admin
      .from("characters")
      .select(
        "id,name,description,personality,avatar_url,character_poses(image_url)",
      )
      .eq("project_id", a.project.id),
    a.admin
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    a.admin
      .from("video_plans")
      .select("story")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("updated_at", { ascending: false })
      .limit(20),
    a.admin
      .from("content_sets")
      .select("title,brief")
      .eq("project_id", a.project.id)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  const profile = (channel?.profile || null) as ChannelProfile | null;
  const context: CreativeContext = {
    projectName: String((a.project as Record<string, unknown>).name || "Dự án"),
    channelProfile: profile || undefined,
    recentStories: (plans || [])
      .map((p) => p.story as Story)
      .filter(Boolean)
      .map(compactStory),
    brandVoice: String(
      (a.project as Record<string, unknown>).brand_voice || "",
    ),
    audience: String((a.project as Record<string, unknown>).audience || ""),
    guidelines: String(
      (a.project as Record<string, unknown>).content_guidelines || "",
    ),
    characters: (characters || []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      personality: c.personality,
      imageUrl: c.avatar_url || c.character_poses?.[0]?.image_url || null,
    })),
    recentContent: (recent || [])
      .map((x) => `${x.title || ""} ${x.brief || ""}`.trim())
      .filter(Boolean),
  };
  return { context, profile };
}

async function scriptDirectorSetup(a: Access, run: Run) {
  const { context, profile } = await creativeContext(a);
  if (!profile) throw new Error("CHANNEL_PROFILE_REQUIRED");
  const { data: automation } = await a.admin
    .from("short_film_automation_settings")
    .select("default_config")
    .eq("project_id", a.project.id)
    .eq("workspace_version", a.project.workspace_version)
    .maybeSingle();
  const videoModel = seedanceReferenceModel(
    run.video_model || automation?.default_config?.videoModel,
  );
  const configuredFormat = String(
    automation?.default_config?.format ||
      (a.project as Record<string, unknown>).default_format ||
      "16:9",
  );
  const format = ["9:16", "16:9", "1:1", "4:5"].includes(configuredFormat)
    ? configuredFormat
    : "16:9";
  return { context, profile, videoModel, format };
}

async function saveScriptResult(
  a: Access,
  run: Run,
  result: Extract<CreativeAssistResult, { kind: "video_plan" }>,
  videoModel: string,
  format: string,
) {
  const guests = result.guests || [];
  return savePlan(a, {
    title: result.title,
    brief: run.intent || result.summary,
    caption: result.caption || "",
    // Kết quả đã lưu trong state trước bản sửa vẫn mang nhật ký đầy đủ.
    story: result.story
      ? { ...result.story, development: compactDevelopmentTrace(result.story.development) }
      : result.story,
    guests,
    targetDurationSeconds: 35,
    format,
    resolution: "720p",
    videoModel,
    audioMode: "dubbed",
    subtitles: true,
    scenes: result.scenes.map((s) => ({
      ...s,
      startImageUrl: null,
      endImageUrl: null,
      sourceMode: "generated",
    })),
    workspaceVersion: run.workspace_version,
  });
}

/**
 * Advance the AI director exactly one script stage. State lives in
 * short_film_script_runs; a stuck stage parks the run and resume continues
 * from the checkpoint instead of rewriting the whole episode.
 */
async function advanceScriptStage(admin: SupabaseClient, run: Run) {
  const a = await accessForRun(admin, run);
  const { context, profile, videoModel, format } = await scriptDirectorSetup(
    a,
    run,
  );
  const { data: row } = await admin
    .from("short_film_script_runs")
    .select("*")
    .eq("run_id", run.id)
    .maybeSingle();
  const stage: FamilyScriptStageKind | "done" =
    row?.stage === "done"
      ? "done"
      : row && FAMILY_SCRIPT_STAGES.includes(row.stage as FamilyScriptStageKind)
        ? (row.stage as FamilyScriptStageKind)
        : "premises";
  const savedState = (row?.state || {}) as FamilyScriptPipelineState;

const directorInput = {
    kind: "video_plan" as const,
    // Để trống khi người dùng không viết ý tưởng: director tự chọn đề tài và
    // giữ chống lặp 20 tập gần nhất; ý tưởng người dùng viết thì được làm lại.
    intent: run.intent?.trim() || undefined,
    context,
    selectedCharacterIds: profile.roles
      .map((r) => r.characterId)
      .filter((id) => context.characters.some((c) => c.id === id)),
    guestCharacters: Array.isArray(run.guests) ? run.guests : [],
    targetDurationSeconds: 35,
    maxVideoDurationSeconds: seedanceMaxDuration(videoModel),
  };
  const director = new FamilyScriptDirector(directorInput, {
    onEditorialProgress: async (trace) => {
      await patchRun(admin, run, { snapshot: { editorial: trace }, release: false });
    },
  });
  director.restore(
    savedState.benchmarkVersion ? savedState : emptyFamilyScriptState(),
  );

  // Failed stages are only retried when the operator resumes the run; cap the
  // automatic retry budget so a wedged stage asks a human instead of looping.
  if (row && row.status === "failed" && (row.attempts ?? 0) >= 6) {
    await patchRun(admin, run, {
      status: "needs_review",
      phase: "script",
      error: `Bước ${stageLabel(stage)} thất bại nhiều lần. Đổi ý tưởng hoặc kiểm tra lại.`,
      snapshot: { scriptStage: stage },
    });
    return;
  }

  try {
    if (stage === "done") {
      const result = savedState.result;
      if (!result) throw new Error("SCRIPT_RESULT_MISSING");
      const plan = await saveScriptResult(a, run, result, videoModel, format);
      await patchRun(admin, run, {
        status: "running",
        phase: "script_check",
        plan_id: plan.id,
        plan_version: plan.version,
        snapshot: { generatedPlan: true },
        input_snapshot: { plan, channelProfile: profile },
        delay_seconds: 3,
      });
      return;
    }
    await director.runStage(stage, Date.now() + 90000);
    // shots dựng từng đoạn và có thể dừng giữa chừng khi hết thời gian của lượt;
    // khi đó giữ nguyên stage để lượt sau dựng tiếp từ state đã lưu.
    const nextStage = director.pipelineState.completedStages.includes(stage)
      ? nextScriptStage(stage)
      : stage;
    await admin
      .from("short_film_script_runs")
      .upsert(
        {
          run_id: run.id,
          stage: nextStage,
          status: nextStage === "done" ? "completed" : "queued",
          state: director.snapshot(),
          attempts: 0,
          error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "run_id" },
      );
    await patchRun(admin, run, {
      status: "running",
      phase: "script",
      snapshot: { scriptStage: stage, scriptStageCompleted: nextStage !== stage },
      delay_seconds: 2,
    });
  } catch (error) {
    // Lỗi Supabase là object thường, không phải Error; trước đây chỉ còn lại
    // "SCRIPT_STAGE_FAILED" và không ai biết bước lưu hỏng vì đâu.
    const raw = error as { message?: unknown; code?: unknown; details?: unknown } | null;
    const message =
      error instanceof Error
        ? error.message
        : typeof raw?.message === "string"
          ? [raw.code, raw.message, raw.details].filter((part) => typeof part === "string" && part).join(" · ")
          : "SCRIPT_STAGE_FAILED";
    const attempts = (row?.attempts ?? 0) + 1;
    // Ghi trạng thái stage và đỗ lượt chạy là hai việc riêng biệt. Trước đây
    // chúng bị nối bằng `.then`: nếu upsert lỗi thì `patchRun` không bao giờ
    // chạy, rejection bị bỏ rơi, và lượt nằm lại ở "running" cho tới khi hết
    // lease mà không ai biết. Giờ luôn cố đỗ lượt, kể cả khi upsert hỏng.
    try {
      const { error: saveError } = await admin
        .from("short_film_script_runs")
        .upsert(
          {
            run_id: run.id,
            stage,
            status: "failed",
            state: director.snapshot(),
            attempts,
            error: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "run_id" },
        );
      if (saveError)
        console.error("short-film script stage state not saved", {
          runId: run.id,
          stage,
          message: saveError.message,
        });
    } finally {
      await patchRun(admin, run, {
        status: "needs_review",
        phase: "script",
        error: message.slice(0, 1000),
        snapshot: { scriptStage: stage, scriptStageError: message },
      });
    }
    // Keep the lease-owner heartbeat from another advance while we parked.
  }
}

async function signed(admin: SupabaseClient, project: string, path: string) {
  // Cùng một phép kiểm với server.ts: chỉ `startsWith` là chưa đủ, vì
  // `project/../khac/x.mp4` vẫn lọt. Đây là đường mà pipeline tự động dùng.
  if (!isProjectMediaPath(project, path))
    throw new Error("MEDIA_PROJECT_MISMATCH");
  const { data, error } = await admin.storage
    .from("content-media")
    .createSignedUrl(path, 600);
  if (error || !data) throw new Error("MEDIA_SIGN_FAILED");
  return data.signedUrl;
}

/** Ảnh 3 khung của clip đã duyệt ở cảnh liền trước; không có thì bỏ qua kiểm tra liên tục. */
async function previousSceneEvidence(
  a: Access,
  planId: string,
  task: FilmTask,
): Promise<PreviousSceneEvidence | undefined> {
  if (!task.scene_id) return undefined;
  const { data: scenes } = await a.admin
    .from("video_plan_scenes")
    .select("id,scene_index,action,setting")
    .eq("video_plan_id", planId)
    .is("deleted_at", null);
  const current = scenes?.find((scene) => scene.id === task.scene_id);
  const prior = current
    ? scenes
        ?.filter((scene) => scene.scene_index < current.scene_index)
        .sort((x, y) => y.scene_index - x.scene_index)[0]
    : undefined;
  if (!prior) return undefined;
  const { data: clip } = await a.admin
    .from("short_film_tasks")
    .select("result")
    .eq("project_id", a.project.id)
    .eq("scene_id", prior.id)
    .eq("kind", "video")
    .eq("status", "completed")
    .or("approved_at.not.is.null,auto_accepted_at.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sheet = (clip?.result as { qaFramePath?: string } | null)?.qaFramePath;
  if (!sheet) return undefined;
  return {
    contactSheetUrl: await signed(a.admin, a.project.id, sheet),
    action: String(prior.action || ""),
    setting: String(prior.setting || ""),
  };
}

async function ensureTaskCheck(a: Access, run: Run, task: FilmTask) {
  if (task.approved_at || task.auto_accepted_at) return "passed";
  let check = checkTechnicalTask(task);
  if (["image", "frame", "video", "lip_sync", "dub"].includes(task.kind)) {
    // Speaker routing cannot be proven from a static contact sheet. Feed the
    // actual clip to the multimodal check; oversized clips stay needs_review.
    const path = visualEvidencePath(task);
    if (!path)
      check = {
        status: "needs_review" as const,
        issues: ["Không có khung hình để kiểm tra."],
        evidence: {},
      };
    else {
      const media = await signed(a.admin, a.project.id, path);
      const cast = Array.isArray(task.input.cast)
        ? (task.input.cast as Array<{ imageUrl?: string }>)
        : [];
      const referenceTaskIds = Array.isArray(task.input.referenceTaskIds)
        ? (task.input.referenceTaskIds as string[])
        : [];
      const { data: referenceTasks } = referenceTaskIds.length
        ? await a.admin
            .from("short_film_tasks")
            .select("id,result")
            .eq("project_id", a.project.id)
            .in("id", referenceTaskIds)
        : { data: [] as Array<{ id: string; result: { path?: string } }> };
      const authoredReferences = await Promise.all(
        referenceTaskIds.map(async (id) => {
          const source = referenceTasks?.find((candidate) => candidate.id === id);
          return source?.result?.path
            ? signed(a.admin, a.project.id, source.result.path)
            : "";
        }),
      );
      const castReferences = await Promise.all(
        cast.map(async (c) => {
          const value = c.imageUrl || "";
          return value.startsWith(`${a.project.id}/`)
            ? signed(a.admin, a.project.id, value)
            : value;
        }),
      );
      check = await checkVisualTask(
        task,
        media,
        [...authoredReferences, ...castReferences].filter(Boolean),
        task.kind === "video" && run.plan_id
          ? await previousSceneEvidence(a, run.plan_id, task)
          : undefined,
      );
    }
  }
  const { error } = await a.admin.rpc("record_film_automatic_check", {
    p_run: run.id,
    p_task: task.id,
    p_kind: task.kind,
    p_status: check.status,
    p_evidence: { ...check.evidence, issues: check.issues },
  });
  if (error) throw error;
  return check.status;
}

type StageSelection = {
  stage: "prepare" | "video" | "finish" | "transcript" | "check" | "render" | "completed";
  sceneIds: string[];
};

export function nextProductionStage(plan: FilmPlan, tasks: FilmTask[]): StageSelection {
  const latest = (
    s: FilmPlan["video_plan_scenes"][number],
    kind: Parameters<typeof currentSceneTask>[2],
  ) => currentSceneTask(tasks, s, kind, plan.audio_mode);
  const scenes = plan.video_plan_scenes;
  const speechReady = (s: FilmPlan["video_plan_scenes"][number]) =>
    !s.dialogue ||
    plan.audio_mode === "native" ||
    (plan.audio_mode === "dubbed"
      ? speechTasks(tasks, s).length > 0 && speechTasks(tasks, s).every(accepted)
      : accepted(latest(s, "tts")));
  const prepare = scenes.filter(
    (s) => !referencePackReady(tasks, s) || !speechReady(s),
  );
  if (prepare.length) return { stage: "prepare", sceneIds: prepare.map((s) => s.id) };

  const video = scenes.filter(
    (s) => referencePackReady(tasks, s) && !latest(s, "video"),
  );
  if (video.length) return { stage: "video", sceneIds: video.map((s) => s.id) };

  const finish = scenes.filter(
    (s) =>
      !!latest(s, "video") &&
      plan.audio_mode !== "native" &&
      !!s.dialogue &&
      !latest(s, finalClipKind(s, plan.audio_mode)),
  );
  if (finish.length) return { stage: "finish", sceneIds: finish.map((s) => s.id) };

  const transcript = scenes.filter(
    (s) =>
      !!s.dialogue &&
      !!latest(s, finalClipKind(s, plan.audio_mode)) &&
      !latest(s, "transcribe"),
  );
  if (transcript.length)
    return {
      stage: plan.audio_mode !== "native" ? "transcript" : "finish",
      sceneIds: transcript.map((s) => s.id),
    };

  const check = scenes.filter(
    (s) => !accepted(latest(s, finalClipKind(s, plan.audio_mode))),
  );
  if (check.length) return { stage: "check", sceneIds: check.map((s) => s.id) };
  const render = tasks.find(
    (t) =>
      t.kind === "render" &&
      t.plan_version === plan.version &&
      t.status === "completed",
  );
  return render
    ? { stage: "completed", sceneIds: [] }
    : { stage: "render", sceneIds: scenes.map((s) => s.id) };
}

export function completedRenderOutputId(
  tasks: FilmTask[],
  planVersion: number,
): string | null {
  const render = tasks.find(
    (task) =>
      task.kind === "render" &&
      task.plan_version === planVersion &&
      task.status === "completed" &&
      typeof task.result?.outputId === "string",
  );
  return typeof render?.result?.outputId === "string"
    ? render.result.outputId
    : null;
}

async function patchRun(
  admin: SupabaseClient,
  run: Run,
  patch: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc("checkpoint_film_production_run", {
    p_id: run.id,
    p_owner: run.lease_owner,
    p_patch: patch,
  });
  if (error || !data) throw new Error(error?.message || "RUN_LEASE_LOST");
}

export async function advanceProductionRun(admin: SupabaseClient, run: Run) {
  const a = await accessForRun(admin, run);
  let leaseLost = false;
  let heartbeating = false;
  const timer = setInterval(() => {
    if (heartbeating || leaseLost) return;
    heartbeating = true;
    void heartbeatRun(admin, run)
      .catch(() => {
        leaseLost = true;
      })
      .finally(() => {
        heartbeating = false;
      });
  }, 30_000);
  const assertLease = () => {
    if (leaseLost) throw new Error("RUN_LEASE_LOST");
  };
  try {
    let profile: ChannelProfile | null = null;
    if (!run.plan_id) {
      // The AI director advances exactly one script stage per claim. The
      // stage persists its own state and parks the run on failure, so a stuck
      // Gemini call never takes down the rest of the pipeline.
      await advanceScriptStage(admin, run);
      return;
    }
    const plan: FilmPlan =
      frozenPlan(run) || (await readPlan(a, run.plan_id));
    if (plan.version !== run.plan_version)
      throw new Error("PLAN_VERSION_CHANGED");
    if (!frozenPlan(run)) {
      const { profile: channelProfile } = await creativeContext(a);
      await patchRun(admin, run, {
        input_snapshot: { plan, channelProfile },
        release: false,
      });
      assertLease();
    }
    if (run.snapshot?.scriptCheck !== "passed") {
      if (!profile)
        // input_snapshot là jsonb do một tiến trình trước ghi. Ép kiểu mà không
        // kiểm tra nghĩa là một snapshot lệch hình dạng sẽ đi thẳng vào
        // checkProductionScript — lời gọi AI có tính phí — và cho ra một kết
        // luận sai nhưng rất tự tin. Dữ liệu không dùng được thì đọc lại từ DB.
        profile =
          snapshotChannelProfile(run.input_snapshot?.channelProfile) ||
          (await creativeContext(a)).profile;
      const check = plan.script_review
        ? {
            status: "passed" as const,
            issues: [],
            evidence: { humanReview: true },
          }
        : await checkProductionScript(plan, profile);
      const { error: checkError } = await admin.rpc(
        "record_film_automatic_check",
        {
          p_run: run.id,
          p_task: null,
          p_kind: "script",
          p_status: check.status,
          p_evidence: { ...check.evidence, issues: check.issues },
        },
      );
      if (checkError) throw checkError;
      if (check.status !== "passed") {
        await patchRun(admin, run, {
          status: "needs_review",
          phase: "script_check",
          error: check.issues.join(" "),
          snapshot: {
            scriptCheck: check.status,
            scriptEvidence: check.evidence,
          },
        });
        return;
      }
      await patchRun(admin, run, {
        status: "running",
        phase: "prepare",
        snapshot: { scriptCheck: "passed", scriptEvidence: check.evidence },
        delay_seconds: 3,
      });
      return;
    }
    const tasks = await tasksForPlan(a, plan.id);
    const own = tasks.filter((t) => t.production_run_id === run.id);
    const eligible = tasks.filter(
      (task) =>
        task.production_run_id === run.id ||
        Boolean(task.approved_at || task.auto_accepted_at),
    );
    if (own.some((t) => t.status === "reconciling")) {
      await patchRun(admin, run, {
        status: "needs_review",
        phase: run.phase,
        error: "Có yêu cầu provider cần đối soát.",
        snapshot: { scriptCheck: "passed" },
      });
      return;
    }
    if (own.some((t) => ["failed", "cancelled"].includes(t.status))) {
      await patchRun(admin, run, {
        status: "needs_review",
        phase: run.phase,
        error: "Một công đoạn không hoàn tất; kết quả thành công được giữ lại.",
        snapshot: { scriptCheck: "passed" },
      });
      return;
    }
    if (own.some((t) => ["queued", "running"].includes(t.status))) {
      await patchRun(admin, run, {
        status: "running",
        phase: run.phase,
        snapshot: { scriptCheck: "passed" },
        delay_seconds: 5,
      });
      return;
    }
    for (const task of own.filter(
      (t) => t.status === "completed" && !t.approved_at && !t.auto_accepted_at,
    )) {
      const status = await ensureTaskCheck(a, run, task);
      if (status !== "passed") {
        await patchRun(admin, run, {
          status: "needs_review",
          phase: `${task.kind}_check`,
          error: `Công đoạn ${kindLabel(task.kind)} cần xem lại.`,
          snapshot: { scriptCheck: "passed", failedTaskId: task.id },
        });
        return;
      }
      task.auto_accepted_at = new Date().toISOString();
    }
    const selection = nextProductionStage(plan, eligible);
    const { stage } = selection;
    if (stage === "check") {
      await patchRun(admin, run, {
        status: "needs_review",
        phase: "clip_check",
        error: "Có clip chưa đủ bằng chứng để tự chấp nhận.",
        snapshot: { scriptCheck: "passed" },
      });
      return;
    }
    if (stage === "completed") {
      const outputId =
        completedRenderOutputId(own, plan.version) ||
        completedRenderOutputId(eligible, plan.version) ||
        plan.latest_content_output_id ||
        null;
      if (!outputId) throw new Error("RENDER_OUTPUT_NOT_LINKED");
      await patchRun(admin, run, {
        status: "completed",
        phase: "ready_review",
        snapshot: {
          scriptCheck: "passed",
          outputId,
        },
      });
      return;
    }
    assertLease();
    const quote = await quotePlan(a, plan, {
      workspaceVersion: run.workspace_version,
      expectedVersion: plan.version,
      stage,
      sceneIds: selection.sceneIds,
      productionRunId: run.id,
    });
    // Lease được kiểm trước quotePlan, nhưng quotePlan đi mạng và mất vài giây.
    // accept_film_quote trừ điểm KHÔNG hoàn tác được, nên kiểm lại ngay trước
    // khi tiêu tiền thay vì tin vào kết quả kiểm từ trước lúc gọi mạng.
    assertLease();
    const { error } = await admin.rpc("accept_film_quote", {
      p_quote: quote.id,
      p_actor: run.created_by,
      p_key: crypto
        .createHash("md5")
        .update(
          `${run.id}:${plan.id}:${plan.version}:${stage}:${[...selection.sceneIds].sort().join(",")}`,
        )
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
    });
    if (error) {
      // Tra đúng mã thay vì dò chuỗi con: "BUDGET" cũng khớp những lỗi không
      // phải hết ngân sách, và mã thô của Postgres từng bị ghi thẳng vào
      // run.error rồi hiện nguyên văn cho người dùng.
      if (BUDGET_CODES.has(errorCode(error) || "")) {
        await patchRun(admin, run, {
          status: "budget_blocked",
          phase: stage,
          error: errorCode(error),
          snapshot: { scriptCheck: "passed" },
        });
        return;
      }
      throw error;
    }
    await patchRun(admin, run, {
      status: "running",
      phase: stage,
      snapshot: { scriptCheck: "passed" },
      delay_seconds: 5,
    });
  } catch (error) {
    const serialized = (() => {
      try {
        return error && typeof error === "object" ? JSON.stringify(error) : "";
      } catch {
        return "";
      }
    })();
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message || "PRODUCTION_ADVANCE_FAILED")
          : typeof error === "string"
            ? error
            : serialized || String(error || "PRODUCTION_ADVANCE_FAILED");
    console.error("short-film production advance failed", {
      runId: run.id,
      phase: run.phase,
      message,
      error: serialized || String(error || ""),
    });
    // Đây là nỗ lực DUY NHẤT đánh dấu lượt cần xem lại. Nếu nó cũng hỏng (lease
    // đã mất), lượt trở thành mồ côi và chỉ người vận hành gỡ được — nuốt im
    // lặng thì không ai biết mà gỡ.
    await patchRun(admin, run, {
      status: "needs_review",
      phase: run.phase,
      error: message.slice(0, 1000),
    }).catch((parkError) => {
      console.error("short-film production run left orphaned", {
        runId: run.id,
        phase: run.phase,
        originalMessage: message,
        parkMessage:
          parkError instanceof Error ? parkError.message : String(parkError),
      });
    });
  } finally {
    clearInterval(timer);
  }
}
