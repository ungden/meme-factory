import { NextRequest, NextResponse } from "next/server";
import { access, fail } from "@/lib/short-film/server";
import { suggestCastForChannel } from "@/lib/gemini";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { castFromSuggestion, isChannelLook } from "@/lib/channel-draft";

/** AI gợi ý nhân vật hợp với hồ sơ kênh. Chỉ là chữ: chưa tạo gì, chưa tính điểm. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(request, (await params).id);
    const throttle = await checkRateLimit(a.admin, RATE_LIMITS.suggestCharacters, a.user.id);
    if (!throttle.allowed) return NextResponse.json({ error: rateLimitMessage(throttle) }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const look = isChannelLook(body?.look) ? body.look : "animated";
    const count = Math.min(4, Math.max(1, Number(body?.count) || 3));
    const { data: existing } = await a.admin.from("characters").select("name").eq("project_id", a.project.id);
    const names = (existing || []).map((row) => String(row.name));
    const channel = [
      `"${a.project.name}"`,
      a.project.audience && `Người xem: ${a.project.audience}.`,
      a.project.brand_voice && `Giọng kể: ${a.project.brand_voice}.`,
      a.project.content_guidelines && `Ghi chú: ${a.project.content_guidelines}.`,
    ]
      .filter(Boolean)
      .join(" ");
    const { data: project } = await a.admin.from("projects").select("description").eq("id", a.project.id).single();
    const raw = await suggestCastForChannel({
      channel: [channel, project?.description && `Kênh kể: ${project.description}`].filter(Boolean).join(" "),
      look,
      existing: names,
      count,
    });
    return NextResponse.json({ characters: castFromSuggestion(raw, names, count) });
  } catch (error) {
    return fail(error);
  }
}
