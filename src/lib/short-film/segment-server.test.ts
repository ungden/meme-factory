import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilmPlan, FilmTask } from "./contracts";

vi.mock("server-only", () => ({}));

const { tasksForPlan, publicTasks, modelPrice, storeQuote, signed } = vi.hoisted(
  () => ({
    tasksForPlan: vi.fn(),
    publicTasks: vi.fn(),
    modelPrice: vi.fn(),
    storeQuote: vi.fn(),
    signed: vi.fn(),
  }),
);

// FilmError, hash and task are pure; only the IO collaborators are replaced.
vi.mock("./server", async () => {
  const crypto = await import("node:crypto");
  class FilmError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  }
  return {
    FilmError,
    hash: (value: unknown) =>
      crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    task: (kind: string, input: Record<string, unknown>, points: number) => ({
      kind,
      input,
      points,
    }),
    tasksForPlan,
    publicTasks,
    modelPrice,
    storeQuote,
    signed,
  };
});

import {
  legacySegmentId,
  readFilmSegments,
  saveFilmSegment,
} from "./segment-server";

const SCENE_ID = "11111111-1111-4111-8111-111111111111";

const scene = {
  id: SCENE_ID,
  version: 2,
  scene_index: 0,
  dialogue: "Ai cắt thì người kia chọn",
  action: "giơ dao",
  camera: "trung cảnh",
  motion_prompt: "giơ dao lên",
  setting: "bàn ăn",
  duration_seconds: 6,
  speaker_character_id: "char-a",
  cast_snapshot: [
    {
      characterId: "char-a",
      name: "Bánh Bao",
      description: "",
      personality: "",
      imageUrl: "",
      referenceImages: [],
      voice: { id: "voice-v1", voice_id: "Leda", model: "m", settings: {} },
    },
  ],
  media_links: {},
  deleted_at: null,
} as unknown as FilmPlan["video_plan_scenes"][number];

const plan = {
  id: "plan-1",
  version: 4,
  format: "16:9",
  resolution: "720p",
  audio_mode: "dubbed",
  subtitles: true,
  video_model: "bytedance/seedance-2.5/text-to-video",
  video_plan_scenes: [scene],
} as unknown as FilmPlan;

const sourceTask = {
  id: "task-video",
  kind: "dub",
  scene_id: SCENE_ID,
  scene_version: 2,
  status: "completed",
  plan_version: 4,
  input: {},
  result: { duration: 6, path: "project-1/films/x.mp4" },
  error: null,
  approved_at: "2026-09-12T00:00:00Z",
  created_at: "2026-09-12T00:00:00Z",
} as unknown as FilmTask;

const rpc = vi.fn();

/** Admin double serving the two tables readFilmSegments reads. */
function admin(rows: unknown[] = [], revisions: unknown[] = []) {
  return {
    rpc,
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () =>
          Promise.resolve({
            data: table === "short_film_segments" ? rows : revisions,
            error: null,
          }),
        then: undefined,
      };
      // The segments query ends on .eq(), the revisions query on .in().
      (builder as { eq: () => unknown }).eq = () =>
        table === "short_film_segments"
          ? Object.assign(Promise.resolve({ data: rows, error: null }), builder)
          : builder;
      return builder;
    },
  };
}

