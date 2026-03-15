import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { suggestCharactersForFanpage } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const project_id = String(body?.project_id || "");
    const fanpage_description = String(body?.fanpage_description || "").trim();
    const count = Number(body?.count || 4);

    if (!project_id || !fanpage_description) {
      return NextResponse.json({ error: "Thiếu project_id hoặc mô tả fanpage" }, { status: 400 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(project_id);
    const projectQuery = supabase.from("projects").select("id, style_prompt").limit(1);
    const { data: project } = isUuid
      ? await projectQuery.eq("id", project_id).maybeSingle()
      : await projectQuery.eq("slug", project_id).maybeSingle();

    if (!project) {
      return NextResponse.json({ error: "Project không tồn tại hoặc bạn không có quyền" }, { status: 404 });
    }

    const suggestions = await suggestCharactersForFanpage({
      fanpageDescription: fanpage_description,
      projectStyle: project.style_prompt || undefined,
      count,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Suggest characters error:", error);
    return NextResponse.json({ error: "Không thể gợi ý nhân vật lúc này" }, { status: 500 });
  }
}
