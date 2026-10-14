import { describe, expect, it } from "vitest";
import { QUEUE_LIMIT, parseQueuedPlanIds, planIsQueueable, queryableIds, resolveQueue } from "./queue";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("parseQueuedPlanIds", () => {
  it("returns null when no queue was sent, so the saved queue is kept", () => {
    expect(parseQueuedPlanIds(undefined)).toBeNull();
    expect(parseQueuedPlanIds("abc")).toBeNull();
  });

  it("keeps order, drops non-strings and duplicates", () => {
    expect(parseQueuedPlanIds([B, 3, A, B, null])).toEqual([B, A]);
  });

  it("treats an empty list as clearing the queue", () => {
    expect(parseQueuedPlanIds([])).toEqual([]);
  });
});

describe("queryableIds", () => {
  it("only lets uuids reach the database query", () => {
    expect(queryableIds([A, "'; drop table x", "not-a-uuid"])).toEqual([A]);
  });
});

describe("planIsQueueable", () => {
  it("matches what the daily run will still make", () => {
    expect(planIsQueueable({ id: A, status: "draft" })).toBe(true);
    expect(planIsQueueable({ id: A, status: "failed" })).toBe(true);
    expect(planIsQueueable({ id: A, status: "completed" })).toBe(false);
    expect(planIsQueueable({ id: A, status: "approved" })).toBe(false);
    expect(planIsQueueable({ id: A, status: "cancelled" })).toBe(false);
    expect(planIsQueueable({ id: A, status: "draft", archived_at: "2026-10-01" })).toBe(false);
  });
});

describe("resolveQueue", () => {
  const rows = [
    { id: B, status: "draft" },
    { id: A, status: "draft" },
    { id: C, status: "completed" },
  ];

  it("follows the owner's order, not the database order", () => {
    expect(resolveQueue([A, B], rows, { strict: true })).toEqual({ ok: true, plans: [rows[1], rows[0]] });
  });

  it("rejects a sent queue holding an episode from another channel", () => {
    // Truy vấn đã lọc theo kênh, nên id kênh khác không có trong rows.
    const foreign = "44444444-4444-4444-8444-444444444444";
    expect(resolveQueue([A, foreign], rows, { strict: true })).toEqual({ ok: false });
    expect(resolveQueue([A, "not-a-uuid"], rows, { strict: true })).toEqual({ ok: false });
  });

  it("quietly drops dead ids from the saved queue instead of blocking every save", () => {
    const gone = "55555555-5555-4555-8555-555555555555";
    expect(resolveQueue([gone, A], rows, { strict: false })).toEqual({ ok: true, plans: [rows[1]] });
  });

  it("drops finished episodes the daily run would skip anyway", () => {
    expect(resolveQueue([C, A], rows, { strict: true })).toEqual({ ok: true, plans: [rows[1]] });
  });

  it("caps the queue length", () => {
    const many = Array.from({ length: QUEUE_LIMIT + 5 }, (_, n) => ({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      status: "draft",
    }));
    const result = resolveQueue(many.map((row) => row.id), many, { strict: true });
    expect(result.ok && result.plans).toHaveLength(QUEUE_LIMIT);
  });
});