function access(rows: unknown[] = [], revisions: unknown[] = []) {
  return {
    project: { id: "project-1", workspace_version: 3 },
    user: { id: "user-1" },
    admin: admin(rows, revisions),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  tasksForPlan.mockResolvedValue([sourceTask]);
  publicTasks.mockImplementation(async (_a: unknown, tasks: FilmTask[]) => tasks);
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("legacySegmentId", () => {
  it("is a stable v5-shaped uuid for a scene and position", () => {
    const id = legacySegmentId(SCENE_ID, 0);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(legacySegmentId(SCENE_ID, 0)).toBe(id);
  });

  it("changes with the position but not with the dialogue", () => {
    expect(legacySegmentId(SCENE_ID, 1)).not.toBe(legacySegmentId(SCENE_ID, 0));
  });
});

describe("readFilmSegments", () => {
  it("derives one editable segment per beat, with the scene's source clip", async () => {
    const segments = await readFilmSegments(access(), plan);
    expect(segments).toHaveLength(1);
    expect(segments[0].segmentId).toBe(legacySegmentId(SCENE_ID, 0));
    expect(segments[0].sceneId).toBe(SCENE_ID);
    expect(segments[0].dialogue).toBe("Ai cắt thì người kia chọn");
  });
});

describe("saveFilmSegment validation", () => {
  const segmentId = legacySegmentId(SCENE_ID, 0);

  function patch(overrides: Record<string, unknown> = {}) {
    return {
      expectedRevision: 1,
      revision: {
        dialogue: "Ai cắt thì người kia chọn",
        speakerCharacterId: "char-a",
        voiceProfileVersion: "voice-v1",
        inSeconds: 0,
        outSeconds: 5,
        ...overrides,
      },
    };
  }

  it("refuses an unknown segment", async () => {
    await expect(
      saveFilmSegment(access(), plan, "not-a-segment", patch()),
    ).rejects.toThrow(/Không tìm thấy đoạn/);
  });

  it.each([
    ["a non-integer expected revision", { expectedRevision: 1.5 }],
    ["a negative expected revision", { expectedRevision: -1 }],
  ])("refuses %s", async (_label, override) => {
    await expect(
      saveFilmSegment(access(), plan, segmentId, { ...patch(), ...override }),
    ).rejects.toThrow(/Phiên bản đoạn/);
  });

  it("refuses a missing revision body", async () => {
    await expect(
      saveFilmSegment(access(), plan, segmentId, { expectedRevision: 1 }),
    ).rejects.toThrow(/Nội dung đoạn/);
  });

  it("refuses dialogue attributed to someone outside the scene cast", async () => {
    await expect(
      saveFilmSegment(
        access(),
        plan,
        segmentId,
        patch({ speakerCharacterId: "stranger" }),
      ),
    ).rejects.toThrow(/không thuộc cast/);
  });

  // The voice version is frozen with the script; letting an edit swap it would
  // put a different voice on an already-approved character.
  it("refuses an edit that changes the locked voice version", async () => {
    await expect(
      saveFilmSegment(
        access(),
        plan,
        segmentId,
        patch({ voiceProfileVersion: "voice-v2" }),
      ),
    ).rejects.toThrow(/đã được khóa/);
  });

  it.each([
    ["out before in", { inSeconds: 4, outSeconds: 2 }],
    ["a zero-length range", { inSeconds: 2, outSeconds: 2 }],
    ["a negative in point", { inSeconds: -1, outSeconds: 3 }],
    ["a non-numeric range", { inSeconds: "x", outSeconds: 3 }],
  ])("refuses %s", async (_label, override) => {
    await expect(
      saveFilmSegment(access(), plan, segmentId, patch(override)),
    ).rejects.toThrow(/Điểm vào\/ra/);
  });

  it("refuses a cut that runs past the source clip", async () => {
    await expect(
      saveFilmSegment(
        access(),
        plan,
        segmentId,
        patch({ sourceTaskId: "task-video", outSeconds: 9 }),
      ),
    ).rejects.toThrow(/không còn hợp lệ/);
  });

  it("refuses a source task that is not a clip", async () => {
    tasksForPlan.mockResolvedValue([{ ...sourceTask, kind: "image" }]);
    await expect(
      saveFilmSegment(
        access(),
        plan,
        segmentId,
        patch({ sourceTaskId: "task-video" }),
      ),
    ).rejects.toThrow(/không còn hợp lệ/);
  });

  it("saves a valid edit through the guarded RPC with an input hash", async () => {
    await saveFilmSegment(access(), plan, segmentId, patch());
    expect(rpc).toHaveBeenCalledWith(
      "save_film_segment_revision",
      expect.objectContaining({
        p_plan: "plan-1",
        p_plan_version: 4,
        p_segment: segmentId,
        p_expected_revision: 1,
      }),
    );
    const args = rpc.mock.calls[0][1] as { p_revision: { inputHash?: string } };
    expect(args.p_revision.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps an RPC conflict to 409 rather than a generic failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "SEGMENT_VERSION_CONFLICT" } });
    await expect(
      saveFilmSegment(access(), plan, segmentId, patch()),
    ).rejects.toMatchObject({ status: 409 });
  });
});
