import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { channelFromSuggestion, isChannelLook, projectFields, slugifyProjectName } from "@/lib/channel-draft";

/**
 * Tạo kênh từ hồ sơ người dùng đã xem lại. Chỉ tạo kênh: nhân vật là bước kế
 * tiếp, có ảnh chuẩn rồi mới làm nội dung.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const throttle = await checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.createChannel, user.id);
  if (!throttle.allowed) return NextResponse.json({ error: rateLimitMessage(throttle) }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const draft = channelFromSuggestion(body);
  if (!draft) return NextResponse.json({ error: "Đặt tên cho kênh." }, { status: 400 });
  if (isChannelLook(body?.look)) draft.look = body.look;
  const fields = projectFields(draft);
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      ...fields,
      slug: `${slugifyProjectName(fields.name)}-${crypto.randomUUID().slice(0, 8)}`,
    })
    .select("id,slug,name,workspace_version")
    .single();
  if (error || !project) return NextResponse.json({ error: "Chưa tạo được kênh. Hãy thử lại." }, { status: 500 });
  return NextResponse.json({ project, look: draft.look }, { status: 201 });
}
