import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { quoteSeedanceVideo } from "@/lib/wavespeed";
import type { VideoRequest } from "@/lib/wavespeed";

function validInput(body: Record<string, unknown>) {
  const mode = body.mode === "text" || body.mode === "image" ? body.mode : "image";
  return typeof body.prompt === "string" && body.prompt.trim().length > 0
    && (mode === "text" || typeof body.image === "string")
    && [5, 10, 15, 30].includes(Number(body.duration)) && ["720p", "1080p"].includes(String(body.resolution))
    && (mode !== "text" || ["9:16", "1:1", "16:9"].includes(String(body.aspect_ratio ?? "9:16")));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  if (!validInput(body)) return NextResponse.json({ error: "Cấu hình video không hợp lệ." }, { status: 400 });
  const { data: output } = await supabase.from("content_outputs").select("id, kind").eq("id", id).maybeSingle();
  if (!output || output.kind !== "video") return NextResponse.json({ error: "Không tìm thấy đầu ra video." }, { status: 404 });
  try {
    const mode: VideoRequest["mode"] = body.mode === "text" ? "text" : "image";
    const config: VideoRequest = {
      mode,
      prompt: body.prompt.trim(),
      image: typeof body.image === "string" ? body.image : undefined,
      lastImage: typeof body.last_image === "string" ? body.last_image : undefined,
      referenceImages: Array.isArray(body.reference_images) ? body.reference_images.filter((url: unknown): url is string => typeof url === "string").slice(0, 30) : undefined,
      aspectRatio: body.aspect_ratio === "1:1" || body.aspect_ratio === "16:9" ? body.aspect_ratio : "9:16",
      duration: Number(body.duration) as 5 | 10 | 15 | 30,
      resolution: body.resolution as "720p" | "1080p",
      generateAudio: body.generate_audio !== false,
    };
    const quote = await quoteSeedanceVideo(config);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error: saveError } = await supabase.from("content_outputs").update({ quote_snapshot: { ...quote, config }, quote_expires_at: expiresAt }).eq("id", id);
    if (saveError) return NextResponse.json({ error: "Không lưu được báo giá video." }, { status: 500 });
    return NextResponse.json({ quote, expiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không lấy được báo giá video." }, { status: 503 });
  }
}
