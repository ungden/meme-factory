import { createClient } from "@supabase/supabase-js";
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const id = process.argv[2];
let last = "";
const deadline = Date.now() + 55 * 60 * 1000;
while (Date.now() < deadline) {
  const { data: r } = await db
    .from("short_film_production_runs")
    .select("status,phase,error,points_committed,plan_id")
    .eq("id", id)
    .single();
  if (!r) { console.log("không thấy lượt chạy"); break; }
  const { data: sr } = await db
    .from("short_film_script_runs")
    .select("stage,status,attempts,error")
    .eq("run_id", id)
    .maybeSingle();
  let tasks = "";
  if (r.plan_id) {
    const { data: ts } = await db.from("short_film_tasks").select("kind,status").eq("plan_id", r.plan_id);
    const by = {};
    for (const t of ts || []) by[`${t.kind}:${t.status}`] = (by[`${t.kind}:${t.status}`] || 0) + 1;
    tasks = Object.keys(by).length ? JSON.stringify(by) : "";
  }
  const line = `${r.status} ${r.phase} pts=${r.points_committed} script=${sr ? `${sr.stage}/${sr.status}/att${sr.attempts}` : "-"} ${tasks}${r.error ? " ERR:" + r.error.slice(0, 200) : ""}${sr?.error ? " SERR:" + sr.error.slice(0, 200) : ""}`;
  if (line !== last) { console.log(new Date().toISOString().slice(11, 19), line); last = line; }
  if (["completed", "failed", "cancelled", "needs_review"].includes(r.status)) break;
  await new Promise((res) => setTimeout(res, 20000));
}
