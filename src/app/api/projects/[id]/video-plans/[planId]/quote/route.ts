import { NextRequest, NextResponse } from "next/server";
import { access, readPlan, quotePlan, fail } from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    return NextResponse.json({
      quote: await quotePlan(a, await readPlan(a, p.planId), await r.json()),
    });
  } catch (e) {
    return fail(e);
  }
}
