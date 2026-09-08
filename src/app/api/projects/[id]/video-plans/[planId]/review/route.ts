import { NextRequest, NextResponse } from "next/server";
import {
  access,
  checkVersion,
  readPlan,
  fail,
  FilmError,
} from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    const p = await params,
      a = await access(r, p.id),
      plan = await readPlan(a, p.planId),
      body = await r.json();
    checkVersion(a, body, plan);
    const { error } = await a.admin.rpc("review_film_script", {
      p_project: a.project.id,
      p_actor: a.user.id,
      p_workspace: a.project.workspace_version,
      p_plan: plan.id,
      p_expected: plan.version,
    });
    if (error) throw new FilmError(error.message, 409);
    return NextResponse.json({ plan: await readPlan(a, plan.id) });
  } catch (e) {
    return fail(e);
  }
}
