import { describe, expect, it } from "vitest";
import {
  buildNotifications,
  filmBudgetCause,
  memeFailureCause,
  timeAgo,
  type NotificationMemeRun,
} from "./notifications";

const projects = {
  "p1": { slug: "foxy-coffee", name: "Foxy Coffee" },
  "p2": { slug: null, name: "Không slug" },
};

describe("buildNotifications", () => {
  it("phân biệt chờ quyết định với chạm hạn mức", () => {
    const items = buildNotifications({
      projects,
      films: [],
      runs: [
        { id: "r1", project_id: "p1", status: "needs_review", phase: "script_check", error: "Cảnh 3 thiếu hook", updated_at: "2026-09-18T10:00:00.000Z" },
        { id: "r2", project_id: "p1", status: "budget_blocked", phase: "video", error: null, updated_at: "2026-09-18T09:00:00.000Z" },
      ],
    });
    expect(items.map((item) => item.kind)).toEqual(["decision", "budget"]);
    expect(items[0].detail).toBe("Foxy Coffee — Cảnh 3 thiếu hook");
    expect(items[0].href).toBe("/projects/foxy-coffee/short-films?tap=r1");
  });

  it("dùng id dự án khi chưa có slug", () => {
    const items = buildNotifications({
      projects,
      films: [{ id: "f1", project_id: "p2", created_at: "2026-09-18T10:00:00.000Z" }],
      runs: [],
    });
    expect(items[0].href).toBe("/projects/p2/short-films");
    expect(items[0].kind).toBe("ready");
  });

  it("bỏ qua dự án không còn truy cập được", () => {
    expect(
      buildNotifications({
        projects,
        films: [{ id: "f1", project_id: "đã-xoá", created_at: "2026-09-18T10:00:00.000Z" }],
        runs: [{ id: "r1", project_id: "đã-xoá", status: "needs_review", phase: null, error: null, updated_at: "2026-09-18T10:00:00.000Z" }],
      }),
    ).toEqual([]);
  });

  it("mới nhất lên trước và cắt câu lỗi dài", () => {
    const items = buildNotifications({
      projects,
      films: [{ id: "f1", project_id: "p1", created_at: "2026-09-18T12:00:00.000Z" }],
      runs: [
        { id: "r1", project_id: "p1", status: "needs_review", phase: null, error: "Cảnh mở đầu chưa đủ hấp dẫn ".repeat(10), updated_at: "2026-09-18T11:00:00.000Z" },
      ],
    });
    expect(items[0].id).toBe("film:f1");
    expect(items[1].detail.length).toBeLessThanOrEqual(120);
    expect(items[1].detail.endsWith("…")).toBe(true);
  });

  it("giới hạn số dòng để chuông không thành một trang riêng", () => {
    const runs = Array.from({ length: 30 }, (_, index) => ({
      id: `r${index}`,
      project_id: "p1",
      status: "needs_review",
      phase: null,
      error: null,
      updated_at: `2026-09-18T10:${String(index).padStart(2, "0")}:00.000Z`,
    }));
    expect(buildNotifications({ projects, films: [], runs })).toHaveLength(20);
  });
});

