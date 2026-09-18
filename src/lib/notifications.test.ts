import { describe, expect, it } from "vitest";
import { buildNotifications, timeAgo } from "./notifications";

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
    expect(items[0].href).toBe("/projects/foxy-coffee/short-films");
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
        { id: "r1", project_id: "p1", status: "needs_review", phase: null, error: "x".repeat(300), updated_at: "2026-09-18T11:00:00.000Z" },
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
