import { describe, expect, it } from "vitest";
import { autopilotLines, feedIsBusy, homeFeed } from "./home-feed";
import { parseFilmHandoff } from "./home-handoff";

const project = { id: "p1", slug: "banh-bao", name: "Bánh Bao", workspace_version: 2 };

describe("trang chính", () => {
  it("gom phim và meme, việc cần xem lên đầu, bỏ lượt của phiên bản dự án cũ", () => {
    const items = homeFeed(
      [project],
      [
        { id: "f1", project_id: "p1", workspace_version: 2, plan_id: "plan1", intent: "[AIDA_GENRE=comedy] [AIDA_FORMAT=talk_to_camera] Bé than lương", status: "completed", source: "manual", updated_at: "2026-10-09T08:00:00Z", video_plans: { title: "Lương về ba ngày" } },
        { id: "f2", project_id: "p1", workspace_version: 2, plan_id: null, intent: "", status: "needs_review", source: "scheduled", updated_at: "2026-10-09T07:00:00Z" },
        { id: "f3", project_id: "p1", workspace_version: 1, plan_id: null, intent: "cũ", status: "running", source: "manual", updated_at: "2026-10-09T09:00:00Z" },
      ],
      [
        { id: "m1", project_id: "p1", workspace_version: 2, intent: "", status: "running", source: "manual", created_at: "2026-10-09T09:30:00Z", completed_at: null },
        { id: "m2", project_id: "p1", workspace_version: 2, intent: "x", status: "completed", source: "manual", created_at: "2026-10-09T06:00:00Z", completed_at: "2026-10-09T06:01:00Z", memes: { image_url: "https://a/b.png", generated_content: { headline: "Thứ Hai" } } },
      ],
    );
    expect(items.map((item) => item.id)).toEqual(["f2", "m1", "f1", "m2"]);
    expect(items[0]).toMatchObject({ title: "Tập do AI tự nghĩ", label: "Cần bạn xem", scheduled: true, href: "/projects/banh-bao/short-films?tap=f2" });
    expect(items[2]).toMatchObject({ title: "Lương về ba ngày", format: "talk_to_camera", href: "/projects/banh-bao/short-films?tap=plan1" });
    expect(items[3]).toMatchObject({ title: "Thứ Hai", imageUrl: "https://a/b.png", status: "ready" });
    expect(feedIsBusy(items)).toBe(true);
  });

  it("meme xong mà không có ảnh tính là chưa làm được", () => {
    const [item] = homeFeed([project], [], [
      { id: "m", project_id: "p1", workspace_version: 2, intent: "", status: "completed", source: "manual", created_at: "2026-10-09T06:00:00Z", completed_at: null },
    ]);
    expect(item).toMatchObject({ status: "stopped", imageUrl: null });
  });

  it("chỉ báo lịch tự làm của kênh đang bật", () => {
    expect(
      autopilotLines(
        [project, { ...project, id: "p2" }],
        [{ project_id: "p1", workspace_version: 2, enabled: true, local_time: "09:00:00", films_per_day: 2 }],
        [
          { project_id: "p1", workspace_version: 2, enabled: true, local_time: "08:30:00", memes_per_day: 3 },
          { project_id: "p2", workspace_version: 2, enabled: false, local_time: "08:30:00", memes_per_day: 3 },
        ],
      ),
    ).toEqual({ p1: "Tự làm 2 phim, 3 meme mỗi ngày từ 08:30" });
  });
});

describe("chuyển ý tưởng sang Studio phim", () => {
  it("tự làm khi còn mới, quá 10 phút thì chỉ điền sẵn", () => {
    const raw = JSON.stringify({ idea: "Bé than lương", format: "talk_to_camera", key: "k", at: 1_000 });
    expect(parseFilmHandoff(raw, 1_000 + 60_000)).toMatchObject({ idea: "Bé than lương", format: "talk_to_camera", key: "k" });
    expect(parseFilmHandoff(raw, 1_000 + 11 * 60_000)?.key).toBe("");
    expect(parseFilmHandoff(JSON.stringify({ idea: 3 }), 0)).toBeNull();
    expect(parseFilmHandoff(null, 0)).toBeNull();
  });
});
