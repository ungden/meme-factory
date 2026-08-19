"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDeferredTask } from "@/lib/use-deferred-task";
import { DEFAULT_FRAME } from "@/lib/template-upload";
import { IS_MOCK_MODE } from "@/lib/use-store";
import { FORMAT_DIMENSIONS } from "@/types/database";
import type {
  BaseImageStatus,
  Character,
  CharacterDna,
  ExpressionTag,
  LayoutPreset,
  MascotBaseImage,
  MemeCollection,
  MemeExport,
  MemeFormat,
} from "@/types/database";

export type BaseImageWithCharacter = MascotBaseImage & {
  character_name: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveProjectId(projectRef: string): Promise<string | null> {
  const supabase = createClient();
  const query = supabase.from("projects").select("id").limit(1);
  const { data } = isUuid(projectRef)
    ? await query.eq("id", projectRef).maybeSingle()
    : await query.eq("slug", projectRef).maybeSingle();
  return data?.id ?? null;
}

/**
 * Meme templates of a project. Ownership is the project, so a template with no
 * mascot is a first-class row rather than something that cannot exist.
 */
export function useBaseImages(projectRef: string, status: BaseImageStatus | "all" = "ready") {
  const [baseImages, setBaseImages] = useState<BaseImageWithCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) {
      setBaseImages([]);
      setLoading(false);
      return;
    }

    const projectId = await resolveProjectId(projectRef);
    if (!projectId) {
      setBaseImages([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let query = supabase
      .from("mascot_base_images")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) console.error("Failed to load meme templates:", error.message);

    const rows = (data ?? []) as MascotBaseImage[];
    const characterIds = [...new Set(rows.map((row) => row.character_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (characterIds.length > 0) {
      const { data: characters } = await supabase
        .from("characters")
        .select("id, name")
        .in("id", characterIds);
      for (const character of (characters ?? []) as Pick<Character, "id" | "name">[]) {
        nameById.set(character.id, character.name);
      }
    }

    setBaseImages(
      rows.map((row) => ({
        ...row,
        character_name: row.character_id ? nameById.get(row.character_id) ?? "Mascot" : "Không gắn mascot",
      }))
    );
    setLoading(false);
  }, [projectRef, status]);

  useDeferredTask(load);

  const updateBaseImage = useCallback(
    async (id: string, patch: Partial<MascotBaseImage>) => {
      if (IS_MOCK_MODE) return;
      const supabase = createClient();
      const { error } = await supabase.from("mascot_base_images").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      await load();
    },
    [load]
  );

  const deleteBaseImage = useCallback(
    async (id: string) => {
      if (IS_MOCK_MODE) return;
      const supabase = createClient();
      const { error } = await supabase.from("mascot_base_images").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await load();
    },
    [load]
  );

  return { baseImages, loading, reload: load, updateBaseImage, deleteBaseImage };
}

export function useExpressionTags() {
  const [tags, setTags] = useState<ExpressionTag[]>([]);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("expression_tags")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setTags(data ?? []);
  }, []);

  useDeferredTask(load);
  return tags;
}

export function useLayoutPresets() {
  const [presets, setPresets] = useState<LayoutPreset[]>([]);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("layout_presets")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setPresets(data ?? []);
  }, []);

  useDeferredTask(load);
  return presets;
}

export interface SaveBaseImageInput {
  characterId: string;
  expressionSlug: string;
  expressionLabel: string;
  layoutPresetId: string;
  aspectRatio: MemeFormat;
  imageBase64: string;
  generationJobId?: string | null;
  preset?: Pick<LayoutPreset, "default_safe_zones" | "default_text_style" | "recommended_chars"> | null;
}

/**
 * Stores a generated base image as-is. Deliberately no JPEG re-encode: the artwork
 * gets scaled up onto a 1080-1920px canvas later, so losing pixels here is visible.
 */
