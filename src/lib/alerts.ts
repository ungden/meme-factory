/**
 * Luật cảnh báo vận hành.
 *
 * Phần thuần logic nằm ở đây để kiểm thử được: route chỉ đi lấy số liệu rồi
 * hỏi `buildAlerts` xem có gì đáng gọi người dậy không.
 *
 * Nguyên tắc: một cảnh báo chỉ tồn tại nếu có việc phải làm ngay. Cảnh báo
 * không hành động được sẽ bị bỏ qua sau vài ngày, và khi đó cái thật cũng bị bỏ
 * qua theo.
 */

export type AlertLevel = "error" | "warning";

export type Alert = {
  /** Khoá ổn định để chống gửi lặp. */
  key: string;
  level: AlertLevel;
  message: string;
};

export type AlertSnapshot = {
  now: number;
  /** Lần cuối worker Railway báo về, ISO. */
  workerSeenAt: string | null;
  /** Lượt sản xuất đang chờ người xử lý, kèm số phút đã chờ. */
  waitingRuns: { id: string; minutes: number }[];
  /** Tác vụ provider trong 1 giờ gần nhất. */
  jobs: { failed: number; total: number };
  /** Giao dịch điểm trong 1 giờ gần nhất. */
  transactions: { refunds: number; payments: number };
};

export const WORKER_SILENT_MINUTES = 5;
export const REVIEW_WAIT_MINUTES = 30;
/** Dưới ngưỡng mẫu này thì tỷ lệ không nói lên điều gì. */
const MIN_JOB_SAMPLE = 5;
const MIN_REFUND_SAMPLE = 3;

export function buildAlerts(snapshot: AlertSnapshot): Alert[] {
  const alerts: Alert[] = [];

  const seenAt = snapshot.workerSeenAt ? Date.parse(snapshot.workerSeenAt) : NaN;
  const silentMinutes = Number.isNaN(seenAt)
    ? Infinity
    : Math.round((snapshot.now - seenAt) / 60000);
  if (silentMinutes > WORKER_SILENT_MINUTES)
    alerts.push({
      key: "worker-silent",
      level: "error",
      message: Number.isFinite(silentMinutes)
        ? `Worker im lặng ${silentMinutes} phút. Kiểm tra Railway; cron Vercel đang gánh tạm.`
        : "Worker chưa từng báo về. Kiểm tra Railway.",
    });

  const waiting = snapshot.waitingRuns.filter((run) => run.minutes > REVIEW_WAIT_MINUTES);
  if (waiting.length) {
    const oldest = waiting.reduce((a, b) => (a.minutes >= b.minutes ? a : b));
    alerts.push({
      key: "runs-waiting",
      level: "warning",
      message: `${waiting.length} lượt phim chờ người xử lý quá ${REVIEW_WAIT_MINUTES} phút (lâu nhất ${oldest.minutes} phút: ${oldest.id}).`,
    });
  }

  const { failed, total } = snapshot.jobs;
  if (total >= MIN_JOB_SAMPLE && failed / total > 0.3)
    alerts.push({
      key: "jobs-failing",
      level: "error",
      message: `${failed}/${total} tác vụ provider hỏng trong 1 giờ. Kiểm tra WaveSpeed/Gemini.`,
    });

  const { refunds, payments } = snapshot.transactions;
  if (refunds >= MIN_REFUND_SAMPLE && refunds > payments * 0.25)
    alerts.push({
      key: "refunds-high",
      level: "warning",
      message: `${refunds} lần hoàn điểm / ${payments} lần trừ điểm trong 1 giờ. Kiểm tra pipeline trước khi khách kêu.`,
    });

  return alerts;
}

/**
 * Lọc những cảnh báo vừa gửi rồi, để một sự cố kéo dài không spam mỗi phút.
 *
 * @param alerts danh sách cảnh báo hiện tại
 * @param sentAt map khoá → ISO của lần gửi gần nhất
 */
export function dueAlerts(
  alerts: Alert[],
  sentAt: Record<string, string>,
  now: number,
  repeatAfterMs = 60 * 60 * 1000,
): Alert[] {
  return alerts.filter((alert) => {
    const previous = sentAt[alert.key] ? Date.parse(sentAt[alert.key]) : NaN;
    if (Number.isNaN(previous)) return true;
    return now - previous >= repeatAfterMs;
  });
}
