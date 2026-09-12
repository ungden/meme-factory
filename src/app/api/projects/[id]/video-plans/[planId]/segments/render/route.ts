import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, readPlan } from "@/lib/short-film/server";
import { quoteSegmentRender } from "@/lib/short-film/segment-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    const { id, planId } = await params;
    const auth = await access(request, id);
    const plan = await readPlan(auth, planId);
    const body = (await request.json()) as Record<string, unknown>;
    if (Number(body.workspaceVersion) !== auth.project.workspace_version)
      throw new FilmError("Workspace đã thay đổi. Hãy tải lại trước khi ghép phim.", 409);
    if (Number(body.expectedVersion) !== plan.version)
      throw new FilmError("Kịch bản đã đổi. Hãy tải lại trước khi ghép phim.", 409);
    return NextResponse.json({ quote: await quoteSegmentRender(auth, plan) });
  } catch (error) {
    return fail(error);
  }
}
