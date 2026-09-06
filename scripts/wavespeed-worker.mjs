/* Railway recovery worker: credentials stay in Vercel, which owns storage ACLs. */
const appUrl = process.env.AIDA_BASE_URL;
const workerToken = process.env.VIDEO_WORKER_TOKEN;

if (!appUrl || !workerToken) throw new Error("AIDA_BASE_URL và VIDEO_WORKER_TOKEN là bắt buộc.");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function tick() {
  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/wavespeed/reconcile`, {
    method: "POST", headers: { Authorization: `Bearer ${workerToken}` },
  });
  if (!response.ok) throw new Error(`Reconcile ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log(`WaveSpeed reconcile complete: ${result.processed ?? 0} job(s) processed.`);
}

while (true) {
  try { await tick(); } catch (error) { console.error("Video worker tick:", error instanceof Error ? error.message : error); }
  await sleep(30_000);
}
