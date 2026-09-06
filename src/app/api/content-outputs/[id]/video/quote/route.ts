import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { quoteSeedanceVideo } from "@/lib/wavespeed";

function validInput(body: Record<string, unknown>) {
  return typeof body.prompt === "string" && typeof body.image === "string" && [15, 30].includes(Number(body.duration)) && ["720p", "1080p"].includes(String(body.resolution));
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
    const quote = await quoteSeedanceVideo({ prompt: body.prompt.trim(), image: body.image, duration: Number(body.duration) as 15 | 30, resolution: body.resolution, generateAudio: body.generate_audio !== false });
    return NextResponse.json({ quote, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không lấy được báo giá video." }, { status: 503 });
  }
}
