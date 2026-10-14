import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { suggestCharactersForFanpage } from "@/lib/gemini";
import { getSupabaseAdmin } from "@/lib/admin";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé." }, { status: 401 });
    }

    const throttle = await checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.suggestCharacters, user.id);
    if (!throttle.allowed)
      return NextResponse.json(
        { error: rateLimitMessage(throttle) },
        { status: 429, headers: { "retry-after": String(Math.ceil(throttle.resetIn)) } },
      );

    const body = await request.json();
    const project_id = String(body?.project_id || "");
    const fanpage_description = String(body?.fanpage_description || "").trim();
    const count = Number(body?.count || 4);

    if (!project_id || !fanpage_description) {
      return NextResponse.json({ error: "Tả kênh của bạn vài câu để có gợi ý nhân vật." }, { status: 400 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(project_id);
    const projectQuery = supabase.from("projects").select("id, style_prompt").limit(1);
    const { data: project } = isUuid
      ? await projectQuery.eq("id", project_id).maybeSingle()
      : await projectQuery.eq("slug", project_id).maybeSingle();

    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy kênh, hoặc bạn không còn quyền vào kênh này." }, { status: 404 });
    }

    const suggestions = await suggestCharactersForFanpage({
      fanpageDescription: fanpage_description,
      projectStyle: project.style_prompt || undefined,
      count,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Suggest characters error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate limit")) {
      return NextResponse.json(
        { error: "Hôm nay AIDA đã nhận quá nhiều yêu cầu. Bạn thử lại sau vài giờ nhé." },
        { status: 429 }
      );
    }
    if (msg.includes("AI_KEY_NOT_CONFIGURED") || msg.includes("not configured")) {
      return NextResponse.json(
        { error: "Tính năng gợi ý đang tạm nghỉ. Bạn thử lại sau nhé." },
        { status: 503 }
      );
    }
    // Chi tiết lỗi đã nằm trong log ở trên; không gửi nguyên văn lỗi máy cho người dùng.
    return NextResponse.json({ error: "Chưa gợi ý được nhân vật. Bạn thử lại nhé." }, { status: 500 });
  }
}
