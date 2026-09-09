import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);
const child = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: "inherit",
  env: process.env,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForLocalApp() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Next nội bộ đã dừng trước khi worker khởi động.");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      // Any HTTP response proves the local Next listener is available.  Health
      // may be protected or absent in older deployments.
      if (response.status > 0) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("Next nội bộ không sẵn sàng sau 90 giây.");
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