describe("tập phim dừng vì điểm", () => {
  const blocked = (error: string | null) =>
    buildNotifications({
      projects,
      films: [],
      runs: [{ id: "r1", project_id: "p1", plan_id: "plan-1", status: "budget_blocked", phase: "video", error, updated_at: "2026-09-18T10:00:00.000Z" }],
    })[0];

  it("hết điểm trong ví thì bảo nạp thêm, không bảo nâng giới hạn", () => {
    const item = blocked("INSUFFICIENT_POINTS");
    expect(item.kind).toBe("points");
    expect(item.title).toBe("Hết điểm — nạp thêm để AI làm tiếp");
    expect(item.href).toBe("/wallet");
    expect(item.detail).not.toMatch(/giới hạn|hạn mức/);
  });

  it("chạm giới hạn tự đặt thì mở đúng tập để nâng giới hạn", () => {
    for (const error of ["PRODUCTION_BUDGET_EXCEEDED", "BUDGET_BELOW_COMMITTED", null]) {
      const item = blocked(error);
      expect(item.kind).toBe("budget");
      expect(item.title).toBe("Tập phim chạm giới hạn điểm bạn đặt");
      expect(item.href).toBe("/projects/foxy-coffee/short-films?tap=plan-1");
    }
  });

  it("đọc được mã dù có tiền tố của Postgres", () => {
    expect(filmBudgetCause("P0001: INSUFFICIENT_POINTS")).toBe("wallet");
    expect(filmBudgetCause("PRODUCTION_BUDGET_EXCEEDED")).toBe("cap");
  });

  it("không để lộ mã kỹ thuật trong lý do chờ quyết định", () => {
    const [item] = buildNotifications({
      projects,
      films: [],
      runs: [{ id: "r1", project_id: "p1", status: "needs_review", phase: null, error: "SOMETHING_WEIRD_HAPPENED", updated_at: "2026-09-18T10:00:00.000Z" }],
    });
    expect(item.detail).toBe("Foxy Coffee");
  });
});

