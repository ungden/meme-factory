"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MOCK_USER,
  MOCK_PROJECTS,
  MOCK_CHARACTERS,
  MOCK_MEMES,
} from "@/lib/mock-data";
import type {
  Project,
  Character,
  CharacterPose,
  Meme,
  MemeFormat,
  MemeContent,
  SelectedCharacter,
  EmotionTag,
} from "@/types/database";
import { v4 as uuidv4 } from "uuid";

// ============================================
// Check if Supabase is configured
// ============================================
function isSupabaseReady(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && url.startsWith("https://") && !url.includes("placeholder");
}

export const IS_MOCK_MODE = !isSupabaseReady();

type CharWithPoses = Character & { poses: CharacterPose[] };

// ============================================
// In-memory mock store (persisted in session)
// ============================================
let mockProjects = [...MOCK_PROJECTS];
let mockCharacters = [...MOCK_CHARACTERS];
let mockMemes = [...MOCK_MEMES];

function slugifyProjectName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base || "du-an";
}

function buildProjectSlug(name: string, id: string): string {
  return `${slugifyProjectName(name)}-${id.slice(0, 8)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ============================================
// PROJECTS
// ============================================
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) {
      setProjects([...mockProjects]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) console.error("Failed to load projects:", error.message);
    setProjects(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: { name: string; description?: string; style_prompt?: string }): Promise<Project | null> => {
    if (IS_MOCK_MODE) {
      const newProj: Project = {
        id: uuidv4(),
        user_id: MOCK_USER.id,
        name: input.name,
        slug: "",
        description: input.description || null,
        style_prompt: input.style_prompt || null,
        watermark_url: null,
        watermark_position: "bottom-right",
        watermark_opacity: 0.8,
        default_format: "1:1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      newProj.slug = buildProjectSlug(newProj.name, newProj.id);
      mockProjects = [newProj, ...mockProjects];
      setProjects([...mockProjects]);
      return newProj;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const slug = `${slugifyProjectName(input.name)}-${uuidv4().slice(0, 8)}`;
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, ...input, slug })
      .select()
      .single();
    if (error) console.error("Failed to create project:", error.message);
    if (data) setProjects((prev) => [data, ...prev]);
    return data;
  }, []);

  const remove = useCallback(async (id: string) => {
    if (IS_MOCK_MODE) {
      mockProjects = mockProjects.filter((p) => p.id !== id);
      mockCharacters = mockCharacters.filter((c) => c.project_id !== id);
      mockMemes = mockMemes.filter((m) => m.project_id !== id);
      setProjects([...mockProjects]);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) console.error("Failed to delete project:", error.message);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, create, remove, reload: load };
}

// ============================================
// SINGLE PROJECT
// ============================================
export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_MOCK_MODE) {
      setProject(mockProjects.find((p) => p.id === projectId || p.slug === projectId) || null);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const query = supabase.from("projects").select("*").limit(1);
    const request = isUuid(projectId)
      ? query.eq("id", projectId).maybeSingle()
      : query.eq("slug", projectId).maybeSingle();
    request.then(({ data }: { data: Project | null }) => {
      setProject(data);
      setLoading(false);
    });
  }, [projectId]);

  return { project, loading };
}

// ============================================
// CHARACTERS + POSES
// ============================================
export function useCharacters(projectRef: string) {
  const [characters, setCharacters] = useState<CharWithPoses[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) {
      const project = mockProjects.find((p) => p.id === projectRef || p.slug === projectRef);
      if (!project) {
        setCharacters([]);
        setLoading(false);
        return;
      }
      setCharacters(mockCharacters.filter((c) => c.project_id === project.id));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const projectQuery = supabase.from("projects").select("id").limit(1);
    const { data: project } = isUuid(projectRef)
      ? await projectQuery.eq("id", projectRef).maybeSingle()
      : await projectQuery.eq("slug", projectRef).maybeSingle();
    if (!project) {
      setCharacters([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("characters")
      .select("*, character_poses(*)")
      .eq("project_id", project.id)
      .order("created_at");
    if (error) console.error("Failed to load characters:", error.message);
    const result = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      poses: (c.character_poses as CharacterPose[]) || [],
    })) as CharWithPoses[];
    setCharacters(result);
    setLoading(false);
  }, [projectRef]);

  useEffect(() => { load(); }, [load]);

  const createCharacter = useCallback(async (input: { name: string; description: string; personality: string }): Promise<CharWithPoses | null> => {
    if (IS_MOCK_MODE) {
      const newChar: CharWithPoses = {
        id: uuidv4(),
        project_id: mockProjects.find((p) => p.id === projectRef || p.slug === projectRef)?.id || projectRef,
        name: input.name,
        description: input.description,
        personality: input.personality,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        poses: [],
      };
      mockCharacters = [...mockCharacters, newChar];
      await load();
      return newChar;
    }
    const supabase = createClient();
    const projectQuery = supabase.from("projects").select("id").limit(1);
    const { data: project } = isUuid(projectRef)
      ? await projectQuery.eq("id", projectRef).maybeSingle()
      : await projectQuery.eq("slug", projectRef).maybeSingle();
    if (!project) return null;
    const { data, error } = await supabase.from("characters").insert({ project_id: project.id, ...input }).select().single();
    if (error) console.error("Failed to create character:", error.message);
    await load();
    return data ? { ...data, poses: [] } as CharWithPoses : null;
  }, [projectRef, load]);

  const updateCharacter = useCallback(async (id: string, input: { name: string; description: string; personality: string }) => {
    if (IS_MOCK_MODE) {
      mockCharacters = mockCharacters.map((c) =>
        c.id === id ? { ...c, ...input, updated_at: new Date().toISOString() } : c
      );
      await load();
      return;
    }
    const supabase = createClient();
    await supabase.from("characters").update(input).eq("id", id);
    await load();
  }, [load]);

  const setCharacterAvatar = useCallback(async (id: string, avatarUrl: string) => {
    if (IS_MOCK_MODE) {
      mockCharacters = mockCharacters.map((c) =>
        c.id === id ? { ...c, avatar_url: avatarUrl, updated_at: new Date().toISOString() } : c
      );
      await load();
      return;
    }
    const supabase = createClient();
    await supabase.from("characters").update({ avatar_url: avatarUrl }).eq("id", id);
    await load();
  }, [load]);

  const deleteCharacter = useCallback(async (id: string) => {
    if (IS_MOCK_MODE) {
      mockCharacters = mockCharacters.filter((c) => c.id !== id);
      await load();
      return;
    }
    const supabase = createClient();
    await supabase.from("characters").delete().eq("id", id);
    await load();
  }, [load]);

  const addPose = useCallback(async (characterId: string, input: {
    name: string;
    emotion: EmotionTag;
    description: string;
    is_transparent: boolean;
    file: File;
  }) => {
    if (IS_MOCK_MODE) {
      const previewUrl = URL.createObjectURL(input.file);
      const newPose: CharacterPose = {
        id: uuidv4(),
        character_id: characterId,
        name: input.name,
        emotion: input.emotion,
        image_url: previewUrl,
        description: input.description || null,
        is_transparent: input.is_transparent,
        created_at: new Date().toISOString(),
      };
      mockCharacters = mockCharacters.map((c) => {
        if (c.id !== characterId) return c;
        const updated = { ...c, poses: [...c.poses, newPose] };
        // Auto-set avatar to first pose if no avatar yet
        if (!updated.avatar_url) {
          updated.avatar_url = previewUrl;
          updated.updated_at = new Date().toISOString();
        }
        return updated;
      });
      await load();
      return;
    }
    const supabase = createClient();
    const fileExt = input.file.name.split(".").pop();
    const filePath = `${projectRef}/${characterId}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("character-poses").upload(filePath, input.file);
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("character-poses").getPublicUrl(filePath);
    await supabase.from("character_poses").insert({
      character_id: characterId,
      name: input.name,
      emotion: input.emotion,
      image_url: urlData.publicUrl,
      description: input.description || null,
      is_transparent: input.is_transparent,
    });
    // Auto-set avatar to first pose if no avatar yet
    const char = characters.find((c) => c.id === characterId);
    if (char && !char.avatar_url) {
      await supabase.from("characters").update({ avatar_url: urlData.publicUrl }).eq("id", characterId);
    }
    await load();
  }, [projectRef, load, characters]);

  const deletePose = useCallback(async (poseId: string) => {
    if (IS_MOCK_MODE) {
      mockCharacters = mockCharacters.map((c) => ({
        ...c,
        poses: c.poses.filter((p) => p.id !== poseId),
      }));
      await load();
      return;
    }
    const supabase = createClient();
    await supabase.from("character_poses").delete().eq("id", poseId);
    await load();
  }, [load]);

  return { characters, loading, createCharacter, updateCharacter, deleteCharacter, setCharacterAvatar, addPose, deletePose, reload: load };
}

