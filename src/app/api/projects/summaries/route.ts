import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

/** Lightweight project-card data. RLS on every query keeps cross-project
 * drafts and media out of this aggregate response. */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });

  const { data, error } = await supabase.rpc("get_project_card_summaries");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summaries: Record<string, { characterCount: number; outputCount: number; draftCount: number }> = {};
  for (const summary of data ?? []) {
    summaries[summary.project_id] = {
      characterCount: Number(summary.character_count ?? 0),
      outputCount: Number(summary.output_count ?? 0),
      draftCount: Number(summary.draft_count ?? 0),
    };
  }
  return NextResponse.json({ summaries }, { headers: { "Server-Timing": `summaries;dur=${(performance.now() - startedAt).toFixed(1)}` } });
}
