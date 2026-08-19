"use client";

import { createClient } from "@/lib/supabase/client";
import { stripImageMetadataFromFile } from "@/lib/image-metadata";
import {
  DEFAULT_FRAME,
  hashBytes,
  measureImage,
  normaliseForTemplate,
  storageExtensionFor,
  type Frame,
} from "@/lib/template-upload";
import type { MascotBaseImage, MemeFormat, SafeZonesSource } from "@/types/database";
import type { SafeZoneMap } from "@/lib/meme-doc/types";

export interface CreateTemplateInput {
  projectId: string;
  characterId?: string | null;
  file: File;
  title?: string | null;
  expressionSlug: string;
  expressionLabel?: string | null;
  aspectRatio: MemeFormat;
  frame: Frame;
  safeZones: SafeZoneMap;
  source?: "upload" | "imported_pose";
  sourcePoseId?: string | null;
  /** Only a confirmed caption area may be published. */
  publish: boolean;
}

/**
 * The single write path for a manually added template.
 *
 * Every fact the old auto-mirror invented is measured here instead: real pixel
 * size, the frame the user positioned, and the caption zones they drew. Errors
 * are thrown, never swallowed — six broken rows appeared in production precisely
 * because the mirror logged and moved on.
 */
export async function createTemplateFromFile(input: CreateTemplateInput): Promise<MascotBaseImage> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Phiên đăng nhập đã hết hạn");

  // Shrink only if larger than any canvas needs; never JPEG, never a white fill.
  const normalised = await normaliseForTemplate(input.file);
  // Public bucket: EXIF/GPS must not ride along. This does not re-encode.
  const clean = await stripImageMetadataFromFile(normalised);
  const measured = await measureImage(clean);
  const contentHash = await hashBytes(clean);

  const extension = storageExtensionFor(clean.type || normalised.type);
  const storagePath = `${input.projectId}/${crypto.randomUUID()}-${contentHash.slice(0, 8)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("meme-templates")
    .upload(storagePath, clean, { contentType: clean.type || "image/png", upsert: false });
  if (uploadError) throw new Error(`Tải ảnh lên thất bại: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from("meme-templates").getPublicUrl(storagePath);
  const hasZones = Object.keys(input.safeZones.zones ?? {}).length > 0;

  const { data, error } = await supabase
    .from("mascot_base_images")
    .insert({
      project_id: input.projectId,
      character_id: input.characterId ?? null,
      source: input.source ?? "upload",
      source_pose_id: input.sourcePoseId ?? null,
      title: input.title?.trim() || null,
      expression_slug: input.expressionSlug,
      expression_label: input.expressionLabel?.trim() || null,
      // A manual upload has no composed layout; the user drew the zones instead.
      layout_preset_id: null,
      image_url: urlData.publicUrl,
      storage_bucket: "meme-templates",
      storage_path: storagePath,
      content_hash: contentHash,
      aspect_ratio: input.aspectRatio,
      width: measured.width,
      height: measured.height,
      source_width: measured.width,
      source_height: measured.height,
      has_transparent_bg: measured.hasAlpha,
      frame: input.frame ?? DEFAULT_FRAME,
      safe_zones: input.safeZones,
      safe_zones_source: "authored" satisfies SafeZonesSource,
      safe_zones_updated_at: new Date().toISOString(),
      status: input.publish && hasZones ? "ready" : "draft",
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (error) {
    // Clean up the object we just uploaded so a failed insert leaves no litter.
    await supabase.storage.from("meme-templates").remove([storagePath]);
    if (error.code === "23505") {
      throw new Error("Ảnh này đã có trong thư viện mẫu của dự án.");
    }
    throw new Error(error.message);
  }

  return data as MascotBaseImage;
}

/** Fetches a legacy pose so it can go through the same import path as an upload. */
export async function fetchPoseAsFile(imageUrl: string, name: string): Promise<File> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Không tải được ảnh gốc");
  const blob = await response.blob();
  const extension = storageExtensionFor(blob.type);
  return new File([blob], `${name || "pose"}.${extension}`, { type: blob.type || "image/png" });
}

/** Reverse direction: publish a template as an AI identity reference. */
export async function promoteTemplateToPose(template: MascotBaseImage, poseName: string) {
  if (!template.character_id) throw new Error("Mẫu này chưa gắn mascot nào");
  const supabase = createClient();

  const { error } = await supabase.from("character_poses").insert({
    character_id: template.character_id,
    name: poseName || template.title || "Ảnh tham chiếu",
    // character_poses.emotion is a closed 15-value CHECK, a subset of expression_tags.
    emotion: LEGACY_EMOTIONS.has(template.expression_slug) ? template.expression_slug : "neutral",
    image_url: template.image_url,
    description: null,
    is_transparent: template.has_transparent_bg,
  });
  if (error) throw new Error(error.message);
}

const LEGACY_EMOTIONS = new Set([
  "happy", "sad", "angry", "surprised", "confused", "cool", "love", "scared",
  "thinking", "laughing", "crying", "neutral", "excited", "tired", "custom",
]);
