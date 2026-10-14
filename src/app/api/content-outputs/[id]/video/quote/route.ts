import { signClipQuote } from "@/lib/clip-quote-auth";
import { ClipDubbingError, resolveClipDubbing } from "@/lib/clip-dubbing";
import { getSupabaseAdmin } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { quoteSeedanceVideo } from "@/lib/wavespeed";
import type { VideoRequest } from "@/lib/wavespeed";
import {
  seedanceVariant,
  validSeedanceDuration,
} from "@/lib/video-models";

function validInput(body: Record<string, unknown>) {
  const mode =
    body.mode === "text" || body.mode === "image" ? body.mode : "image";
  return (
    typeof body.prompt === "string" &&
    body.prompt.trim().length > 0 &&
    (mode === "text" || typeof body.image === "string") &&
    validSeedanceDuration(body.duration, body.model) &&
    ["720p", "1080p"].includes(String(body.resolution)) &&
    (mode !== "text" ||
      ["9:16", "1:1", "16:9"].includes(String(body.aspect_ratio ?? "9:16")))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user)
    return NextResponse.json(
      { error: "Phiên đăng nhập đã hết hạn." },
      { status: 401 },
    );
  const body = await request.json();
  if (!validInput(body))
    return NextResponse.json(
      { error: "Thiếu mô tả hoặc ảnh mở đầu cho video." },
      { status: 400 },
    );
  const { data: output } = await supabase
    .from("content_outputs")
    .select("id, kind, content_sets!inner(project_id)")
    .eq("id", id)
    .maybeSingle();
  if (!output || output.kind !== "video")
    return NextResponse.json(
      { error: "Không tìm thấy video này." },
      { status: 404 },
    );
  try {
    const mode: VideoRequest["mode"] = body.mode === "text" ? "text" : "image";
    const config: VideoRequest = {
      model: seedanceVariant(body.model),
      mode,
      prompt: body.prompt.trim(),
      image: typeof body.image === "string" ? body.image : undefined,
      lastImage:
        typeof body.last_image === "string" ? body.last_image : undefined,
      referenceImages: Array.isArray(body.reference_images)
        ? body.reference_images
            .filter((url: unknown): url is string => typeof url === "string")
            .slice(0, 30)
        : undefined,
      aspectRatio:
        body.aspect_ratio === "1:1" || body.aspect_ratio === "16:9"
          ? body.aspect_ratio
          : "9:16",
      duration: Number(body.duration),
      resolution: body.resolution as "720p" | "1080p",
      generateAudio: false,
    };
    const parent = output.content_sets as unknown as { project_id: string };
    const dubbing = await resolveClipDubbing(
      parent.project_id,
      body.dubbing,
      config.duration,
    );
    if (body.generate_audio !== false && !dubbing)
      throw new ClipDubbingError("Nhập lời lồng tiếng và chọn người nói nhé.");
    const baseQuote = await quoteSeedanceVideo(config);
    const quote = {
      ...baseQuote,
      customerPoints: baseQuote.customerPoints + (dubbing?.points || 0),
      dubbingPoints: dubbing?.points || 0,
      providerCostUsd:
        baseQuote.providerCostUsd + (dubbing?.providerCostUsd || 0),
    };
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const signature = signClipQuote({ outputId: id, expiresAt, customerPoints: quote.customerPoints, providerCostUsd: quote.providerCostUsd, config, dubbing });
    const { error: saveError } = await supabase
      .from("content_outputs")
      .update({
        quote_snapshot: { ...quote, config, dubbing, signature },
        quote_expires_at: expiresAt,
      })
      .eq("id", id);
    if (saveError)
      return NextResponse.json(
        { error: "Chưa tính được giá. Bạn thử lại nhé." },
        { status: 500 },
      );
    return NextResponse.json({
      quote,
      expiresAt,
      available: await availablePoints(parent.project_id, user.id),
    });
  } catch (error) {
    // Lỗi của nhà cung cấp (mã tiếng Anh, hết thời gian chờ) không nói được gì
    // với chủ fanpage; chỉ lỗi lồng tiếng là thứ họ tự sửa được.
    if (error instanceof ClipDubbingError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Video quote failed:", error);
    return NextResponse.json(
      { error: "Chưa tính được giá. Bạn thử lại sau ít phút nhé." },
      { status: 503 },
    );
  }
}

/**
 * Số điểm dùng được cho video này: điểm của kênh, cộng điểm ví của chủ kênh vì
 * lúc trừ điểm sẽ tự chuyển phần thiếu sang (xem `spendProjectPoints`). Không
 * đọc được thì bỏ trống để dòng giá không báo thiếu sai.
 */
async function availablePoints(projectId: string, userId: string) {
  try {
    const admin = getSupabaseAdmin();
    const [{ data: project }, { data: wallet }] = await Promise.all([
      admin.from("projects").select("user_id").eq("id", projectId).maybeSingle(),
      admin.from("project_wallets").select("points").eq("project_id", projectId).maybeSingle(),
    ]);
    let points = Number(wallet?.points ?? 0);
    if (project?.user_id === userId) {
      const { data: own } = await admin.from("wallets").select("points").eq("user_id", userId).maybeSingle();
      points += Number(own?.points ?? 0);
    }
    return points;
  } catch {
    return null;
  }
}
