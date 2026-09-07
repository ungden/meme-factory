import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function projectForRef(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], ref: string) {
  const query = supabase.from("projects").select("id, workspace_version").limit(1);
  return UUID.test(ref) ? query.eq("id", ref).maybeSingle() : query.eq("slug", ref).maybeSingle();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const tool = request.nextUrl.searchParams.get("tool");
  if (tool !== "image" && tool !== "video") return NextResponse.json({ error: "Tool không hợp lệ." }, { status: 400 });
  const { data: project } = await projectForRef(supabase, id);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const { data, error } = await supabase.from("workspace_drafts").select("*").eq("project_id", project.id).eq("tool", tool).eq("created_by", user.id).eq("workspace_version", project.workspace_version).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: output } = data?.content_output_id
    ? await supabase
      .from("content_outputs")
      .select("id, generation_job_id, status, media_url, poster_url, duration_seconds")
      .eq("id", data.content_output_id)
      .maybeSingle()
    : { data: null };
  return NextResponse.json({ draft: data ?? null, output: output ?? null, workspaceVersion: project.workspace_version });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  if (body.tool !== "image" && body.tool !== "video") return NextResponse.json({ error: "Tool không hợp lệ." }, { status: 400 });
  const { data: project } = await projectForRef(supabase, id);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const { data, error } = await supabase.from("workspace_drafts").insert({ project_id: project.id, tool: body.tool, payload: typeof body.payload === "object" && body.payload ? body.payload : {}, content_set_id: typeof body.content_set_id === "string" ? body.content_set_id : null, content_output_id: typeof body.content_output_id === "string" ? body.content_output_id : null, workspace_version: project.workspace_version, created_by: user.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data }, { status: 201 });
}
