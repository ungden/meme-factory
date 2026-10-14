import { describe, expect, it } from "vitest";
import { scheduleBody, scheduleFromApi } from "./schedule";

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
      ),
    ).toEqual({ enabled: true, filmsPerDay: 3, localTime: "07:30", maxPointsPerFilm: 900, videoModel: "model-quality" });
  });

  it("starts from the studio's choice when nothing is saved yet", () => {
    expect(scheduleFromApi(null, fallback)).toEqual({
      enabled: false,
      filmsPerDay: 1,
      localTime: "09:00",
      maxPointsPerFilm: 1500,
      videoModel: "model-fast",
    });
  });

  it("drops out-of-range values", () => {
    expect(scheduleFromApi({ films_per_day: 9, max_points_per_film: -5 }, fallback)).toMatchObject({
      filmsPerDay: 1,
      maxPointsPerFilm: 1500,
    });
  });
});

describe("scheduleBody", () => {
  it("sends every field the API needs and derives the daily cap", () => {
    expect(
      scheduleBody({ enabled: true, filmsPerDay: 2, localTime: "08:00", maxPointsPerFilm: 1000, videoModel: "m" }),
    ).toEqual({
      enabled: true,
      filmsPerDay: 2,
      localTime: "08:00",
      maxPointsPerFilm: 1000,
      maxPointsPerDay: 2000,
      videoModel: "m",
    });
  });

  it("never sends a queue, so the server keeps the one already saved", () => {
    expect(scheduleBody({ enabled: false, filmsPerDay: 1, localTime: "09:00", maxPointsPerFilm: 10, videoModel: "m" })).not.toHaveProperty(
      "queuedPlanIds",
    );
  });
});
