import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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
    } = body;

    // Verify ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
    const { data: meme, error } = await supabase
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meme });
  } catch (error) {
    console.error("Save meme error:", error);
    return NextResponse.json({ error: "Failed to save meme" }, { status: 500 });
  }
}
