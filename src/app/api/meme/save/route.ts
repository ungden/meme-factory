import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      project_id,
      original_idea,
      generated_content,
      selected_characters,
      format,
      canvas_data,
      has_watermark,
      image_base64,
      source_meme_id,
      generation_request_id,
    } = body;

    // Verify access (owner or shared member via RLS)
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (source_meme_id) {
      const { data: sourceMeme } = await supabase
        .from("memes")
        .select("id")
        .eq("id", source_meme_id)
        .eq("project_id", project_id)
        .maybeSingle();

      if (!sourceMeme) {
        return NextResponse.json({ error: "Source meme không hợp lệ" }, { status: 400 });
      }
    }

    let image_url = null;

    // Upload composed image if provided
    if (image_base64) {
      const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const filePath = `${project_id}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("memes")
        .upload(filePath, buffer, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: `Upload ảnh thất bại: ${uploadError.message}` }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from("memes")
        .getPublicUrl(filePath);
      image_url = urlData.publicUrl;
    }

    // Save meme record
    const insertPayload = {
      project_id,
      original_idea,
      generated_content,
      selected_characters,
      format,
      canvas_data,
      has_watermark: has_watermark || false,
      image_url,
      status: image_url ? "completed" : "draft",
      source_meme_id: source_meme_id || null,
    };

    let { data: meme, error } = await supabase
      .from("memes")
      .insert(insertPayload)
      .select()
      .single();

    // Backward compatibility: if DB migration chưa chạy, thử lưu lại không có source_meme_id
    if (error && String(error.message || "").includes("source_meme_id")) {
      const fallback = await supabase
        .from("memes")
        .insert({
          project_id,
          original_idea,
          generated_content,
          selected_characters,
          format,
          canvas_data,
          has_watermark: has_watermark || false,
          image_url,
          status: image_url ? "completed" : "draft",
        })
        .select()
        .single();
      meme = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (generation_request_id && meme?.id) {
      await supabaseAdmin
        .from("project_transactions")
        .update({
          output_kind: "meme",
          output_id: meme.id,
          output_url: meme.image_url,
          output_title: (meme.generated_content as { headline?: string })?.headline || meme.original_idea,
          metadata: {
            ...(typeof meme.generated_content === "object" && meme.generated_content
              ? { generated_content: meme.generated_content }
              : {}),
            format: meme.format,
            has_watermark: meme.has_watermark,
          },
        })
        .eq("project_id", project_id)
        .eq("actor_user_id", user.id)
        .eq("request_id", generation_request_id)
        .eq("type", "payment")
        .eq("status", "completed");
    }

    return NextResponse.json({ meme });
  } catch (error) {
    console.error("Save meme error:", error);
    return NextResponse.json({ error: "Failed to save meme" }, { status: 500 });
  }
}
