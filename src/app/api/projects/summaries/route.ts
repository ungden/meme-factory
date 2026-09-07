import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

/** Lightweight project-card data. RLS on every query keeps cross-project
 * drafts and media out of this aggregate response. */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });

  const { data: projects, error: projectError } = await supabase.from("projects").select("id");
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  const projectIds = (projects ?? []).map((project) => project.id);
  if (!projectIds.length) return NextResponse.json({ summaries: {} });

  const [{ data: characters, error: characterError }, { data: sets, error: setError }] = await Promise.all([
    supabase.from("characters").select("project_id").in("project_id", projectIds),
    supabase.from("content_sets").select("project_id, status, content_outputs(id)").in("project_id", projectIds),
  ]);
  if (characterError || setError) return NextResponse.json({ error: characterError?.message ?? setError?.message ?? "Không tải được tổng quan dự án." }, { status: 500 });

  const summaries: Record<string, { characterCount: number; outputCount: number; draftCount: number }> = {};
  for (const id of projectIds) summaries[id] = { characterCount: 0, outputCount: 0, draftCount: 0 };
  for (const character of characters ?? []) summaries[character.project_id].characterCount += 1;
  for (const set of sets ?? []) {
    const summary = summaries[set.project_id];
    if (!summary) continue;
    if (set.status === "draft") summary.draftCount += 1;
    summary.outputCount += (set.content_outputs ?? []).length;
  }
  return NextResponse.json({ summaries }, { headers: { "Server-Timing": `summaries;dur=${(performance.now() - startedAt).toFixed(1)}` } });
}
