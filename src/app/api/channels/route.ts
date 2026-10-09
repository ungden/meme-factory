import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { suggestChannelFromIdea, suggestCharactersForFanpage } from "@/lib/gemini";
import { RATE_LIMITS, checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import {
  CONTENT_FIELDS,
  channelFromSuggestion,
  characterFromSuggestion,
  fallbackChannelName,
  fanpageBrief,
  projectDraft,
  slugifyProjectName,
} from "@/lib/channel-draft";

export const maxDuration = 60;

/**
 * Người chưa có kênh gõ ý tưởng ở trang chính: AI đặt tên kênh, chọn người xem
 * và nghĩ hai nhân vật, rồi tạo kênh ngay — không có bước khởi tạo nào hỏi
 * người dùng. Hai lượt gọi AI ở đây chỉ là chữ ngắn nên không tính điểm; vẽ
 * nhân vật là việc tốn tiền và xảy ra sau, ở nơi người dùng thấy giá.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const throttle = await checkRateLimit(getSupabaseAdmin(), RATE_LIMITS.createChannel, user.id);
  if (!throttle.allowed) return NextResponse.json({ error: rateLimitMessage(throttle) }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const idea = String(body?.idea || "").trim().slice(0, 1000);
  if (idea.length < 10) return NextResponse.json({ error: "Gõ ý tưởng dài hơn một chút để AI dựng kênh." }, { status: 400 });

  // AI không trả lời được thì vẫn tạo kênh với tên tạm: chặn người dùng ở đây
  // là bắt họ quay lại một bước khởi tạo mà sản phẩm đã bỏ.
  const channel =
    channelFromSuggestion(
      await suggestChannelFromIdea({ idea, fields: CONTENT_FIELDS.map(({ id, label }) => ({ id, label })) }).catch(() => null),
    ) || { name: fallbackChannelName(idea), fieldId: "khac", audience: "" };
  const draft = projectDraft({ ...channel, idea });
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      ...draft,
      audience: channel.audience || null,
      slug: `${slugifyProjectName(draft.name)}-${crypto.randomUUID().slice(0, 8)}`,
    })
    .select("id,slug,name,workspace_version")
    .single();
  if (error || !project)
    return NextResponse.json({ error: "Chưa tạo được kênh. Hãy thử lại." }, { status: 500 });

  const suggestions = await suggestCharactersForFanpage({
    fanpageDescription: fanpageBrief({ ...channel, idea }),
    projectStyle: draft.style_prompt,
    count: 2,
  }).catch(() => []);
  const rows = suggestions
    .map(characterFromSuggestion)
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({ project_id: project.id, ...row }));
  const { data: characters } = rows.length
    ? await supabase.from("characters").insert(rows).select("id")
    : { data: [] };

  return NextResponse.json(
    {
      project,
      audience: channel.audience,
      characterIds: (characters || []).map((character) => character.id),
    },
    { status: 201 },
  );
}
