import { createClient } from "@supabase/supabase-js";
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const id = process.argv[2];
const { data: run } = await db
  .from("short_film_production_runs")
  .select("id, created_by, workspace_version, updated_at, status")
  .eq("id", id)
  .single();
if (!["needs_review", "paused", "budget_blocked"].includes(run.status)) {
  console.log("không cần tiếp tục, trạng thái:", run.status);
  process.exit(0);
}
const { data, error } = await db.rpc("control_film_production_run_v2", {
  p_id: run.id,
  p_actor: run.created_by,
  p_workspace: run.workspace_version,
  p_action: "resume",
  p_expected_updated_at: run.updated_at,
  p_max_film: null,
  p_max_day: null,
});
console.log(error ? `lỗi: ${error.message}` : `đã tiếp tục: ${data?.status}`);
