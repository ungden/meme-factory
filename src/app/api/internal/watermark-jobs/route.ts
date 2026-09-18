import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { authorizeInternal } from "@/lib/internal-auth";
import { processWatermarkJob } from "@/lib/watermark-ai-worker";
export const maxDuration = 240;
export async function POST(request: NextRequest) {
  if (!authorizeInternal(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: jobs, error } = await admin.rpc("claim_watermark_ai");
  if (error) return NextResponse.json({ error: "Không nhận được tác vụ watermark." }, { status: 500 });
  for (const job of jobs || []) await processWatermarkJob(admin, job);
  return NextResponse.json({ processed: jobs?.length || 0 });
}
