import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError, readPlan } from "@/lib/short-film/server";
import {
  saveFilmSegment,
  selectFilmSegmentSource,
} from "@/lib/short-film/segment-server";

type Context = {
  params: Promise<{ id: string; planId: string; segmentId: string }>;
};

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id, planId, segmentId } = await params;
    const auth = await access(request, id);
    const plan = await readPlan(auth, planId);
    const body = (await request.json()) as Record<string, unknown>;
    if (Number(body.workspaceVersion) !== auth.project.workspace_version)
      throw new FilmError("Workspace đã thay đổi. Hãy tải lại đoạn hiện tại.", 409);
    const segment =
      body.action === "select-source"
        ? await selectFilmSegmentSource(auth, plan, segmentId, body)
        : await saveFilmSegment(auth, plan, segmentId, body);
    return NextResponse.json({ segment });
  } catch (error) {
    return fail(error);
  }
}
