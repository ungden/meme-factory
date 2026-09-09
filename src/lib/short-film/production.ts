import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateCreativeAssist,
  type CreativeContext,
} from "../creative-assist";
import {
  compactStory,
  type ChannelProfile,
  type Story,
} from "../family-catalogue";
import {
  checkProductionScript,
  checkTechnicalTask,
  checkVisualTask,
} from "./automatic-qa";
import { currentSceneTask, type FilmPlan, type FilmTask } from "./contracts";
import {
  quotePlan,
  readPlan,
  savePlan,
  tasksForPlan,
  type Access,
} from "./server";

type Run = {
  id: string;
  project_id: string;
  workspace_version: number;
  plan_id: string | null;
  plan_version: number | null;
  source: "manual" | "scheduled";
  intent: string;
  status: string;
  phase: string;
  snapshot: Record<string, unknown>;
  input_snapshot?: Record<string, unknown>;
  created_by: string;
  lease_owner: string;
};

function frozenPlan(run: Run): FilmPlan | null {
  const value = run.input_snapshot?.plan;
  if (!value || typeof value !== "object") return null;
  const plan = value as FilmPlan;
  return plan.id === run.plan_id && plan.version === run.plan_version ? plan : null;
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
      "id,name,brand_voice,audience,content_guidelines,workspace_version,watermark_url,watermark_position,watermark_opacity",
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

async function createAutomaticPlan(a: Access, run: Run) {
  const { context, profile } = await creativeContext(a);
  if (!profile) throw new Error("CHANNEL_PROFILE_REQUIRED");
  const selected = profile.roles
    .map((r) => r.characterId)
    .filter((id) => context.characters.some((c) => c.id === id));
  const result = await generateCreativeAssist({
    kind: "video_plan",
    intent:
      run.intent ||
      "Tự đề xuất một chuyện gia đình mới, không lặp 20 tập gần nhất.",
    context,
    selectedCharacterIds: selected,
    targetDurationSeconds: 35,
  });
  if (result.kind !== "video_plan") throw new Error("SCRIPT_RESULT_INVALID");
  const plan = await savePlan(a, {
    title: result.title,
    brief: run.intent || result.summary,
    caption: result.caption || "",
    story: result.story,
    targetDurationSeconds: 35,
    format: "9:16",
    resolution: "720p",
    audioMode: "native",
    subtitles: true,
    scenes: result.scenes.map((s) => ({
      ...s,
      startImageUrl: null,
      endImageUrl: null,
      sourceMode: "generated",
    })),
    workspaceVersion: run.workspace_version,
  });
  return { plan, profile };
}

async function signed(admin: SupabaseClient, project: string, path: string) {
  if (!path.startsWith(`${project}/`))
    throw new Error("MEDIA_PROJECT_MISMATCH");
  const { data, error } = await admin.storage
    .from("content-media")
    .createSignedUrl(path, 600);
  if (error || !data) throw new Error("MEDIA_SIGN_FAILED");
  return data.signedUrl;
}

async function ensureTaskCheck(a: Access, run: Run, task: FilmTask) {
  if (task.approved_at || task.auto_accepted_at) return "passed";
  let check = checkTechnicalTask(task);
  if (["image", "frame", "video", "lip_sync"].includes(task.kind)) {
    const path = String(
      task.kind === "video" || task.kind === "lip_sync"
        ? task.result?.qaFramePath || ""
        : task.result?.path || "",
    );
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
      const references = await Promise.all(
        cast.map(async (c) => {
          const value = c.imageUrl || "";
          return value.startsWith(`${a.project.id}/`)
            ? signed(a.admin, a.project.id, value)
            : value;
        }),
      );
      check = await checkVisualTask(task, media, references.filter(Boolean));
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

function accepted(task?: FilmTask) {
  return !!(task?.approved_at || task?.auto_accepted_at);
}
function stageFor(plan: FilmPlan, tasks: FilmTask[]) {
  const latest = (
    s: FilmPlan["video_plan_scenes"][number],
    kind: Parameters<typeof currentSceneTask>[2],
  ) => currentSceneTask(tasks, s, kind, plan.audio_mode);
  const scenes = plan.video_plan_scenes;
  const prepared = scenes.every(
    (s) =>
      accepted(latest(s, "image")) &&
      (!s.dialogue ||
        plan.audio_mode === "native" ||
        accepted(latest(s, "tts"))),
  );
  if (!prepared) return "prepare";
  if (!scenes.every((s) => latest(s, "video"))) return "video";
  if (
    plan.audio_mode === "fixed" &&
    !scenes.every((s) => !s.dialogue || latest(s, "lip_sync"))
  )
    return "finish";
  if (!scenes.every((s) => !s.dialogue || latest(s, "transcribe")))
    return plan.audio_mode === "fixed" ? "transcript" : "finish";
  if (
    !scenes.every((s) =>
      accepted(
        latest(
          s,
          plan.audio_mode === "fixed" && s.dialogue ? "lip_sync" : "video",
        ),
      ),
    )
  )
    return "check";
  const render = tasks.find(
    (t) =>
      t.kind === "render" &&
      t.plan_version === plan.version &&
      t.status === "completed",
  );
  return render ? "completed" : "render";
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
      .catch(() => { leaseLost = true; })
      .finally(() => { heartbeating = false; });
  }, 30_000);
  const assertLease = () => {
    if (leaseLost) throw new Error("RUN_LEASE_LOST");
  };
  try {
    let plan: FilmPlan;
    let profile: ChannelProfile | null = null;
    if (!run.plan_id) {
      const made = await createAutomaticPlan(a, run);
      plan = made.plan;
      profile = made.profile;
      run.plan_id = plan.id;
      run.plan_version = plan.version;
      await patchRun(admin, run, {
        status: "running",
        phase: "script_check",
        plan_id: plan.id,
        plan_version: plan.version,
        snapshot: { generatedPlan: true },
        input_snapshot: { plan, channelProfile: made.profile },
        delay_seconds: 3,
      });
      return;
    }
    plan = frozenPlan(run) || (await readPlan(a, run.plan_id));
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
    if (plan.video_plan_scenes.some((scene) => scene.follows_previous))
      throw new Error("AUTO_CONTINUOUS_SCENE_NEEDS_REVIEW");
    if (run.snapshot?.scriptCheck !== "passed") {
      if (!profile)
        profile =
          (run.input_snapshot?.channelProfile as ChannelProfile | null) ||
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
      (task) => task.production_run_id === run.id || Boolean(task.approved_at),
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
          error: `Công đoạn ${task.kind} cần xem lại.`,
          snapshot: { scriptCheck: "passed", failedTaskId: task.id },
        });
        return;
      }
      task.auto_accepted_at = new Date().toISOString();
    }
    const stage = stageFor(plan, eligible);
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
      await patchRun(admin, run, {
        status: "completed",
        phase: "ready_review",
        snapshot: {
          scriptCheck: "passed",
          outputId: plan.latest_content_output_id,
        },
      });
      return;
    }
    assertLease();
    const quote = await quotePlan(a, plan, {
      workspaceVersion: run.workspace_version,
      expectedVersion: plan.version,
      stage,
      productionRunId: run.id,
    });
    const { error } = await admin.rpc("accept_film_quote", {
      p_quote: quote.id,
      p_actor: run.created_by,
      p_key: crypto
        .createHash("md5")
        .update(`${run.id}:${plan.id}:${plan.version}:${stage}`)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
    });
    if (error) {
      if (
        error.message.includes("BUDGET") ||
        error.message.includes("INSUFFICIENT")
      ) {
        await patchRun(admin, run, {
          status: "budget_blocked",
          phase: stage,
          error: error.message,
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
    const message =
      error instanceof Error ? error.message : "PRODUCTION_ADVANCE_FAILED";
    await patchRun(admin, run, {
      status: "needs_review",
      phase: run.phase,
      error: message.slice(0, 1000),
    }).catch(() => {});
  } finally {
    clearInterval(timer);
  }
}