export async function saveGeneratedBaseImage(input: SaveBaseImageInput) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Phiên đăng nhập đã hết hạn");

  const { data: character } = await supabase
    .from("characters")
    .select("id, project_id, avatar_url")
    .eq("id", input.characterId)
    .single();
  if (!character) throw new Error("Không tìm thấy mascot");

  const blob = await (await fetch(`data:image/png;base64,${input.imageBase64}`)).blob();
  // First path segment is the user id so the bucket delete policy matches.
  const storagePath = `${userData.user.id}/${input.characterId}/${Date.now()}-${input.expressionSlug}.png`;
  const { error: uploadError } = await supabase.storage
    .from("base-images")
    .upload(storagePath, blob, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error(`Tải ảnh lên thất bại: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from("base-images").getPublicUrl(storagePath);
  const dimensions = FORMAT_DIMENSIONS[input.aspectRatio];
  const safeZones = (input.preset?.default_safe_zones as Record<string, unknown> | undefined)?.[input.aspectRatio];

  const { data, error } = await supabase
    .from("mascot_base_images")
    .insert({
      project_id: character.project_id,
      character_id: input.characterId,
      source: "ai_base_pack",
      expression_slug: input.expressionSlug,
      expression_label: input.expressionLabel,
      layout_preset_id: input.layoutPresetId,
      image_url: urlData.publicUrl,
      storage_bucket: "base-images",
      storage_path: storagePath,
      aspect_ratio: input.aspectRatio,
      // The provider rendered at the requested ratio, so the canvas size is the
      // real size; the `ready` constraint requires both to be present.
      width: dimensions.width,
      height: dimensions.height,
      source_width: dimensions.width,
      source_height: dimensions.height,
      frame: DEFAULT_FRAME,
      safe_zones: safeZones ?? {},
      safe_zones_source: "layout_default",
      default_text_style: input.preset?.default_text_style ?? {},
      recommended_chars: input.preset?.recommended_chars ?? 60,
      // Generated with a reserved caption area, so it is a usable template already.
      status: "ready",
      generation_job_id: input.generationJobId ?? null,
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Without this a wizard-only mascot has no image the legacy AI generator can
  // use as an identity reference, and that page throws.
  if (!character.avatar_url) {
    await supabase.from("characters").update({ avatar_url: urlData.publicUrl }).eq("id", input.characterId);
  }

  return data as MascotBaseImage;
}

export function useCharacterDna(characterId: string | null) {
  const [dna, setDna] = useState<CharacterDna | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE || !characterId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("character_dna")
      .select("*")
      .eq("character_id", characterId)
      .maybeSingle();
    setDna((data as CharacterDna | null) ?? null);
    setLoading(false);
  }, [characterId]);

  useDeferredTask(load);

  const save = useCallback(
    async (patch: Partial<CharacterDna>) => {
      if (!characterId) return;
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("character_dna")
        .upsert(
          { character_id: characterId, ...patch, updated_by: userData.user?.id ?? null },
          { onConflict: "character_id" }
        );
      if (error) throw new Error(error.message);
      await load();
    },
    [characterId, load]
  );

  return { dna, loading, save, reload: load };
}

export interface CollectionWithCount extends MemeCollection {
  meme_count: number;
}

export function useMemeCollections(projectRef: string) {
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [membership, setMembership] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) {
      setLoading(false);
      return;
    }
    const projectId = await resolveProjectId(projectRef);
    if (!projectId) {
      setCollections([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("meme_collections")
      .select("*, meme_collection_items(meme_id)")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at");

    const rows = (data ?? []) as (MemeCollection & { meme_collection_items: { meme_id: string }[] })[];
    setCollections(rows.map((row) => ({ ...row, meme_count: row.meme_collection_items?.length ?? 0 })));
    setMembership(
      Object.fromEntries(rows.map((row) => [row.id, (row.meme_collection_items ?? []).map((item) => item.meme_id)]))
    );
    setLoading(false);
  }, [projectRef]);

  useDeferredTask(load);

  const create = useCallback(
    async (name: string) => {
      const projectId = await resolveProjectId(projectRef);
      if (!projectId) throw new Error("Không tìm thấy dự án");
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("meme_collections")
        .insert({ project_id: projectId, name, created_by: userData.user?.id ?? null });
      if (error) throw new Error(error.message);
      await load();
    },
    [projectRef, load]
  );

  const addMeme = useCallback(
    async (collectionId: string, memeId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("meme_collection_items")
        .upsert({ collection_id: collectionId, meme_id: memeId }, { onConflict: "collection_id,meme_id" });
      if (error) throw new Error(error.message);
      await load();
    },
    [load]
  );

  const removeMeme = useCallback(
    async (collectionId: string, memeId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("meme_collection_items")
        .delete()
        .eq("collection_id", collectionId)
        .eq("meme_id", memeId);
      if (error) throw new Error(error.message);
      await load();
    },
    [load]
  );

  return { collections, membership, loading, create, addMeme, removeMeme, reload: load };
}

export interface RecordExportInput {
  projectId: string;
  memeId?: string | null;
  baseImageId?: string | null;
  aspectRatio: MemeFormat;
  width: number;
  height: number;
  fileSizeBytes?: number | null;
  hadWatermark: boolean;
}

/**
 * The PNG is produced and downloaded in the browser, so only its metadata is
 * recorded. Failing to log an export must never block the download itself.
 */
export async function recordMemeExport(input: RecordExportInput): Promise<void> {
  if (IS_MOCK_MODE || !input.projectId) return;
  try {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    await supabase.from("meme_exports").insert({
      project_id: input.projectId,
      meme_id: input.memeId ?? null,
      base_image_id: input.baseImageId ?? null,
      format: "png",
      aspect_ratio: input.aspectRatio,
      width: input.width,
      height: input.height,
      file_size_bytes: input.fileSizeBytes ?? null,
      had_watermark: input.hadWatermark,
      exported_by: userData.user.id,
    });
  } catch (error) {
    console.error("Export history not recorded:", error);
  }
}

export function useMemeExports(memeId: string | null) {
  const [exports, setExports] = useState<MemeExport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE || !memeId) {
      setExports([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("meme_exports")
      .select("*")
      .eq("meme_id", memeId)
      .order("created_at", { ascending: false })
      .limit(20);
    setExports((data ?? []) as MemeExport[]);
    setLoading(false);
  }, [memeId]);

  useDeferredTask(load);
  return { exports, loading, reload: load };
}
