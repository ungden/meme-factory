import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { suggestChannelFromIdea } from "@/lib/gemini";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { channelFromSuggestion } from "@/lib/channel-draft";

/**
 * Điền hồ sơ kênh từ vài câu mô tả. Không ghi gì và không tính điểm: chỉ là một
 * lượt gọi chữ ngắn, người dùng còn sửa trước khi bấm tạo kênh.
 */
export async function POST(request: NextRequest) {
  const { user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const throttle = await checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.channelDraft, user.id);
  if (!throttle.allowed) return NextResponse.json({ error: rateLimitMessage(throttle) }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const idea = String(body?.description || "").trim().slice(0, 1000);
  if (idea.length < 6) return NextResponse.json({ error: "Tả kênh dài hơn một chút để AI hiểu." }, { status: 400 });
  try {
    const channel = channelFromSuggestion(await suggestChannelFromIdea({ idea }));
    if (!channel) return NextResponse.json({ error: "AI chưa điền được. Hãy thử lại hoặc tự điền." }, { status: 502 });
    return NextResponse.json({ channel });
  } catch (error) {
    console.error("Channel draft error:", error);
    return NextResponse.json({ error: "AI chưa điền được. Hãy thử lại hoặc tự điền." }, { status: 502 });
  }
}
