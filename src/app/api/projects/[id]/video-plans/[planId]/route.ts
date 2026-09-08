import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { MAX_SCENES, normalizeScene, type SceneInput } from "@/lib/multiscene-video";

async function planForUser(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], planId: string) {
  return supabase.from("video_plans").select("*, video_plan_scenes(*)").eq("id", planId).maybeSingle();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { planId } = await params; const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: plan, error } = await planForUser(supabase, planId);
  if (error || !plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch video." }, { status: 404 });
  return NextResponse.json({ plan: { ...plan, video_plan_scenes: [...(plan.video_plan_scenes ?? [])].sort((a, b) => a.scene_index - b.scene_index) } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { planId } = await params; const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data: plan } = await planForUser(supabase, planId);
  if (!plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch video." }, { status: 404 });
  if (!["draft", "quoted"].includes(plan.status)) return NextResponse.json({ error: "Kế hoạch đang chạy không thể sửa. Hãy tạo phiên bản mới." }, { status: 409 });
  if (Number(body.expectedVersion) !== plan.version) return NextResponse.json({ error: "Kế hoạch đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.", code: "VERSION_CONFLICT", plan }, { status: 409 });
  const inputs = Array.isArray(body.scenes) ? body.scenes as SceneInput[] : null;
  if (!inputs || !inputs.length || inputs.length > MAX_SCENES) return NextResponse.json({ error: `Cần từ 1 đến ${MAX_SCENES} cảnh.` }, { status: 400 });
  const cast = Array.isArray(plan.cast_snapshot) ? plan.cast_snapshot as Array<{ characterId: string }> : [];
  const castIds = new Set(cast.map((item) => item.characterId));
  const rows = inputs.map((raw, scene_index) => {
    const scene = normalizeScene(raw);
    if (scene.characterIds.some((characterId) => !castIds.has(characterId)) || (scene.speakerCharacterId && !castIds.has(scene.speakerCharacterId))) throw new Error("Cảnh dùng nhân vật không có trong cast đã duyệt.");
    return { video_plan_id: plan.id, scene_index, version: plan.version + 1, cast_snapshot: cast.filter((character) => scene.characterIds.includes(character.characterId)), speaker_character_id: scene.speakerCharacterId, dialogue: scene.dialogue, action: scene.action, setting: scene.setting, duration_seconds: scene.durationSeconds, start_image_url: scene.startImageUrl, end_image_url: scene.endImageUrl, follows_previous: scene.followsPrevious };
  });
  try {
    await supabase.from("video_plan_scenes").delete().eq("video_plan_id", plan.id);
    const { error: sceneError } = await supabase.from("video_plan_scenes").insert(rows);
    if (sceneError) throw new Error(sceneError.message);
    const { data: updated, error } = await supabase.from("video_plans").update({ title: typeof body.title === "string" ? body.title.trim().slice(0, 160) || plan.title : plan.title, brief: typeof body.brief === "string" ? body.brief.trim().slice(0, 4000) : plan.brief, version: plan.version + 1, status: "draft", quote_snapshot: null, quote_expires_at: null }).eq("id", plan.id).eq("version", plan.version).select("*, video_plan_scenes(*)").single();
    if (error || !updated) throw new Error(error?.message || "Không lưu được phiên bản kế hoạch mới.");
    return NextResponse.json({ plan: { ...updated, video_plan_scenes: [...(updated.video_plan_scenes ?? [])].sort((a, b) => a.scene_index - b.scene_index) } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không lưu được kế hoạch." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { planId } = await params; const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: plan } = await planForUser(supabase, planId);
  if (!plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch video." }, { status: 404 });
  if (!["draft", "quoted"].includes(plan.status)) return NextResponse.json({ error: "Không thể xoá kế hoạch đang chạy." }, { status: 409 });
  const { error } = await supabase.from("video_plans").delete().eq("id", planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
