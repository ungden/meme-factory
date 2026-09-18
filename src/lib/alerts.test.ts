import { describe, expect, it } from "vitest";
import { buildAlerts, dueAlerts, type AlertSnapshot } from "./alerts";

const now = Date.parse("2026-09-18T10:00:00.000Z");
const healthy: AlertSnapshot = {
  now,
  workerSeenAt: "2026-09-18T09:59:00.000Z",
  waitingRuns: [],
  jobs: { failed: 0, total: 20 },
  transactions: { refunds: 0, payments: 40 },
};

describe("buildAlerts", () => {
  it("im lặng khi mọi thứ bình thường", () => {
    expect(buildAlerts(healthy)).toEqual([]);
  });

  it("báo khi worker im lặng quá 5 phút", () => {
    const alerts = buildAlerts({ ...healthy, workerSeenAt: "2026-09-18T09:50:00.000Z" });
    expect(alerts.map((a) => a.key)).toEqual(["worker-silent"]);
    expect(alerts[0].message).toContain("10 phút");
  });

  it("báo khi worker chưa từng báo về", () => {
    expect(buildAlerts({ ...healthy, workerSeenAt: null })[0].key).toBe("worker-silent");
  });

  it("báo lượt phim chờ người quá 30 phút và nêu lượt lâu nhất", () => {
    const alerts = buildAlerts({
      ...healthy,
      waitingRuns: [
        { id: "run-a", minutes: 31 },
        { id: "run-b", minutes: 90 },
        { id: "run-c", minutes: 10 },
      ],
    });
    expect(alerts[0].key).toBe("runs-waiting");
    expect(alerts[0].message).toContain("2 lượt phim");
    expect(alerts[0].message).toContain("run-b");
  });

  it("chỉ báo tỷ lệ hỏng khi đủ mẫu", () => {
    expect(buildAlerts({ ...healthy, jobs: { failed: 2, total: 3 } })).toEqual([]);
    expect(buildAlerts({ ...healthy, jobs: { failed: 4, total: 10 } })[0].key).toBe("jobs-failing");
  });

  it("chỉ báo hoàn điểm bất thường khi vượt cả số tuyệt đối lẫn tỷ lệ", () => {
    expect(buildAlerts({ ...healthy, transactions: { refunds: 2, payments: 2 } })).toEqual([]);
    expect(buildAlerts({ ...healthy, transactions: { refunds: 3, payments: 4 } })[0].key).toBe("refunds-high");
  });
});

describe("dueAlerts", () => {
  const alerts = buildAlerts({ ...healthy, workerSeenAt: null });

  it("gửi khi chưa từng gửi", () => {
    expect(dueAlerts(alerts, {}, now)).toHaveLength(1);
  });

  it("nín trong một giờ sau lần gửi trước", () => {
    expect(dueAlerts(alerts, { "worker-silent": "2026-09-18T09:30:00.000Z" }, now)).toHaveLength(0);
    expect(dueAlerts(alerts, { "worker-silent": "2026-09-18T08:30:00.000Z" }, now)).toHaveLength(1);
  });
});
