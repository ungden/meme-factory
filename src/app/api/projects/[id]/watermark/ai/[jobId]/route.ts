import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { watermarkAiAccess, watermarkAiError } from "@/lib/watermark-ai-access";

type Context = { params: Promise<{ id: string; jobId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const { id, jobId } = await params;
  const access = await watermarkAiAccess(request, id);
  if (access.error) return access.error;
  const body = await request.json().catch(() => ({}));
  if (body.workspaceVersion !== access.project.workspace_version) return watermarkAiError("WORKSPACE_FORBIDDEN");
  // The quote UUID itself is the idempotency key, retained across retries/refresh.
  const { data, error } = await getSupabaseAdmin().rpc("accept_watermark_ai", {
    p_id: jobId, p_project: id, p_user: access.user.id, p_workspace: body.workspaceVersion,
  });
  if (error) return watermarkAiError(error.message);
  return NextResponse.json({ jobId: data.id, status: data.status }, { status: 202 });
}
