import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });

  const projectQuery = supabase.from("projects").select("id").limit(1);
  const { data: project } = UUID.test(id)
    ? await projectQuery.eq("id", id).maybeSingle()
    : await projectQuery.eq("slug", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });

  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [characters, recentMemes, characterCount, outputCount, weeklyOutputCount, activeJobs] = await Promise.all([
    supabase.from("characters").select("id, name, avatar_url, character_poses(id, image_url)").eq("project_id", project.id).order("created_at", { ascending: false }).limit(4),
    supabase.from("memes").select("id, title, original_idea, generated_content, image_url").eq("project_id", project.id).order("created_at", { ascending: false }).limit(4),
    supabase.from("characters").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    supabase.from("memes").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    supabase.from("memes").select("id", { count: "exact", head: true }).eq("project_id", project.id).gt("created_at", week),
    supabase.from("generation_jobs").select("id, status, creation_kind, created_at").eq("project_id", project.id).in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(5),
  ]);

  const error = characters.error || recentMemes.error || characterCount.error || outputCount.error || weeklyOutputCount.error || activeJobs.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    characterCount: characterCount.count ?? 0,
    outputCount: outputCount.count ?? 0,
    weeklyOutputCount: weeklyOutputCount.count ?? 0,
    characters: (characters.data ?? []).map((character) => ({ ...character, poses: character.character_poses ?? [] })),
    recentOutputs: recentMemes.data ?? [],
    activeJobs: activeJobs.data ?? [],
  }, { headers: { "Server-Timing": `overview;dur=${(performance.now() - startedAt).toFixed(1)}` } });
}
