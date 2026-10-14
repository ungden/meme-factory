import { describe, expect, it } from "vitest";
import {
  moveInQueue,
  queueCandidates,
  scheduleBody,
  scheduleChanged,
  scheduleFromApi,
  type FilmSchedule,
} from "./schedule";
import type { EpisodeSummary } from "./studio";

const fallback = { maxPointsPerFilm: 1500, videoModel: "model-fast" };

describe("scheduleFromApi", () => {
  it("keeps what the owner saved instead of the studio's current choice", () => {
    expect(
      scheduleFromApi(
        {
          enabled: true,
          films_per_day: 3,
          local_time: "07:30:00",
          max_points_per_film: 900,
          default_config: { videoModel: "model-quality" },
        },
        fallback,
        [{ id: "p1", title: "Tập một" }],
      ),
    ).toEqual({
      enabled: true,
      filmsPerDay: 3,
      localTime: "07:30",
      maxPointsPerFilm: 900,
      videoModel: "model-quality",
      queue: [{ id: "p1", title: "Tập một" }],
    });
  });

  it("starts from the studio's choice when nothing is saved yet", () => {
    expect(scheduleFromApi(null, fallback)).toEqual({
      enabled: false,
      filmsPerDay: 1,
      localTime: "09:00",
      maxPointsPerFilm: 1500,
      videoModel: "model-fast",
      queue: [],
    });
  });

  it("drops out-of-range values", () => {
    expect(scheduleFromApi({ films_per_day: 9, max_points_per_film: -5 }, fallback)).toMatchObject({
      filmsPerDay: 1,
      maxPointsPerFilm: 1500,
    });
  });
});

const base: FilmSchedule = {
  enabled: true,
  filmsPerDay: 2,
  localTime: "08:00",
  maxPointsPerFilm: 1000,
  videoModel: "m",
  queue: [
    { id: "p1", title: "Một" },
    { id: "p2", title: "Hai" },
  ],
};

describe("scheduleBody", () => {
  it("sends every field the API needs, queue included, and derives the daily cap", () => {
    expect(scheduleBody(base)).toEqual({
      enabled: true,
      filmsPerDay: 2,
      localTime: "08:00",
      maxPointsPerFilm: 1000,
      maxPointsPerDay: 2000,
      videoModel: "m",
      queuedPlanIds: ["p1", "p2"],
    });
  });

  it("sends an empty queue when the owner removed every episode", () => {
    expect(scheduleBody({ ...base, queue: [] }).queuedPlanIds).toEqual([]);
  });
});

describe("scheduleChanged", () => {
  it("is false for an untouched draft", () => {
    expect(scheduleChanged({ ...base, queue: [...base.queue] }, base)).toBe(false);
  });

  it("notices a reordered or shortened queue", () => {
    expect(scheduleChanged({ ...base, queue: [base.queue[1], base.queue[0]] }, base)).toBe(true);
    expect(scheduleChanged({ ...base, queue: [base.queue[0]] }, base)).toBe(true);
  });

  it("notices a changed setting", () => {
    expect(scheduleChanged({ ...base, localTime: "09:00" }, base)).toBe(true);
  });
});

describe("queueCandidates", () => {
  const episode = (planId: string | null, status: EpisodeSummary["status"], title = planId || "x"): EpisodeSummary => ({
    key: planId || "run",
    planId,
    runId: null,
    title,
    status,
    updatedAt: "",
  });

  it("offers episodes with a script that have not become a film yet", () => {
    expect(
      queueCandidates(
        [
          episode("a", "draft", "Bản nháp"),
          episode("b", "stopped", "Đã dừng"),
          episode("c", "ready"),
          episode("d", "working"),
          episode("e", "attention"),
          episode(null, "working"),
        ],
        [],
      ),
    ).toEqual([
      { id: "a", title: "Bản nháp" },
      { id: "b", title: "Đã dừng" },
    ]);
  });

  it("hides episodes already queued", () => {
    expect(queueCandidates([episode("a", "draft"), episode("b", "draft")], [{ id: "a", title: "a" }])).toEqual([
      { id: "b", title: "b" },
    ]);
  });
});

describe("moveInQueue", () => {
  it("swaps with the neighbour", () => {
    expect(moveInQueue(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveInQueue(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("does nothing past either end", () => {
    const queue = ["a", "b"];
    expect(moveInQueue(queue, 0, -1)).toBe(queue);
    expect(moveInQueue(queue, 1, 1)).toBe(queue);
  });
});
