import { describe, expect, it, vi } from "vitest";
import { spendProjectPoints, type PointsRpc } from "./project-points";

const base = {
  projectId: "p1",
  projectOwnerId: "owner",
  actorUserId: "owner",
  cost: 10,
  description: "Tạo ảnh",
  requestId: "r1",
  projectName: "Foxy",
};

function rpcFrom(responses: Record<string, unknown[]>): { rpc: PointsRpc; calls: string[] } {
  const queues = Object.fromEntries(Object.entries(responses).map(([key, list]) => [key, [...list]]));
  const calls: string[] = [];
  const rpc: PointsRpc = async (name) => {
    calls.push(name);
    const next = queues[name]?.shift();
    if (next === undefined) throw new Error(`Không có phản hồi giả cho ${name}`);
    return { data: next, error: null };
  };
  return { rpc, calls };
}

describe("spendProjectPoints", () => {
  it("trừ thẳng khi ví dự án đủ điểm", async () => {
    const { rpc, calls } = rpcFrom({
      atomic_deduct_project_points: [{ success: true, points: 40, transaction_id: "t1" }],
    });
    await expect(spendProjectPoints(rpc, base)).resolves.toEqual({
      ok: true,
      projectPoints: 40,
      toppedUp: 0,
      transactionId: "t1",
    });
    expect(calls).toEqual(["atomic_deduct_project_points"]);
  });

  it("chuyển đúng phần thiếu từ ví cá nhân rồi trừ lại", async () => {
    const { rpc, calls } = rpcFrom({
      atomic_deduct_project_points: [
        { success: false, error: "Insufficient project points", points: 4 },
        { success: true, points: 0, transaction_id: "t2" },
      ],
      atomic_deposit_points_to_project: [{ success: true, user_points: 90, project_points: 10 }],
    });
    const result = await spendProjectPoints(rpc, base);
    expect(result).toEqual({ ok: true, projectPoints: 0, toppedUp: 6, transactionId: "t2" });
    expect(calls).toEqual([
      "atomic_deduct_project_points",
      "atomic_deposit_points_to_project",
      "atomic_deduct_project_points",
    ]);
  });

  it("báo thiếu kèm tổng số điểm thật khi ví cá nhân cũng không đủ", async () => {
    const { rpc } = rpcFrom({
      atomic_deduct_project_points: [{ success: false, error: "Insufficient project points", points: 4 }],
      atomic_deposit_points_to_project: [{ success: false, error: "Insufficient points", points: 2 }],
    });
    await expect(spendProjectPoints(rpc, base)).resolves.toEqual({
      ok: false,
      code: "INSUFFICIENT_POINTS",
      required: 10,
      available: 6,
      canTopUp: true,
    });
  });

  it("không tiêu điểm cá nhân của chủ dự án khi người tạo là thành viên", async () => {
    const { rpc, calls } = rpcFrom({
      atomic_deduct_project_points: [{ success: false, error: "Insufficient project points", points: 4 }],
    });
    await expect(spendProjectPoints(rpc, { ...base, actorUserId: "member" })).resolves.toEqual({
      ok: false,
      code: "INSUFFICIENT_POINTS",
      required: 10,
      available: 4,
      canTopUp: false,
    });
    expect(calls).toEqual(["atomic_deduct_project_points"]);
  });

  it("trả lỗi khi RPC hỏng thay vì ném", async () => {
    const rpc: PointsRpc = vi.fn(async () => ({ data: null, error: { message: "mất kết nối" } }));
    await expect(spendProjectPoints(rpc, base)).resolves.toEqual({ ok: false, code: "FAILED", message: "mất kết nối" });
  });

  it("bỏ qua khi việc này miễn phí", async () => {
    const rpc: PointsRpc = vi.fn();
    await expect(spendProjectPoints(rpc, { ...base, cost: 0 })).resolves.toEqual({
      ok: true,
      projectPoints: 0,
      toppedUp: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("ensureProjectPoints", () => {
  it("không làm gì khi ví dự án đã đủ", async () => {
    const { ensureProjectPoints } = await import("./project-points");
    const rpc = vi.fn();
    await expect(
      ensureProjectPoints(rpc, { ...base, currentPoints: 50, needed: 30 }),
    ).resolves.toEqual({ ok: true, toppedUp: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chuyển đúng phần thiếu", async () => {
    const { ensureProjectPoints } = await import("./project-points");
    const { rpc, calls } = rpcFrom({ atomic_deposit_points_to_project: [{ success: true }] });
    await expect(
      ensureProjectPoints(rpc, { ...base, currentPoints: 10, needed: 300 }),
    ).resolves.toEqual({ ok: true, toppedUp: 290 });
    expect(calls).toEqual(["atomic_deposit_points_to_project"]);
  });

  it("báo tổng điểm thật khi ví cá nhân không đủ", async () => {
    const { ensureProjectPoints } = await import("./project-points");
    const { rpc } = rpcFrom({
      atomic_deposit_points_to_project: [{ success: false, error: "Insufficient points", points: 40 }],
    });
    await expect(
      ensureProjectPoints(rpc, { ...base, currentPoints: 10, needed: 300 }),
    ).resolves.toEqual({ ok: false, available: 50 });
  });

  it("không đụng ví cá nhân của chủ dự án khi người chạy là thành viên", async () => {
    const { ensureProjectPoints } = await import("./project-points");
    const rpc = vi.fn();
    await expect(
      ensureProjectPoints(rpc, { ...base, actorUserId: "member", currentPoints: 10, needed: 300 }),
    ).resolves.toEqual({ ok: false, available: 10 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
