import { describe, expect, it } from "vitest";
import {
  attentionFor,
  episodeSummaries,
  latestFilm,
  runHeadline,
  runStep,
  shortTitle,
  type StudioRun,
  type StudioTask,
} from "./studio";

const run = (overrides: Partial<StudioRun> = {}): StudioRun => ({
  id: "run",
  plan_id: "plan",
  intent: "Cát bay vào mắt",
  status: "running",
  phase: "video",
  points_committed: 272,
  max_points_per_film: 1000,
  max_points_per_day: 10000,
  error: null,
  snapshot: null,
  created_at: "2026-09-17T08:45:00Z",
  updated_at: "2026-09-17T08:51:00Z",
  ...overrides,
});

const task = (overrides: Partial<StudioTask> = {}): StudioTask => ({
  id: "task",
  kind: "image",
  scene_id: "scene-3",
  status: "completed",
  error: null,
  approved_at: null,
  production_run_id: "run",
  url: "https://media/image.png",
  created_at: "2026-09-17T08:48:00Z",
  ...overrides,
});

const scenes = [
  { id: "scene-1", scene_index: 0, dialogue: "", action: "" },
  { id: "scene-3", scene_index: 2, dialogue: "", action: "" },
];

describe("studio progress", () => {
  it("maps technical phases onto the few steps a user sees", () => {
    expect(runStep(run({ phase: "script_check" }))).toBe(0);
    expect(runStep(run({ phase: "image_check" }))).toBe(1);
    expect(runStep(run({ phase: "clip_check" }))).toBe(2);
    expect(runStep(run({ phase: "render" }))).toBe(3);
    expect(runStep(run({ status: "completed", phase: "ready_review" }))).toBe(4);
    expect(runHeadline(run())).toBe("AI đang quay các cảnh");
  });
});

describe("attention", () => {
  it("points at the exact failed result with the automatic check's reasons", () => {
    const attention = attentionFor(
      run({ status: "needs_review", phase: "image_check", snapshot: { failedTaskId: "task" }, error: "Công đoạn ảnh tham chiếu cần xem lại." }),
      [task()],
      [{ task_id: "task", status: "failed", evidence: { issues: ["Ảnh bị nhân đôi nhân vật (có 2 người Bố)"] } }],
      scenes,
    );
    expect(attention).toMatchObject({
      kind: "task",
      what: "Ảnh của cảnh",
      sceneNumber: 3,
      issues: ["Ảnh bị nhân đôi nhân vật (có 2 người Bố)"],
    });
  });

  it("offers a larger limit when the episode hits its budget", () => {
    expect(attentionFor(run({ status: "budget_blocked", points_committed: 980 }), [], [], [])).toEqual({
      kind: "budget",
      used: 980,
      limit: 1000,
      suggested: 1500,
    });
  });

  it("surfaces script review issues and falls back to the run error", () => {
    expect(
      attentionFor(run({ status: "needs_review", phase: "script_check", error: "Câu kết giống bài học" }), [], [], []),
    ).toEqual({ kind: "script", issues: ["Câu kết giống bài học"], summary: undefined });
    expect(attentionFor(run(), [], [], [])).toEqual({ kind: "none" });
  });
});

describe("episode list", () => {
  it("shows a run still writing its script as its own episode and uses each plan's latest run", () => {
    const list = episodeSummaries(
      [
        { id: "plan", title: "Cát bay vào mắt", updated_at: "2026-09-16T00:00:00Z" },
        { id: "old", title: "Con nhà người ta", updated_at: "2026-09-15T00:00:00Z", has_video: true },
      ],
      [
        run({ id: "r1", status: "cancelled", created_at: "2026-09-17T08:00:00Z" }),
        run({ id: "r2", status: "needs_review", created_at: "2026-09-17T08:45:00Z" }),
        run({ id: "writing", plan_id: null, status: "scripting", intent: "Hai bé làm bản tin thời sự về chiếc bát vỡ của Bố trong bếp tối nay", updated_at: "2026-09-17T09:00:00Z" }),
      ],
    );
    expect(list.map((e) => [e.title, e.status, e.runId])).toEqual([
      ["Hai bé làm bản tin thời sự về chiếc bát vỡ của…", "working", "writing"],
      ["Cát bay vào mắt", "attention", "r2"],
      ["Con nhà người ta", "ready", null],
    ]);
  });

  it("prefers the approved film and trims long titles", () => {
    const film = latestFilm([
      task({ id: "new", kind: "render", created_at: "2026-09-17T10:00:00Z" }),
      task({ id: "approved", kind: "render", approved_at: "2026-09-17T09:00:00Z", created_at: "2026-09-17T09:00:00Z" }),
    ]);
    expect(film?.id).toBe("approved");
    expect(shortTitle("  một   ý tưởng  ")).toBe("một ý tưởng");
  });
});
