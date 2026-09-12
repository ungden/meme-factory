import { NextRequest, NextResponse } from "next/server";
import { hasOpenAiApiKey } from "@/lib/server-secrets";
import { getSupabaseAdmin } from "@/lib/admin";
import { watermarkAiAccess, watermarkAiError } from "@/lib/watermark-ai-access";
import { prepareWatermarkReference, WATERMARK_AI_MAX_POINTS, WATERMARK_AI_MAX_USD, WATERMARK_AI_MODEL, WATERMARK_JOB_COLUMNS } from "@/lib/watermark-ai";
export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const access = await watermarkAiAccess(request, (await params).id);
  if (access.error) return access.error;
  const { data, error } = await getSupabaseAdmin().from("watermark_ai_jobs").select(WATERMARK_JOB_COLUMNS)
    .eq("project_id", access.project.id).eq("user_id", access.user.id).eq("workspace_version", access.project.workspace_version)
    .neq("status", "quoted").order("created_at", { ascending: false }).limit(6);
  if (error) return watermarkAiError(error.message);
  return NextResponse.json({ jobs: data }, { headers: { "Cache-Control": "private, no-store" } });
}

// Prepare immutable, expiring inputs and a maximum point quote. No provider call or charge.
export async function POST(request: NextRequest, { params }: Context) {
  const access = await watermarkAiAccess(request, (await params).id);
  if (access.error) return access.error;
  if (!hasOpenAiApiKey()) return NextResponse.json({ error: "AI watermark chưa sẵn sàng. Chưa trừ điểm." }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 3 * 1024 * 1024 + 65_536)
    return NextResponse.json({ error: "Ảnh tối đa 3 MB." }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Không đọc được dữ liệu." }, { status: 400 }); }
  const mode = form.get("mode"), prompt = String(form.get("prompt") || "").trim();
  if (mode !== "remove_background" && mode !== "generate") return NextResponse.json({ error: "Chọn cách tạo watermark." }, { status: 400 });
  if (Number(form.get("workspaceVersion")) !== access.project.workspace_version) return watermarkAiError("WORKSPACE_FORBIDDEN");
  if (prompt.length > 1500 || (mode === "generate" && prompt.length < 3))
    return NextResponse.json({ error: "Mô tả từ 3 đến 1.500 ký tự." }, { status: 400 });
  let input: string | null = null;
  if (mode === "remove_background") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Chọn ảnh JPG, PNG hoặc WebP tối đa 3 MB." }, { status: 400 });
    try { input = (await prepareWatermarkReference(Buffer.from(await file.arrayBuffer()))).toString("base64"); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không đọc được ảnh." }, { status: 400 }); }
  }
  const { data: id, error } = await getSupabaseAdmin().rpc("quote_watermark_ai", {
    p_project: access.project.id, p_user: access.user.id, p_workspace: access.project.workspace_version,
    p_mode: mode, p_prompt: mode === "generate" ? prompt : "", p_input: input, p_points: WATERMARK_AI_MAX_POINTS, p_model: WATERMARK_AI_MODEL, p_cost: WATERMARK_AI_MAX_USD,
  });
  if (error) return watermarkAiError(error.message);
  return NextResponse.json({ id, maxPoints: WATERMARK_AI_MAX_POINTS, expiresInSeconds: 900 });
}
