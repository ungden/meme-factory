import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { DEFAULT_SCENE_COUNT, MAX_SCENES, MULTISCENE_FORMATS, MULTISCENE_RESOLUTIONS, normalizeScene, type SceneInput } from "@/lib/multiscene-video";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function projectForRef(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], ref: string) {
  const query = supabase.from("projects").select("id, workspace_version").limit(1);
  return UUID.test(ref) ? query.eq("id", ref).maybeSingle() : query.eq("slug", ref).maybeSingle();
}

function defaultScenes(): SceneInput[] {
  return Array.from({ length: DEFAULT_SCENE_COUNT }, (_, index) => ({ action: index === 0 ? "Mở đầu tình huống" : "Diễn biến câu chuyện", durationSeconds: 5 }));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: project } = await projectForRef(supabase, id);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const { data, error } = await supabase.from("video_plans").select("*, video_plan_scenes(*)").eq("project_id", project.id).order("updated_at", { ascending: false }).limit(24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const plans = (data ?? []).map((plan) => ({ ...plan, video_plan_scenes: [...(plan.video_plan_scenes ?? [])].sort((a, b) => a.scene_index - b.scene_index) }));
  return NextResponse.json({ plans, workspaceVersion: project.workspace_version });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: project } = await projectForRef(supabase, id);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const sceneInput = Array.isArray(body.scenes) && body.scenes.length ? body.scenes : defaultScenes();
  if (sceneInput.length > MAX_SCENES) return NextResponse.json({ error: `Tối đa ${MAX_SCENES} cảnh cho một video.` }, { status: 400 });
  const castIds = [...new Set(sceneInput.flatMap((scene: SceneInput) => normalizeScene(scene).characterIds))];
  if (castIds.length > 4) return NextResponse.json({ error: "Mỗi video dùng tối đa bốn nhân vật." }, { status: 400 });
  const { data: characters, error: characterError } = castIds.length
    ? await supabase.from("characters").select("id, name, description, personality, avatar_url, continuity_asset_id, character_poses(image_url)").eq("project_id", project.id).in("id", castIds)
    : { data: [], error: null };
  if (characterError || (characters ?? []).length !== castIds.length) return NextResponse.json({ error: "Một hoặc nhiều nhân vật không thuộc dự án này." }, { status: 400 });
  const castSnapshot = (characters ?? []).map((character) => ({
    characterId: character.id, name: character.name, description: character.description, personality: character.personality,
    imageUrl: character.avatar_url || character.character_poses?.[0]?.image_url || null, assetVersionId: character.continuity_asset_id ?? null,
  }));
  if (castSnapshot.some((character) => !character.imageUrl)) return NextResponse.json({ error: "Mỗi nhân vật trong video cần một ảnh chuẩn đã duyệt." }, { status: 400 });
  const format = MULTISCENE_FORMATS.includes(body.format) ? body.format : "9:16";
  const resolution = MULTISCENE_RESOLUTIONS.includes(body.resolution) ? body.resolution : "720p";
  const { data: plan, error } = await supabase.from("video_plans").insert({
    project_id: project.id, title: typeof body.title === "string" ? body.title.trim().slice(0, 160) || "Video nhiều cảnh" : "Video nhiều cảnh",
    brief: typeof body.brief === "string" ? body.brief.trim().slice(0, 4000) : "", format, resolution, generate_audio: body.generateAudio !== false,
    cast_snapshot: castSnapshot, created_by: user.id,
  }).select().single();
  if (error || !plan) return NextResponse.json({ error: error?.message || "Không tạo được kế hoạch video." }, { status: 500 });
  const sceneRows = sceneInput.map((source: SceneInput, sceneIndex: number) => {
    const scene = normalizeScene(source);
    const sceneCast = castSnapshot.filter((character) => scene.characterIds.includes(character.characterId));
    return { video_plan_id: plan.id, scene_index: sceneIndex, cast_snapshot: sceneCast, speaker_character_id: scene.speakerCharacterId,
      dialogue: scene.dialogue, action: scene.action, setting: scene.setting, duration_seconds: scene.durationSeconds, start_image_url: scene.startImageUrl, end_image_url: scene.endImageUrl, follows_previous: scene.followsPrevious };
  });
  const { data: scenes, error: sceneError } = await supabase.from("video_plan_scenes").insert(sceneRows).select();
  if (sceneError) { await supabase.from("video_plans").delete().eq("id", plan.id); return NextResponse.json({ error: sceneError.message }, { status: 500 }); }
  return NextResponse.json({ plan: { ...plan, video_plan_scenes: scenes }, workspaceVersion: project.workspace_version }, { status: 201 });
}
