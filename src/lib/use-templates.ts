"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDeferredTask } from "@/lib/use-deferred-task";
import { IS_MOCK_MODE } from "@/lib/use-store";
import type {
  BaseImageStatus,
  Character,
  CharacterDna,
  ExpressionTag,
  LayoutPreset,
  MascotBaseImage,
  MemeCollection,
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
 * Base images of every mascot in the project. `status` filters to 'ready' by
 * default so the editor only offers artwork a human has approved as a template.
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
    const { data: characters } = await supabase
      .from("characters")
      .select("id, name")
      .eq("project_id", projectId);

    const characterIds = (characters ?? []).map((character: Pick<Character, "id">) => character.id);
    if (characterIds.length === 0) {
      setBaseImages([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("mascot_base_images")
      .select("*")
      .in("character_id", characterIds)
      .order("sort_order")
      .order("created_at");
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) console.error("Failed to load base images:", error.message);

    const nameById = new Map((characters ?? []).map((c: Pick<Character, "id" | "name">) => [c.id, c.name]));
    setBaseImages(
      (data ?? []).map((row: MascotBaseImage) => ({
        ...row,
        character_name: nameById.get(row.character_id) ?? "Mascot",
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

  return { baseImages, loading, reload: load, updateBaseImage };
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

  const blob = await (await fetch(`data:image/png;base64,${input.imageBase64}`)).blob();
  // First path segment is the user id so the bucket delete policy matches.
  const storagePath = `${userData.user.id}/${input.characterId}/${Date.now()}-${input.expressionSlug}.png`;
  const { error: uploadError } = await supabase.storage
    .from("base-images")
    .upload(storagePath, blob, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error(`Tải ảnh lên thất bại: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from("base-images").getPublicUrl(storagePath);

  // variant_index disambiguates repeats of the same expression + layout + ratio.
  const { count } = await supabase
    .from("mascot_base_images")
    .select("id", { count: "exact", head: true })
    .eq("character_id", input.characterId)
    .eq("expression_slug", input.expressionSlug)
    .eq("layout_preset_id", input.layoutPresetId)
    .eq("aspect_ratio", input.aspectRatio);

  const safeZones = (input.preset?.default_safe_zones as Record<string, unknown> | undefined)?.[input.aspectRatio];

  const { data, error } = await supabase
    .from("mascot_base_images")
    .insert({
      character_id: input.characterId,
      expression_slug: input.expressionSlug,
      expression_label: input.expressionLabel,
      layout_preset_id: input.layoutPresetId,
      variant_index: count ?? 0,
      image_url: urlData.publicUrl,
      storage_bucket: "base-images",
      storage_path: storagePath,
      aspect_ratio: input.aspectRatio,
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
