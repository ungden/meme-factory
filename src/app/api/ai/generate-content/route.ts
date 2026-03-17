import { NextRequest, NextResponse } from "next/server";
import { generateMemeContent } from "@/lib/gemini";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GenerateContentRequest } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GenerateContentRequest & { noCharacters?: boolean };
    const { project_id, idea, tone, num_variations, referenceImages, adHocCharacters, noCharacters } = body;

    // Verify project access (owner or shared member via RLS)
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get characters with their available poses/emotions (skip if noCharacters)
    let characterData: { id: string; name: string; personality: string; description: string; available_emotions: string[] }[] = [];
    let characters: Record<string, unknown>[] | null = null;

    if (!noCharacters) {
      const { data: charRows } = await supabase
        .from("characters")
        .select("*, character_poses(*)")
        .eq("project_id", project_id);

      characters = charRows;
      characterData = (charRows || []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        name: c.name as string,
        personality: c.personality as string,
        description: c.description as string,
        available_emotions: ((c.character_poses as { emotion: string }[]) || []).map(
          (p) => p.emotion
        ),
      }));
    }

    // Generate meme content with Gemini
    const results = await generateMemeContent({
      idea: tone ? `${idea} (Tone: ${tone})` : idea,
      projectStyle: project.style_prompt || undefined,
      characters: characterData,
      adHocCharacters: noCharacters ? [] : adHocCharacters,
      noCharacters: noCharacters || false,
      numVariations: num_variations || 3,
      referenceImages,
    });

    // Map suggested emotions to actual pose IDs
    const enrichedResults = results.map((result) => {
      const enrichedCharacters = result.suggested_characters.map((sc) => {
        const char = characters?.find((c: Record<string, unknown>) => c.id === sc.character_id);
        const poses = (char?.character_poses as { id: string; emotion: string; name: string }[]) || [];
        // Find matching pose by emotion, fallback to first pose
        const matchingPose =
          poses.find((p) => p.emotion === sc.suggested_emotion) ||
          poses[0];

        return {
          ...sc,
          pose_id: matchingPose?.id || null,
          pose_name: matchingPose?.name || null,
        };
      });

      return { ...result, suggested_characters: enrichedCharacters };
    });

    return NextResponse.json({ variations: enrichedResults });
  } catch (error) {
    console.error("Generate content error:", error);

    const rawMessage = error instanceof Error ? error.message : "";

    // Sanitize: never leak model names or internal details to frontend
    let userMessage = "Không thể tạo nội dung. Vui lòng thử lại.";

    if (rawMessage.includes("not configured") || rawMessage.includes("AI_KEY_NOT_CONFIGURED")) {
      userMessage = "Hệ thống AI chưa được cấu hình. Vui lòng liên hệ admin.";
    } else if (rawMessage.includes("SAFETY") || rawMessage.includes("blocked")) {
      userMessage = "Nội dung bị từ chối bởi bộ lọc an toàn. Vui lòng thử ý tưởng khác.";
    } else if (rawMessage.includes("quota") || rawMessage.includes("rate limit") || rawMessage.includes("429")) {
      userMessage = "Hệ thống đang quá tải. Vui lòng thử lại sau ít phút.";
    }

    return NextResponse.json(
      { error: userMessage },
      { status: 500 }
    );
  }
}
