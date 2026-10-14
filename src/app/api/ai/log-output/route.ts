import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé." }, { status: 401 });
    }

    const body = await request.json();
    const {
      project_id,
      request_id,
      output_kind,
      output_id,
      output_url,
      output_title,
      metadata,
    } = body || {};

    if (!project_id || !request_id || !output_kind) {
      return NextResponse.json({ error: "Thiếu thông tin bài cần ghi lại." }, { status: 400 });
    }

    const { error } = await supabase
      .from("project_transactions")
      .update({
        output_kind,
        output_id: output_id || null,
        output_url: output_url || null,
        output_title: output_title || null,
        metadata: metadata || null,
      })
      .eq("project_id", project_id)
      .eq("actor_user_id", user.id)
      .eq("request_id", request_id)
      .eq("type", "payment")
      .eq("status", "completed");

    if (error) {
      return NextResponse.json({ error: "Chưa ghi lại được bài này." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Chưa ghi lại được bài này. Bạn thử lại nhé." }, { status: 500 });
  }
}