describe("meme", () => {
  const now = Date.parse("2026-10-09T12:00:00.000Z");
  const meme = (over: Partial<NotificationMemeRun>): NotificationMemeRun => ({
    id: "m1",
    project_id: "p1",
    workspace_version: 1,
    status: "failed",
    source: "scheduled",
    error: null,
    created_at: "2026-10-09T10:00:00.000Z",
    completed_at: "2026-10-09T10:05:00.000Z",
    ...over,
  });
  const build = (memes: NotificationMemeRun[], extra: Partial<Parameters<typeof buildNotifications>[0]> = {}) =>
    buildNotifications({
      projects: { p1: { slug: "foxy-coffee", name: "Foxy Coffee", workspace_version: 1 } },
      runs: [],
      films: [],
      memes,
      now,
      ...extra,
    });

  it("đọc lý do hỏng ở cả câu viết sẵn lẫn mã", () => {
    expect(memeFailureCause("Không đủ điểm: mỗi meme cần 20 điểm, ví đang có 3 điểm.")).toBe("wallet");
    expect(memeFailureCause("INSUFFICIENT_POINTS")).toBe("wallet");
    expect(memeFailureCause("MEME_RUN_GAVE_UP")).toBe("gave_up");
    expect(memeFailureCause("AI chưa làm được meme này sau ba lần thử.")).toBe("gave_up");
    expect(memeFailureCause(null)).toBe("other");
  });

  it("meme hỏng vì hết điểm dẫn tới ví", () => {
    const [item] = build([meme({ error: "Không đủ điểm: mỗi meme cần 20 điểm, ví đang có 3 điểm." })]);
    expect(item).toMatchObject({ kind: "points", title: "Meme chưa làm được", href: "/wallet" });
    expect(item.detail).toBe("Foxy Coffee hết điểm — nạp thêm để AI làm tiếp.");
  });

  it("meme bỏ cuộc sau ba lần thử, và lỗi khác, dẫn về trang làm meme", () => {
    const [gaveUp] = build([meme({ error: "MEME_RUN_GAVE_UP" })]);
    expect(gaveUp.kind).toBe("failed");
    expect(gaveUp.detail).toContain("AI thử 3 lần chưa được");
    expect(gaveUp.href).toBe("/projects/foxy-coffee/generate");
    const [other] = build([meme({ error: "lỗi lạ" })]);
    expect(other.detail).toBe("Foxy Coffee — AI chưa làm được meme. Bạn có thể thử lại.");
  });

  it("gom nhiều meme hỏng cùng lý do của một kênh thành một dòng", () => {
    const items = build([
      meme({ id: "a", error: "Không đủ điểm: 1" }),
      meme({ id: "b", error: "Không đủ điểm: 2", completed_at: "2026-10-09T11:00:00.000Z" }),
      meme({ id: "c", error: "MEME_RUN_GAVE_UP" }),
      meme({ id: "d", error: "MEME_RUN_GAVE_UP" }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].at).toBe("2026-10-09T11:00:00.000Z");
    expect(items[1].detail).toContain("2 meme");
  });

  it("bỏ meme hỏng quá ba ngày", () => {
    expect(build([meme({ created_at: "2026-10-05T10:00:00.000Z", completed_at: "2026-10-05T10:05:00.000Z" })])).toEqual([]);
  });

  it("không báo lỗi cũ khi kênh đã làm được meme sau đó", () => {
    const items = build([
      meme({ id: "a", error: "Không đủ điểm" }),
      meme({ id: "b", status: "completed", source: "manual", completed_at: "2026-10-09T11:00:00.000Z" }),
    ]);
    expect(items).toEqual([]);
  });

  it("gom meme theo lịch trong 24 giờ thành một tin mỗi kênh", () => {
    const items = build([
      meme({ id: "a", status: "completed", completed_at: "2026-10-09T09:00:00.000Z" }),
      meme({
        id: "b",
        status: "completed",
        completed_at: "2026-10-09T11:00:00.000Z",
        memes: { image_url: "x.png", generated_content: { headline: "Thứ Hai lại tới" } },
      }),
      // Quá 24 giờ.
      meme({ id: "c", status: "completed", completed_at: "2026-10-08T10:00:00.000Z" }),
      // Người dùng tự bấm làm thì đã thấy rồi.
      meme({ id: "d", status: "completed", source: "manual", completed_at: "2026-10-09T08:00:00.000Z" }),
    ]);
    expect(items).toEqual([
      {
        id: "meme-digest:p1",
        kind: "done",
        title: "AI đã làm 2 meme hôm nay cho Foxy Coffee",
        detail: "Mới nhất: “Thứ Hai lại tới”",
        href: "/projects/foxy-coffee/generate",
        at: "2026-10-09T11:00:00.000Z",
      },
    ]);
  });

  it("bỏ lượt của phiên bản dự án trước khi đặt lại", () => {
    expect(build([meme({ workspace_version: 0, error: "Không đủ điểm" })])).toEqual([]);
    expect(
      build([], {
        runs: [{ id: "r1", project_id: "p1", workspace_version: 0, status: "needs_review", phase: null, error: null, updated_at: "2026-10-09T10:00:00.000Z" }],
        films: [{ id: "f1", project_id: "p1", workspace_version: 0, created_at: "2026-10-09T10:00:00.000Z" }],
      }),
    ).toEqual([]);
  });

  it("việc cần làm lên trước, tin hỏng để biết ở giữa, tin tốt sau cùng", () => {
    const items = build(
      [
        meme({ id: "ok", status: "completed", completed_at: "2026-10-09T11:57:00.000Z" }),
        meme({ id: "bad", error: "MEME_RUN_GAVE_UP", completed_at: "2026-10-09T11:58:00.000Z" }),
      ],
      {
        // Lỗi meme mới hơn lượt thành công thì vẫn báo; bản ghi thành công ở đây cũ hơn.
        runs: [{ id: "r1", project_id: "p1", workspace_version: 1, status: "budget_blocked", phase: null, error: "INSUFFICIENT_POINTS", updated_at: "2026-10-09T08:00:00.000Z" }],
        films: [{ id: "f1", project_id: "p1", workspace_version: 1, created_at: "2026-10-09T09:00:00.000Z" }],
      },
    );
    expect(items.map((item) => item.kind)).toEqual(["ready", "points", "failed", "done"]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-09-18T12:00:00.000Z");

  it("đọc được ở mọi khoảng", () => {
    expect(timeAgo("2026-09-18T11:59:40.000Z", now)).toBe("vừa xong");
    expect(timeAgo("2026-09-18T11:30:00.000Z", now)).toBe("30 phút trước");
    expect(timeAgo("2026-09-18T09:00:00.000Z", now)).toBe("3 giờ trước");
    expect(timeAgo("2026-09-16T12:00:00.000Z", now)).toBe("2 ngày trước");
  });

  it("không vỡ khi mốc thời gian hỏng", () => {
    expect(timeAgo("hôm qua", now)).toBe("");
  });
});
