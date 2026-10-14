import { NextRequest, NextResponse } from "next/server";
import { generateMemeContent } from "@/lib/gemini";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { checkRateLimit, RATE_LIMITS, rateLimitMessage } from "@/lib/rate-limit";
import type { GenerateContentRequest } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getRequestUser(request);
    
    if (!user) {
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé." }, { status: 401 });
    }
    const [minute, day] = await Promise.all([
      checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.generateContentMinute, user.id),
      checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.generateContentDay, user.id),
    ]);
    const limited = !minute.allowed ? minute : !day.allowed ? day : null;
    if (limited)
      return NextResponse.json(
        { error: rateLimitMessage(limited), code: "RATE_LIMITED" },
        { status: 429, headers: { "retry-after": String(Math.ceil(limited.resetIn)) } },
      );

    const body = (await request.json()) as GenerateContentRequest & { noCharacters?: boolean; selected_character_ids?: string[]; content_set_id?: string };
    const { project_id, idea, tone, num_variations, referenceImages, adHocCharacters, noCharacters } = body;

    // Verify project access (owner or shared member via RLS)
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy kênh hoặc bạn không còn quyền với kênh này." }, { status: 404 });
    }

    // Get characters with their available poses/emotions (skip if noCharacters)
    const selectedIds = [...new Set((body.selected_character_ids ?? []).filter((id): id is string => typeof id === "string"))];
    let characterData: { id: string; name: string; personality: string; description: string; available_emotions: string[] }[] = [];
    let characters: Record<string, unknown>[] | null = null;

    if (!noCharacters && selectedIds.length) {
      const { data: charRows } = await supabase.from("characters").select("*, character_poses(*)").eq("project_id", project_id).in("id", selectedIds);

      if (selectedIds.length && (charRows?.length ?? 0) !== selectedIds.length) {
        return NextResponse.json({ error: "Nhân vật đã chọn không còn thuộc kênh này." }, { status: 400 });
      }

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
    let editorialContext = project.style_prompt || "";
    if (body.content_set_id) {
      const { data: set } = await supabase.from("content_sets").select("brand_snapshot, selected_character_ids").eq("id", body.content_set_id).eq("project_id", project_id).maybeSingle();
      if (!set) return NextResponse.json({ error: "Ý tưởng này không thuộc kênh hiện tại. Bạn tải lại trang nhé." }, { status: 400 });
      const brand = (set.brand_snapshot ?? {}) as Record<string, string>;
      editorialContext = [editorialContext, brand.voice && `Giọng viết: ${brand.voice}`, brand.audience && `Đối tượng đọc: ${brand.audience}`, brand.guidelines && `Hướng dẫn nội dung: ${brand.guidelines}`].filter(Boolean).join("\n");
    }
    const results = await generateMemeContent({
      idea: tone ? `${idea} (Tone: ${tone})` : idea,
      projectStyle: editorialContext || undefined,
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
    let userMessage = "Chưa viết được. Bạn thử lại nhé.";

    if (rawMessage.includes("not configured") || rawMessage.includes("AI_KEY_NOT_CONFIGURED")) {
      userMessage = "Chức năng viết đang tạm dừng. Bạn quay lại sau nhé.";
    } else if (rawMessage.includes("SAFETY") || rawMessage.includes("blocked")) {
      userMessage = "Nội dung này bị bộ lọc an toàn chặn. Bạn thử ý tưởng khác nhé.";
    } else if (rawMessage.includes("quota") || rawMessage.includes("rate limit") || rawMessage.includes("429")) {
      userMessage = "Đang có quá nhiều người dùng cùng lúc. Bạn thử lại sau ít phút nhé.";
    }

    return NextResponse.json(
      { error: userMessage },
      { status: 500 }
    );
  }
}
