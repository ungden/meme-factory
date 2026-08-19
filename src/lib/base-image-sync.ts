import { createClient } from "@/lib/supabase/client";
import type { MemeFormat } from "@/types/database";

/**
 * Bridges the legacy pose library to the template library.
 *
 * Poses are still created by upload, bulk upload and AI pose generation. Without
 * this, anything added after the one-off backfill migration would never appear in
 * the meme editor. Rows land as drafts because a legacy pose was not composed with
 * a reserved caption area.
 */
export async function syncPoseToBaseImage(input: {
  poseId: string;
  characterId: string;
  imageUrl: string;
  name?: string | null;
  emotion?: string | null;
  isTransparent?: boolean;
  layoutPresetId?: string;
  aspectRatio?: MemeFormat;
}): Promise<boolean> {
  const supabase = createClient();
  const layoutPresetId = input.layoutPresetId ?? "medium_portrait";
  const aspectRatio = input.aspectRatio ?? "1:1";

  try {
    const { data: existing } = await supabase
      .from("mascot_base_images")
      .select("id")
      .eq("legacy_pose_id", input.poseId)
      .maybeSingle();
    if (existing) return false;

    // expression_slug is a foreign key; an unknown legacy emotion falls back.
    let expressionSlug = "neutral";
    if (input.emotion) {
      const { data: tag } = await supabase
        .from("expression_tags")
        .select("slug")
        .eq("slug", input.emotion)
        .maybeSingle();
      if (tag) expressionSlug = tag.slug;
    }

    const { data: preset } = await supabase
      .from("layout_presets")
      .select("default_safe_zones, default_text_style, recommended_chars")
      .eq("id", layoutPresetId)
      .maybeSingle();

    const { count } = await supabase
      .from("mascot_base_images")
      .select("id", { count: "exact", head: true })
      .eq("character_id", input.characterId)
      .eq("expression_slug", expressionSlug)
      .eq("layout_preset_id", layoutPresetId)
      .eq("aspect_ratio", aspectRatio);

    const safeZones = (preset?.default_safe_zones as Record<string, unknown> | undefined)?.[aspectRatio];
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("mascot_base_images").insert({
      character_id: input.characterId,
      legacy_pose_id: input.poseId,
      expression_slug: expressionSlug,
      expression_label: input.name || null,
      layout_preset_id: layoutPresetId,
      variant_index: count ?? 0,
      image_url: input.imageUrl,
      storage_bucket: "character-poses",
      aspect_ratio: aspectRatio,
      has_transparent_bg: Boolean(input.isTransparent),
      safe_zones: safeZones ?? {},
      safe_zones_source: "layout_default",
      default_text_style: preset?.default_text_style ?? {},
      recommended_chars: preset?.recommended_chars ?? 60,
      status: "draft",
      created_by: userData.user?.id ?? null,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (error) {
    // A pose that fails to mirror is still a valid pose; never block the upload.
    console.error("Pose not mirrored into the template library:", error);
    return false;
  }
}

/** Mirrors every pose of a character that has no base image yet. */
export async function syncCharacterPoses(characterId: string): Promise<number> {
  const supabase = createClient();
  const { data: poses } = await supabase
    .from("character_poses")
    .select("id, image_url, name, emotion, is_transparent")
    .eq("character_id", characterId);

  let created = 0;
  for (const pose of poses ?? []) {
    const done = await syncPoseToBaseImage({
      poseId: pose.id,
      characterId,
      imageUrl: pose.image_url,
      name: pose.name,
      emotion: pose.emotion,
      isTransparent: pose.is_transparent,
    });
    if (done) created += 1;
  }
  return created;
}
