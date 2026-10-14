import { describe, expect, it } from "vitest";
import { taskRefundedPoints } from "./refunds";

describe("taskRefundedPoints", () => {
  const failed = { status: "failed", points: 40, checkpoint: { settled: true } };

  it("reports the points of a settled failure that never reached the provider", () => {
    expect(taskRefundedPoints(failed)).toBe(40);
    expect(taskRefundedPoints({ ...failed, status: "cancelled" })).toBe(40);
  });

  it("says nothing before the sweeper has settled the task", () => {
    expect(taskRefundedPoints({ ...failed, checkpoint: {} })).toBe(0);
    expect(taskRefundedPoints({ ...failed, checkpoint: null })).toBe(0);
  });

  it("keeps the charge while a submission may still produce a result", () => {
    expect(taskRefundedPoints({ ...failed, checkpoint: { settled: true, submitting: true } })).toBe(0);
    expect(
      taskRefundedPoints({ ...failed, checkpoint: { settled: true, submitting: true, definitiveFailure: true } }),
    ).toBe(40);
  });

  it("ignores free or successful tasks", () => {
    expect(taskRefundedPoints({ ...failed, points: 0 })).toBe(0);
    expect(taskRefundedPoints({ ...failed, status: "completed" })).toBe(0);
  });
});
