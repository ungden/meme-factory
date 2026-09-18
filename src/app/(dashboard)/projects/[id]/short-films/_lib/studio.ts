/**
 * Logic thuần của màn "Tạo phim": gom trạng thái lượt sản xuất, task và kết quả
 * kiểm tra tự động thành những gì người dùng cuối cần biết — đang ở bước nào,
 * có việc gì cần họ quyết định, và kết quả cuối ở đâu. Không chứa JSX để test.
 */
import {
  SEEDANCE_20_FAST_TEXT_MODEL,
  SEEDANCE_25_TEXT_MODEL,
} from "@/lib/video-models";

export type StudioRun = {
  id: string;
  plan_id: string | null;
  intent: string | null;
  status: string;
  phase: string;
  points_committed: number;
  max_points_per_film: number;
  max_points_per_day: number;
  error: string | null;
  snapshot?: {
    failedTaskId?: string;
    scriptCheck?: string;
    scriptEvidence?: { summary?: string; issues?: string[] };
    outputId?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export type StudioTask = {
  id: string;
  kind: string;
  scene_id: string | null;
  status: string;
  error: string | null;
  approved_at: string | null;
  auto_accepted_at?: string | null;
  production_run_id?: string | null;
  url?: string;
  posterUrl?: string;
  srtUrl?: string;
  input?: { dialogue?: string; referencePurpose?: string };
  created_at: string;
};

export type StudioCheck = {
  task_id: string | null;
  status: string;
  evidence?: { issues?: string[]; summary?: string } | null;
};

export type StudioScene = {
  id: string;
  scene_index: number;
  dialogue: string;
  action: string;
};

/** Các bước người dùng nhìn thấy; mỗi phase kỹ thuật thuộc đúng một bước. */
export const STUDIO_STEPS = [
  { key: "script", label: "Viết kịch bản" },
  { key: "prepare", label: "Chuẩn bị hình và giọng" },
  { key: "video", label: "Quay các cảnh" },
  { key: "finish", label: "Lồng tiếng và ghép phim" },
  { key: "done", label: "Phim đã xong" },
] as const;

const PHASE_STEP: Record<string, number> = {
  script: 0,
  script_check: 0,
  prepare: 1,
  image_check: 1,
  tts_check: 1,
  voice_design_check: 1,
  frame: 2,
  frame_check: 2,
  video: 2,
  video_check: 2,
  lip_sync_check: 2,
  clip_check: 2,
  finish: 3,
  dub_check: 3,
  transcript: 3,
  transcribe_check: 3,
  render: 3,
  render_check: 3,
  ready_review: 4,
};

export function runStep(run: Pick<StudioRun, "phase" | "status">) {
  if (run.status === "completed") return STUDIO_STEPS.length - 1;
  return PHASE_STEP[run.phase] ?? 0;
}

export const ACTIVE_STATUSES = ["queued", "scripting", "running"];

export function runIsActive(run: Pick<StudioRun, "status"> | null | undefined) {
  return Boolean(run && ACTIVE_STATUSES.includes(run.status));
}

/** Lời ngắn cho trạng thái lượt, viết cho người không biết pipeline. */
export function runHeadline(run: StudioRun) {
  switch (run.status) {
    case "queued":
      return "Đã nhận yêu cầu, sắp bắt đầu";
    case "scripting":
    case "running":
      return `AI đang ${STUDIO_STEPS[runStep(run)].label.toLowerCase()}`;
    case "paused":
      return "Đã tạm dừng";
    case "budget_blocked":
      return "Đã chạm giới hạn điểm của tập";
    case "needs_review":
      return "Cần bạn quyết định một việc";
    case "completed":
      return "Phim đã xong, mời bạn xem";
    case "cancelled":
      return "Đã hủy tập này";
    default:
      return "Có lỗi khi làm phim";
  }
}

export type Attention =
  | { kind: "none" }
  | { kind: "budget"; used: number; limit: number; suggested: number }
  | { kind: "script"; issues: string[]; summary?: string }
  | {
      kind: "task";
      task: StudioTask;
      what: string;
      sceneNumber: number | null;
      issues: string[];
    }
  | { kind: "generic"; message: string };

const TASK_NOUN: Record<string, string> = {
  image: "Ảnh của cảnh",
  frame: "Khung hình nối cảnh",
  tts: "Giọng đọc",
  voice_design: "Giọng nhân vật",
  video: "Đoạn phim",
  lip_sync: "Đoạn phim",
  dub: "Đoạn phim đã lồng tiếng",
  transcribe: "Lời thoại",
  render: "Bản phim ghép",
};

export function taskNoun(kind: string) {
  return TASK_NOUN[kind] || "Một phần của phim";
}

/**
 * Đổi lỗi kỹ thuật thành một câu người dùng đọc được.
 *
 * `task.error` được ghi thẳng từ thông báo của ngoại lệ, nên nó có thể là tiếng
 * Anh của thư viện mạng — lượt chạy 19/09 dừng với đúng chữ "This operation was
 * aborted". Chủ fanpage đọc dòng này trong màn hình theo dõi; một câu tiếng Anh
 * ở đó vừa vô nghĩa vừa không nói được họ nên làm gì. Thông báo do hệ thống tự
 * viết (đã là tiếng Việt) thì giữ nguyên.
 */
export function readableFailure(message: string | null | undefined): string {
  const text = String(message || "").trim();
  if (!text) return "Bước này không xong. Bấm tạo lại để thử lần nữa.";
  // Có dấu tiếng Việt nghĩa là thông báo của chính hệ thống, đã viết cho người đọc.
  if (/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(text))
    return text;
  if (/abort|timeout|timed out|ETIMEDOUT|ECONNRESET|socket|network|fetch failed/iu.test(text))
    return "Lần gọi này quá lâu nên bị ngắt giữa chừng. Bấm tạo lại để thử lần nữa.";
  if (/\b(429|rate limit|quota|too many requests)\b/iu.test(text))
    return "Bên tạo media đang quá tải. Chờ một lát rồi bấm tạo lại.";
  if (/\b(401|403|unauthorized|forbidden|api key)\b/iu.test(text))
    return "Kết nối tới bên tạo media bị từ chối. Báo cho đội hỗ trợ giúp mình.";
  if (/\b(5\d\d|internal server error|bad gateway|service unavailable)\b/iu.test(text))
    return "Bên tạo media đang gặp sự cố. Chờ một lát rồi bấm tạo lại.";
  return "Bước này không xong. Bấm tạo lại để thử lần nữa.";
}

/**
 * Việc cần người dùng quyết định. Trước đây màn chỉ hiện "Công đoạn X cần xem
 * lại" mà không chỉ ra kết quả nào và vì sao; ở đây trả đúng task, lý do và
 * cảnh để giao diện đặt media cạnh hai lựa chọn "Dùng bản này" / "Tạo lại".
 */
export function attentionFor(
  run: StudioRun,
  tasks: StudioTask[],
  checks: StudioCheck[],
  scenes: StudioScene[],
): Attention {
  if (run.status === "budget_blocked") {
    const limit = run.max_points_per_film;
    return {
      kind: "budget",
      used: run.points_committed,
      limit,
      suggested: Math.ceil((Math.max(limit, run.points_committed) * 1.5) / 50) * 50,
    };
  }
  if (run.status !== "needs_review") return { kind: "none" };
  if (run.phase === "script_check" || run.snapshot?.scriptCheck === "needs_review") {
    return {
      kind: "script",
      issues: run.snapshot?.scriptEvidence?.issues?.length
        ? run.snapshot.scriptEvidence.issues
        : run.error
          ? [run.error]
          : [],
      summary: run.snapshot?.scriptEvidence?.summary,
    };
  }
  const failedId = run.snapshot?.failedTaskId;
  const task =
    (failedId && tasks.find((t) => t.id === failedId)) ||
    tasks.find((t) => t.production_run_id === run.id && t.status === "failed");
  if (task) {
    const check = checks.find((c) => c.task_id === task.id);
    const scene = scenes.find((s) => s.id === task.scene_id);
    return {
      kind: "task",
      task,
      what: taskNoun(task.kind),
      sceneNumber: scene ? scene.scene_index + 1 : null,
      issues: check?.evidence?.issues?.length
        ? check.evidence.issues
        : task.error
          ? [readableFailure(task.error)]
          : run.error
            ? [run.error]
            : [],
    };
  }
  return {
    kind: "generic",
    message: run.error || "AI cần bạn kiểm tra trước khi làm tiếp.",
  };
}

/** Lý do tạo lại hay gặp, để người dùng bấm thay vì phải tự gõ. */
export const REGENERATE_REASONS = [
  "Nhân vật sai mặt hoặc sai tuổi",
  "Thừa hoặc thiếu người",
  "Tay, chân bị biến dạng",
  "Trang phục, giày dép không khớp cảnh trước",
  "Hành động không đúng kịch bản",
  "Giọng đọc không hợp nhân vật",
];

export const QUALITY_OPTIONS = [
  {
    id: "saving",
    label: "Tiết kiệm",
    description: "Đẹp, nhanh, phù hợp đăng hằng ngày",
    model: SEEDANCE_20_FAST_TEXT_MODEL,
    // Đo từ lượt thật: tập 17 giây trên Seedance 2.0 Fast hết 274 điểm, tập 37
    // giây trên Seedance 2.5 hết 1.224 điểm. Giới hạn mặc định chừa chỗ tạo lại.
    estimatedPoints: 500,
    defaultLimit: 800,
  },
  {
    id: "quality",
    label: "Chất lượng cao",
    description: "Chuyển động mượt hơn, giá gần gấp đôi",
    model: SEEDANCE_25_TEXT_MODEL,
    estimatedPoints: 1200,
    defaultLimit: 1800,
  },
] as const;

export type QualityId = (typeof QUALITY_OPTIONS)[number]["id"];

export function qualityOption(id: QualityId) {
  return QUALITY_OPTIONS.find((option) => option.id === id)!;
}

export type EpisodeSummary = {
  key: string;
  planId: string | null;
  runId: string | null;
  title: string;
  status: "draft" | "working" | "attention" | "ready" | "stopped";
  updatedAt: string;
};

export const EPISODE_STATUS_LABEL: Record<EpisodeSummary["status"], string> = {
  draft: "Bản nháp",
  working: "Đang làm",
  attention: "Cần bạn xem",
  ready: "Đã có phim",
  stopped: "Đã dừng",
};

type PlanLike = {
  id: string;
  title: string;
  updated_at?: string;
  has_video?: boolean;
  latest_content_output_id?: string | null;
  video_output_count?: number;
  video_status?: string;
};

/**
 * Một tập = một kịch bản, hoặc một lượt còn đang viết kịch bản (chưa có plan).
 * Lượt mới nhất của mỗi kịch bản quyết định trạng thái hiển thị.
 */
export function episodeSummaries(plans: PlanLike[], runs: StudioRun[]): EpisodeSummary[] {
  const latestRun = new Map<string, StudioRun>();
  for (const run of [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    if (run.plan_id) latestRun.set(run.plan_id, run);
  const statusOf = (run: StudioRun | undefined, plan?: PlanLike): EpisodeSummary["status"] => {
    if (run && runIsActive(run)) return "working";
    if (run && ["needs_review", "budget_blocked", "paused"].includes(run.status))
      return "attention";
    if (
      plan?.has_video ||
      plan?.latest_content_output_id ||
      plan?.video_output_count ||
      run?.status === "completed"
    )
      return "ready";
    if (run && ["failed", "cancelled"].includes(run.status)) return "stopped";
    return "draft";
  };
  const fromPlans = plans.map((plan) => {
    const run = latestRun.get(plan.id);
    return {
      key: plan.id,
      planId: plan.id,
      runId: run?.id || null,
      title: plan.title,
      status: statusOf(run, plan),
      updatedAt: [plan.updated_at || "", run?.updated_at || ""].sort().at(-1) || "",
    };
  });
  const writing = runs
    .filter((run) => !run.plan_id && runIsActive(run))
    .map((run) => ({
      key: run.id,
      planId: null,
      runId: run.id,
      title: shortTitle(run.intent) || "Tập mới",
      status: statusOf(run),
      updatedAt: run.updated_at,
    }));
  return [...writing, ...fromPlans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function shortTitle(intent: string | null | undefined, max = 48) {
  const text = String(intent || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Bản phim ghép mới nhất của kịch bản (ưu tiên bản đã duyệt). */
export function latestFilm(tasks: StudioTask[]) {
  return [...tasks]
    .filter((t) => t.kind === "render" && t.status === "completed" && t.url)
    .sort(
      (a, b) =>
        Number(Boolean(b.approved_at)) - Number(Boolean(a.approved_at)) ||
        b.created_at.localeCompare(a.created_at),
    )[0];
}
