import { NextRequest, NextResponse } from "next/server";
import { access, fail, readPlan } from "@/lib/short-film/server";
import { readFilmSegments } from "@/lib/short-film/segment-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    const { id, planId } = await params;
    const auth = await access(request, id);
    const plan = await readPlan(auth, planId);
    return NextResponse.json({ segments: await readFilmSegments(auth, plan) });
  } catch (error) {
    return fail(error);
  }
}

