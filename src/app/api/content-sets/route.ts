import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";

async function projectForRef(supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"], ref: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref);
  return (isUuid ? supabase.from("projects").select("*").eq("id", ref) : supabase.from("projects").select("*").eq("slug", ref)).maybeSingle();
}

export async function GET(request: NextRequest) {
  const projectRef = request.nextUrl.searchParams.get("project");
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  if (!projectRef) return NextResponse.json({ error: "Thiếu project." }, { status: 400 });
  const { data: project } = await projectForRef(supabase, projectRef);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
  const { data, error } = await supabase.from("content_sets").select("*, content_outputs(*)").eq("project_id", project.id).order("updated_at", { ascending: false }).limit(24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contentSets: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  if (typeof body.project_id !== "string" || typeof body.brief !== "string") return NextResponse.json({ error: "Thiếu dự án hoặc ý tưởng." }, { status: 400 });
  const { data: project } = await projectForRef(supabase, body.project_id);
  if (!project) return NextResponse.json({ error: "Bạn không có quyền với dự án này." }, { status: 403 });
  const selectedCharacterIds = Array.isArray(body.selected_character_ids) ? [...new Set(body.selected_character_ids.filter((id: unknown) => typeof id === "string"))] : [];
  const { data: characterRows, error: characterError } = selectedCharacterIds.length
    ? await supabase
      .from("characters")
      .select("id, name, description, personality, avatar_url, continuity_asset_id, character_poses(id, name, emotion, image_url)")
      .eq("project_id", project.id)
      .in("id", selectedCharacterIds)
    : { data: [], error: null };
  if (characterError || (characterRows?.length ?? 0) !== selectedCharacterIds.length) {
    return NextResponse.json({ error: "Một hoặc nhiều nhân vật không thuộc dự án này." }, { status: 400 });
  }
  const assetIds = (characterRows ?? []).flatMap((character) => character.continuity_asset_id ? [character.continuity_asset_id] : []);
  const { data: versions } = assetIds.length
    ? await supabase
      .from("asset_versions")
      .select("id, asset_id, version, status, content_hash, identity_cards(summary, must_preserve, may_change), reference_images(id, role, image_url, source_hash, is_primary, priority)")
      .in("asset_id", assetIds)
      .order("version", { ascending: false })
    : { data: [] };
  const canonicalVersionByAsset = new Map<string, Record<string, unknown>>();
  for (const rawVersion of versions ?? []) {
    const version = rawVersion as unknown as Record<string, unknown>;
    const assetId = version.asset_id as string;
    const existing = canonicalVersionByAsset.get(assetId);
    if (!existing || (version.status === "locked" && existing.status !== "locked")) canonicalVersionByAsset.set(assetId, version);
  }
  const castSnapshot = (characterRows ?? []).map((character) => ({
    id: character.id,
    name: character.name,
    description: character.description,
    personality: character.personality,
    avatar_url: character.avatar_url,
    continuity_asset_id: character.continuity_asset_id,
    asset_version: character.continuity_asset_id ? canonicalVersionByAsset.get(character.continuity_asset_id) ?? null : null,
    poses: character.character_poses ?? [],
  }));
  const brandSnapshot = { voice: body.brand_voice ?? project.brand_voice ?? "", audience: body.audience ?? project.audience ?? "", guidelines: body.content_guidelines ?? project.content_guidelines ?? "", watermarkUrl: project.watermark_url ?? null };
  const { data, error } = await supabase.from("content_sets").insert({
    project_id: project.id,
    title: typeof body.title === "string" ? body.title.trim().slice(0, 120) || null : null,
    brief: body.brief.trim(), selected_character_ids: selectedCharacterIds,
    cast_snapshot: castSnapshot, brand_snapshot: brandSnapshot, created_by: user.id, updated_by: user.id,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contentSet: data }, { status: 201 });
}