// ============================================
// MEMES
// ============================================
export function useMemes(projectRef: string) {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (IS_MOCK_MODE) {
      const project = mockProjects.find((p) => p.id === projectRef || p.slug === projectRef);
      if (!project) {
        setMemes([]);
        setLoading(false);
        return;
      }
      setMemes(mockMemes.filter((m) => m.project_id === project.id));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const projectQuery = supabase.from("projects").select("id").limit(1);
    const { data: project } = isUuid(projectRef)
      ? await projectQuery.eq("id", projectRef).maybeSingle()
      : await projectQuery.eq("slug", projectRef).maybeSingle();
    if (!project) {
      setMemes([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("memes")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to load memes:", error.message);
    setMemes(data || []);
    setLoading(false);
  }, [projectRef]);

  useEffect(() => { load(); }, [load]);

  const saveMeme = useCallback(async (input: {
    original_idea: string;
    generated_content: MemeContent;
    selected_characters: SelectedCharacter[];
    format: MemeFormat;
    has_watermark: boolean;
    image_base64?: string | null;
  }) => {
    if (IS_MOCK_MODE) {
      const newMeme: Meme = {
        id: uuidv4(),
        project_id: mockProjects.find((p) => p.id === projectRef || p.slug === projectRef)?.id || projectRef,
        title: null,
        original_idea: input.original_idea,
        generated_content: input.generated_content,
        selected_characters: input.selected_characters,
        format: input.format,
        image_url: input.image_base64 || null,
        canvas_data: null,
        has_watermark: input.has_watermark,
        status: "completed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockMemes = [newMeme, ...mockMemes];
      await load();
      return newMeme;
    }
    const supabase = createClient();
    const projectQuery = supabase.from("projects").select("id").limit(1);
    const { data: project } = isUuid(projectRef)
      ? await projectQuery.eq("id", projectRef).maybeSingle()
      : await projectQuery.eq("slug", projectRef).maybeSingle();
    if (!project) throw new Error("Project not found");
    const res = await fetch("/api/meme/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: project.id, ...input }),
    });
    const data = await res.json();
    if (!res.ok || !data?.meme) {
      throw new Error(data?.error || "Không thể lưu meme vào thư viện");
    }
    await load();
    return data.meme;
  }, [projectRef, load]);

  const remove = useCallback(async (id: string) => {
    if (IS_MOCK_MODE) {
      mockMemes = mockMemes.filter((m) => m.id !== id);
      await load();
      return;
    }
    const supabase = createClient();
    await supabase.from("memes").delete().eq("id", id);
    await load();
  }, [load]);

  return { memes, loading, saveMeme, remove, reload: load };
}

// ============================================
// AI CONTENT GENERATION
// All AI calls go through server API routes only.
// No client-side API key exposure.
// ============================================
export async function generateContent(input: {
  project_id: string;
  idea: string;
  characters: CharWithPoses[];
  projectStyle?: string;
  adHocCharacters?: string[];
  referenceImages?: { base64: string; mimeType: string }[];
}) {
  // Try server API route first (works in both real and mock mode if GEMINI_API_KEY is set server-side)
  try {
    const res = await fetch("/api/ai/generate-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: input.project_id,
        idea: input.idea,
        adHocCharacters: input.adHocCharacters,
        num_variations: 3,
        referenceImages: input.referenceImages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.variations?.length > 0) return data.variations;
    }
  } catch (e) {
    console.warn("Server AI content generation failed:", e);
  }

  // Fallback: generate mock content locally
  return generateMockContent(input.idea, input.characters);
}

function generateMockContent(idea: string, characters: CharWithPoses[]) {
  const tones = ["hài hước", "châm biếm", "tự nhạo", "motivational"];
  const positions: ("top" | "bottom" | "center")[] = ["top", "bottom", "center"];

  return Array.from({ length: 3 }, (_, i) => {
    const tone = tones[i % tones.length];
    const textPos = positions[i % positions.length];

    const selectedChars = characters.length > 0
      ? [characters[Math.floor(Math.random() * characters.length)]]
      : [];

    const suggested = selectedChars.map((c) => {
      const pose = c.poses[Math.floor(Math.random() * c.poses.length)] || c.poses[0];
      return {
        character_id: c.id,
        character_name: c.name,
        pose_id: pose?.id || "",
        pose_name: pose?.name || "",
        emotion: pose?.emotion || "neutral",
        suggested_emotion: pose?.emotion || "neutral",
        reasoning: `${c.name} phù hợp với tone ${tone} của nội dung`,
        position: "center" as const,
      };
    });

    const headlines = [
      idea.length > 50 ? idea.slice(0, 50) + "..." : idea,
      `Khi ${idea.toLowerCase()}`,
      `POV: ${idea}`,
    ];

    const subtexts = [
      "— Ai cũng nói thế",
      "— Dân tình bình luận",
      undefined,
    ];

    return {
      headline: headlines[i] || idea,
      subtext: subtexts[i],
      caption: `${idea} #memefactory #viral`,
      tone,
      text_position: textPos,
      content: {
        headline: headlines[i] || idea,
        subtext: subtexts[i],
        caption: `${idea} #memefactory #viral`,
        layout_suggestion: { text_position: textPos, character_positions: [] },
        tone,
      },
      suggested_characters: suggested,
    };
  });
}

// ============================================
// AI IMAGE GENERATION (Nano Banana 2)
// ============================================
export async function generateImage(
  params: import("@/types/database").ImageGenRequest
): Promise<import("@/types/database").ImageGenResponse> {
  try {
    const res = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      return await res.json();
    }

    const err = await res.json().catch(() => ({ error: "Image generation failed" }));
    return { image: "", error: err.error || "Image generation failed", code: err.code };
  } catch {
    return {
      image: "",
      error: "Không thể kết nối server. Kiểm tra GEMINI_API_KEY trong .env.local",
      code: "NOT_CONFIGURED",
    };
  }
}
