"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDeferredTask } from "@/lib/use-deferred-task";
import { IS_MOCK_MODE } from "@/lib/use-store";
import type {
  BaseImageStatus,
  Character,
  ExpressionTag,
  LayoutPreset,
  MascotBaseImage,
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
