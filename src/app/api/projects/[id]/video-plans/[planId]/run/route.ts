import { NextRequest, NextResponse } from "next/server";
import { access, readPlan, fail, FilmError } from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    await readPlan(a, p.planId);
    const body = await r.json();
    if (!body.quoteId || !body.idempotencyKey)
      throw new FilmError("Cần báo giá mới và mã yêu cầu.");
    const { data: q } = await a.admin
      .from("short_film_quotes")
      .select("id")
      .eq("id", body.quoteId)
      .eq("plan_id", p.planId)
      .eq("project_id", a.project.id)
      .maybeSingle();
    if (!q) throw new FilmError("Báo giá không thuộc phim.", 404);
    const { data, error } = await a.admin.rpc("accept_film_quote", {
      p_quote: body.quoteId,
      p_actor: a.user.id,
      p_key: body.idempotencyKey,
    });
    if (error)
      throw new FilmError(
        error.message,
        error.message.includes("INSUFFICIENT") ? 402 : 409,
      );
    return NextResponse.json(data, { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
