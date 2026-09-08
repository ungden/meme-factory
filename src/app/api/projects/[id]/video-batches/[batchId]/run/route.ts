import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    const { data: batch } = await a.admin
      .from("video_batches")
      .select("*")
      .eq("id", p.batchId)
      .eq("project_id", a.project.id)
      .single();
    if (!batch) throw new FilmError("Không tìm thấy lô.", 404);
    const ids = batch.quote_snapshot?.quoteIds;
    if (!Array.isArray(ids) || !ids.length)
      throw new FilmError(
        "Báo giá lô cũ đã hết hiệu lực. Lấy báo giá mới cho từng phim.",
        409,
      );
    const { data, error } = await a.admin.rpc("accept_film_batch", {
      p_quotes: ids,
      p_actor: a.user.id,
      p_key: batch.id,
    });
    if (error) throw new FilmError(error.message, 409);
    await a.admin
      .from("video_batches")
      .update({ status: "running" })
      .eq("id", batch.id);
    return NextResponse.json(
      { batchId: batch.id, results: data },
      { status: 202 },
    );
  } catch (e) {
    return fail(e);
  }
}
