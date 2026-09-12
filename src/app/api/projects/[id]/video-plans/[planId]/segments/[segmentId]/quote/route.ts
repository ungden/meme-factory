import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, readPlan } from "@/lib/short-film/server";
import { quoteFilmSegment } from "@/lib/short-film/segment-server";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; planId: string; segmentId: string }>;
  },
) {
  try {
    const { id, planId, segmentId } = await params;
    const auth = await access(request, id);
    const plan = await readPlan(auth, planId);
    const body = (await request.json()) as Record<string, unknown>;
    if (Number(body.workspaceVersion) !== auth.project.workspace_version)
      throw new FilmError("Workspace đã thay đổi. Hãy tải lại trước khi báo giá.", 409);
    return NextResponse.json({
      quote: await quoteFilmSegment(
        auth,
        plan,
        segmentId,
        body,
      ),
    });
  } catch (error) {
    return fail(error);
  }
}
