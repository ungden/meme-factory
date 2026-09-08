import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { jobId } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: job, error } = await supabase.from("creative_assists").select("id, kind, status, result, error, created_at, completed_at").eq("id", jobId).maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Không tìm thấy lượt soạn AI." }, { status: 404 });
  return NextResponse.json({ job });
}
