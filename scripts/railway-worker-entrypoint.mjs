import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);
const child = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: "inherit",
  env: process.env,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chờ Next nội bộ tới lúc thực sự phục vụ được.
 *
 * Trước đây chỉ cần "có phản hồi HTTP" là đủ, nghĩa là một trang 500 cũng tính
 * là sẵn sàng và worker chạy tiếp vào chỗ hỏng. Giờ đọc đúng /api/health và chờ
 * mục `database` xanh, vì đó là thứ worker cần để làm được việc. Thiếu cấu hình
 * không liên quan đến worker thì chỉ ghi log, không chặn khởi động.
 */
async function waitForLocalApp() {
  const deadline = Date.now() + 90_000;
  let lastReason = "chưa nhận được phản hồi";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Next nội bộ đã dừng trước khi worker khởi động.");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      const body = await response.json().catch(() => null);
      const checks = Array.isArray(body?.checks) ? body.checks : [];
      const database = checks.find((check) => check.name === "database");
      if (database?.ok) {
        const failing = checks.filter((check) => !check.ok);
        if (failing.length)
          console.warn(
            `Health còn mục chưa xanh, worker vẫn khởi động: ${failing
              .map((check) => `${check.name} (${check.detail || "không rõ"})`)
              .join(", ")}`,
          );
        return;
      }
      lastReason = database
        ? `database: ${database.detail || "không truy vấn được"}`
        : `health trả ${response.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  // Không ném: một container không khởi động được sẽ bị Railway restart mãi, và
  // vòng lặp đó im lặng hơn nhiều so với một worker chạy mà báo lỗi. Worker có
  // client Supabase riêng nên vẫn làm được việc khi app nội bộ chưa khoẻ; nhịp
  // thở không xuất hiện sẽ kích hoạt cảnh báo trong 5 phút.
  console.error(
    `Next nội bộ chưa khoẻ sau 90 giây (${lastReason}). Worker vẫn khởi động ở trạng thái giảm chất lượng.`,
  );
}

try {
  await waitForLocalApp();
  const worker = spawn("node", ["scripts/wavespeed-worker.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      AIDA_BASE_URL: `http://127.0.0.1:${port}`,
    },
  });
  const stop = (signal) => {
    worker.kill(signal);
    child.kill(signal);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  const [code] = await new Promise((resolve) => worker.once("exit", (...args) => resolve(args)));
  process.exitCode = Number(code || 1);
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
}
