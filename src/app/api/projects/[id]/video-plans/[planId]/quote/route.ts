import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { buildScenePrompt, sceneVideoRequest, totalSceneDuration, type SceneCast } from "@/lib/multiscene-video";
import { quoteSeedanceVideo } from "@/lib/wavespeed";

async function planForUser(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], planId: string) {
  return supabase.from("video_plans").select("*, video_plan_scenes(*)").eq("id", planId).maybeSingle();
}

async function projectMediaUrls(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], projectId: string) {
  const [characters, memes, outputs] = await Promise.all([
    supabase.from("characters").select("avatar_url, character_poses(image_url)").eq("project_id", projectId),
    supabase.from("memes").select("image_url").eq("project_id", projectId),
    supabase.from("content_outputs").select("media_url, poster_url, content_sets!inner(project_id)").eq("content_sets.project_id", projectId),
  ]);
  const urls = new Set<string>();
  for (const character of characters.data ?? []) { if (character.avatar_url) urls.add(character.avatar_url); for (const pose of character.character_poses ?? []) if (pose.image_url) urls.add(pose.image_url); }
  for (const meme of memes.data ?? []) if (meme.image_url) urls.add(meme.image_url);
  for (const output of outputs.data ?? []) { if (output.media_url) urls.add(output.media_url); if (output.poster_url) urls.add(output.poster_url); }
  return urls;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { planId } = await params; const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data: plan } = await planForUser(supabase, planId);
  if (!plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch video." }, { status: 404 });
  if (Number(body.expectedVersion) !== plan.version) return NextResponse.json({ error: "Kế hoạch đã thay đổi. Hãy tải lại trước khi báo giá.", code: "VERSION_CONFLICT" }, { status: 409 });
  const scenes = [...(plan.video_plan_scenes ?? [])].sort((a, b) => a.scene_index - b.scene_index);
  if (!scenes.length) return NextResponse.json({ error: "Kế hoạch chưa có cảnh." }, { status: 400 });
  const missingStartImages = scenes.filter((scene) => !scene.start_image_url).map((scene) => ({ sceneId: scene.id, sceneIndex: scene.scene_index, imagePrompt: scene.image_prompt || "" }));
  if (missingStartImages.length) return NextResponse.json({ error: "Hãy duyệt và tạo hoặc chọn ảnh đầu cho các cảnh còn thiếu trước khi báo giá video.", code: "START_IMAGES_REQUIRED", missingStartImages }, { status: 409 });
  const permittedUrls = await projectMediaUrls(supabase, plan.project_id);
  const cast = (plan.cast_snapshot ?? []) as SceneCast[];
  const resolution = plan.resolution as "720p" | "1080p";
  const configHash = JSON.stringify({ planId: plan.id, version: plan.version, resolution, audio: plan.generate_audio, scenes: scenes.map((scene) => [scene.id, scene.start_image_url, scene.end_image_url, scene.duration_seconds, scene.dialogue, scene.action, scene.setting, scene.cast_snapshot, scene.speaker_character_id]) });
  try {
    const quoted = await Promise.all(scenes.map(async (scene) => {
      if (!permittedUrls.has(scene.start_image_url) || (scene.end_image_url && !permittedUrls.has(scene.end_image_url))) throw new Error(`Ảnh của cảnh ${scene.scene_index + 1} không thuộc dự án.`);
      const sceneCast = Array.isArray(scene.cast_snapshot) ? scene.cast_snapshot as SceneCast[] : cast;
      const prompt = buildScenePrompt({ dialogue: scene.dialogue, action: scene.action, setting: scene.setting }, sceneCast, scene.speaker_character_id);
      const requestInput = sceneVideoRequest({ prompt, startImageUrl: scene.start_image_url, endImageUrl: scene.end_image_url, durationSeconds: scene.duration_seconds }, resolution, plan.generate_audio);
      const quote = await quoteSeedanceVideo(requestInput);
      return { sceneId: scene.id, sceneIndex: scene.scene_index, prompt, request: requestInput, quote };
    }));
    const totals = quoted.reduce((total, item) => ({ customerPoints: total.customerPoints + item.quote.customerPoints, providerCostUsd: total.providerCostUsd + item.quote.providerCostUsd, customerVnd: total.customerVnd + item.quote.customerVnd }), { customerPoints: 0, providerCostUsd: 0, customerVnd: 0 });
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const quoteSnapshot = { version: plan.version, configHash, totals, renderPoints: 0, renderProviderCostUsd: 0, scenes: quoted.map(({ sceneId, sceneIndex, prompt, request: requestInput, quote }) => ({ sceneId, sceneIndex, prompt, request: requestInput, quote })) };
    const { error: sceneError } = await Promise.all(quoted.map((item) => supabase.from("video_plan_scenes").update({ prompt: item.prompt, quote_snapshot: item.quote, status: "quoted" }).eq("id", item.sceneId))).then((results) => ({ error: results.find((result) => result.error)?.error }));
    if (sceneError) throw new Error(sceneError.message);
    const { error } = await supabase.from("video_plans").update({ status: "quoted", quote_snapshot: quoteSnapshot, quote_expires_at: expiresAt }).eq("id", plan.id).eq("version", plan.version);
    if (error) throw new Error(error.message);
    return NextResponse.json({ quote: { ...totals, renderPoints: 0, totalDurationSeconds: totalSceneDuration(scenes) }, expiresAt, planVersion: plan.version });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể báo giá video nhiều cảnh." }, { status: 503 }); }
}
