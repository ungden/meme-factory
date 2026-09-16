import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilmPlan } from "@/lib/short-film/contracts";
import {
  api,
  blank,
  displayPhase,
  episodeHasHistory,
  episodePickerStatus,
  fromPlan,
  statusLabels,
} from "./draft";

const plan = (overrides: Partial<FilmPlan> = {}) =>
  ({
    id: "plan-1",
    title: "Tập 1",
    brief: "",
    caption: "",
    format: "16:9",
    resolution: "720p",
    audio_mode: "dubbed",
    subtitles: true,
    status: "draft",
    target_duration_seconds: 30,
    cast_snapshot: [],
    video_plan_scenes: [],
    ...overrides,
  }) as unknown as FilmPlan;

describe("episodePickerStatus", () => {
  it.each([
    ["has_video", { has_video: true }],
    ["a linked output", { latest_content_output_id: "output-1" }],
    ["a non-zero output count", { video_output_count: 2 }],
    ["an explicit ready status", { video_status: "ready" as const }],
  ])("reports ready from %s", (_label, overrides) => {
    expect(episodePickerStatus(plan(overrides))).toBe("ready");
  });

  it.each([
    ["a failed video", { video_status: "failed" as const }],
    ["a failed plan", { status: "failed" }],
    ["a cancelled plan", { status: "cancelled" }],
  ])("reports failed from %s", (_label, overrides) => {
    expect(episodePickerStatus(plan(overrides))).toBe("failed");
  });

  it.each(["queued", "scripting", "running", "paused"])(
    "reports running while the plan is %s",
    (status) => {
      expect(episodePickerStatus(plan({ status }))).toBe("running");
    },
  );

  it("reports draft for an untouched plan", () => {
    expect(episodePickerStatus(plan())).toBe("draft");
  });

  // A finished episode that later failed a re-run should still read as ready:
  // the user does have a watchable film.
  it("prefers ready over failed when both signals are present", () => {
    expect(
      episodePickerStatus(plan({ has_video: true, status: "failed" })),
    ).toBe("ready");
  });
});

describe("episodeHasHistory", () => {
  it("is false for a plan that has never been produced", () => {
    expect(episodeHasHistory(plan())).toBe(false);
  });

  it.each([
    ["production history", { has_production_history: true }],
    ["a video", { has_video: true }],
    ["a linked output", { latest_content_output_id: "output-1" }],
  ])("is true with %s", (_label, overrides) => {
    expect(episodeHasHistory(plan(overrides))).toBe(true);
  });
});

describe("displayPhase", () => {
  it("names each pipeline phase in Vietnamese", () => {
    expect(displayPhase("prepare")).toBe("Chuẩn bị hình và tiếng");
    expect(displayPhase("render")).toBe("Ghép phim");
  });

  // Deriving "Kiểm tra " + label produced "Kiểm tra kiểm tra lời" for
  // transcribe_check, because that label is already a verb phrase.
  it("never doubles the word kiểm tra", () => {
    for (const phase of [
      "script_check", "image_check", "tts_check", "video_check",
      "dub_check", "lip_sync_check", "transcribe_check", "render_check",
    ]) {
      const label = displayPhase(phase);
      expect(label, phase).not.toMatch(/kiểm tra.*kiểm tra/i);
      expect(label, phase).not.toBe("Đang hoàn thiện");
    }
  });

  it("falls back to a neutral phrase for an unknown phase", () => {
    expect(displayPhase("brand_new_phase")).toBe("Đang hoàn thiện");
  });
});

describe("statusLabels", () => {
  // Without this entry the run header said "Đang xử lý" while the task card
  // for the same state said "Đang đối soát".
  it("covers reconciling", () => {
    expect(statusLabels.reconciling).toBe("Đang đối soát");
  });

  it("covers every run status the pipeline can set", () => {
    for (const status of [
      "queued", "scripting", "running", "paused", "budget_blocked",
      "needs_review", "completed", "failed", "cancelled", "reconciling",
    ])
      expect(statusLabels[status], status).toBeTruthy();
  });
});

describe("fromPlan", () => {
  it("rewrites a native-audio plan as dubbed for editing", () => {
    // The studio only edits dubbed plans; native is a legacy read-only mode.
    expect(fromPlan(plan({ audio_mode: "native" })).audioMode).toBe("dubbed");
  });

  it("keeps trim speech on unless the plan explicitly disabled it", () => {
    expect(fromPlan(plan()).trimSpeech).toBe(true);
    expect(fromPlan(plan({ trim_speech: false })).trimSpeech).toBe(false);
  });

  it("lifts only guest cast members into the editable guest list", () => {
    const draft = fromPlan(
      plan({
        cast_snapshot: [
          { characterId: "char-a", name: "Bánh Bao", description: "" },
          {
            characterId: "guest-uuid",
            guestKey: "guest-1",
            isGuest: true,
            name: "Chú phi công",
            description: "đồng phục xanh",
          },
        ],
      } as Partial<FilmPlan>),
    );
    expect(draft.guests).toEqual([
      { key: "guest-1", name: "Chú phi công", description: "đồng phục xanh" },
    ]);
  });

  it("falls back to a sane duration when the plan has none", () => {
    expect(fromPlan(plan({ target_duration_seconds: 0 })).targetDurationSeconds)
      .toBe(30);
  });
});

describe("blank", () => {
  it("starts a new episode as an editable dubbed draft", () => {
    const draft = blank();
    expect(draft.audioMode).toBe("dubbed");
    expect(draft.scenes).toEqual([]);
    expect(draft.guests).toEqual([]);
  });

  it("returns a fresh object each time", () => {
    const first = blank();
    first.scenes.push({} as never);
    expect(blank().scenes).toHaveLength(0);
  });
});

describe("api", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Typed so the assertions can read the init argument fetch received. */
  const spyFetch = () =>
    vi.fn(async (_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response("{}");
    });

  it("GETs when no body is supplied and never sends a content type", async () => {
    const fetchMock = spyFetch();
    globalThis.fetch = fetchMock as never;
    await api("/api/x");
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("serialises a body and aborts a hung request", async () => {
    const fetchMock = spyFetch();
    globalThis.fetch = fetchMock as never;
    await api("/api/x", { a: 1 });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.signal).toBeDefined();
  });

  it("tolerates an empty response body", async () => {
    globalThis.fetch = vi.fn(async () => new Response("")) as never;
    expect(await api("/api/x")).toEqual({});
  });

  it("surfaces the server's message on failure", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "Hết điểm." }), { status: 400 }),
    ) as never;
    await expect(api("/api/x")).rejects.toThrow("Hết điểm.");
  });

  it("keeps a reassuring default when the server says nothing", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as never;
    await expect(api("/api/x")).rejects.toThrow(/vẫn được giữ/);
  });
});
