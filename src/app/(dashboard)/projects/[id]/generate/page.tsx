"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import { MemeAutopilot } from "./_components/meme-autopilot";
import { drawMeme } from "./_lib/draw-meme";
import { IS_MOCK_MODE, useProject, useCharacters, useMemes, generateContent } from "@/lib/use-store";
import {
  MAX_REF_IMAGES,
  MAX_REF_SIZE_MB,
  buildAutoVisualPrompt,
  isAcceptableReferenceFile,
  type ContentVariation,
} from "./_lib/visual-prompt";
import Button, { buttonClasses } from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import Modal from "@/components/ui/modal";
import PriceLine from "@/components/ui/price-line";
import JobStatus from "@/components/ui/job-status";
import EmptyState from "@/components/ui/empty-state";
import Alert from "@/components/ui/alert";
import { PageContainer, Skeleton } from "@/components/ui/page";
import MemeAreaHeader from "@/components/meme/meme-area-header";
import Link from "next/link";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { useToast } from "@/components/ui/toast";
import { Zap, Sparkles, Download, Save, RotateCcw, ChevronRight, Wand2, ImageIcon, Upload, X, Tags, Plus, Clapperboard } from "lucide-react";
import type { MemeContent, MemeFormat, SelectedCharacter, EmotionTag } from "@/types/database";
import { FORMAT_DIMENSIONS } from "@/types/database";
import { POINT_COSTS } from "@/lib/point-pricing";
import { trackEvent } from "@/lib/analytics";
import { compressImageToBase64 } from "@/lib/image-utils";
import { useDeferredTask } from "@/lib/use-deferred-task";

export default function GeneratePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const { project, loading: projLoading } = useProject(projectId);
  const { characters, loading: charsLoading, createCharacter } = useCharacters(projectId);
  const { memes, saveMeme } = useMemes(projectId);

  const toast = useToast();
  const loading = projLoading || charsLoading;
  const [projectPoints, setProjectPoints] = useState(0);

  // Steps
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [idea, setIdea] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<ContentVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState(0);
  const [hasPickedVariation, setHasPickedVariation] = useState(false);
  const [format, setFormat] = useState<MemeFormat>("1:1");
  const [saving, setSaving] = useState(false);
  const [contentSetId, setContentSetId] = useState<string | null>(null);
  const [contentSetBrief, setContentSetBrief] = useState<string | null>(null);
  const [imageOutputId, setImageOutputId] = useState<string | null>(null);
  const [imageSourceUrl, setImageSourceUrl] = useState<string | null>(null);
  const [savedMemeId, setSavedMemeId] = useState<string | null>(null);

  // AI image generation
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiImageBase64, setAiImageBase64] = useState<string | null>(null);
  const [aiGenerationRequestId, setAiGenerationRequestId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRefunded, setAiRefunded] = useState(0);
  // Mã của lần bấm "Vẽ meme". Giữ lại khi mất kết nối để bấm Thử lại không trừ
  // điểm lần hai; đổi mã mới khi máy chủ đã trả lời là hỏng (điểm đã hoàn).
  const drawRequestRef = useRef<string | null>(null);
  // Hết điểm không phải là một lỗi để đọc rồi thôi: nó là một việc cần làm tiếp.
  const [pointsNeeded, setPointsNeeded] = useState<{ required: number; current: number } | null>(null);

  // Reference images for meme ideas
  const [refImages, setRefImages] = useState<{ file: File; preview: string; base64: string; mimeType: string }[]>([]);
  const refInputRef = useRef<HTMLInputElement>(null);
  const imageDataCacheRef = useRef<Record<string, { base64: string; mimeType: string }>>({});
  const [aiRefImages, setAiRefImages] = useState<{ file: File; preview: string; base64: string; mimeType: string }[]>([]);
  const aiRefInputRef = useRef<HTMLInputElement>(null);
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState<string | null>(null);
  const [watermarkLogo, setWatermarkLogo] = useState<{ preview: string; base64: string; mimeType: string } | null>(null);
  const watermarkLogoInputRef = useRef<HTMLInputElement>(null);
  const [taggedCharacterIds, setTaggedCharacterIds] = useState<Set<string>>(new Set());
  const [oneOffCharacters, setOneOffCharacters] = useState<string[]>([]);
  const [oneOffInput, setOneOffInput] = useState("");
  const [noCharacters, setNoCharacters] = useState(false);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [showQuickCharacterModal, setShowQuickCharacterModal] = useState(false);
  const [quickCharacterSaving, setQuickCharacterSaving] = useState(false);
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    description: "",
    personality: "",
  });

  const fromMemeId = searchParams.get("fromMeme");
  const fromMode = searchParams.get("mode");
  // Ý tưởng truyền sẵn qua URL (từ onboarding) hay "Làm bản khác" từ Thư viện
  // nghĩa là người dùng muốn tự chỉnh.
  const showManual = searchParams.get("manual") === "1" || Boolean(searchParams.get("idea")) || Boolean(fromMemeId);
  const lineageSourceMemeId = fromMode === "regenerate" ? fromMemeId : null;
  const [prefillAppliedKey, setPrefillAppliedKey] = useState<string | null>(null);
  const resolvedWatermarkText = watermarkText ?? project?.name ?? "";

  // A landing-page brief must survive login, project selection and a refresh.
  // Save only editable intent here; files remain in memory so we never silently
  // re-upload a reference image after a page reload.
  useEffect(() => {
    const storageKey = `aida:content-draft:${projectId}`;
    const queryIdea = searchParams.get("idea");
    const landing = window.sessionStorage.getItem("aida:landing-draft");
    let saved: { idea?: string; format?: MemeFormat; voice?: string; character?: string; output?: string; noCharacters?: boolean; selectedCharacterIds?: string[]; taggedCharacterIds?: string[]; contentSetId?: string; contentSetFingerprint?: string } | null = null;
    try { saved = JSON.parse(window.sessionStorage.getItem(storageKey) || landing || "null"); } catch { /* ignore malformed local state */ }
    const selectedOutput = searchParams.get("output") || saved?.output;
    const formatFromOutput: Record<string, MemeFormat> = {
      "TikTok / Reels": "9:16",
      "Quảng cáo": "16:9",
      "Bài fanpage": "4:5",
      Meme: "1:1",
    };
    const nextIdea = queryIdea || saved?.idea;
    if (nextIdea && !idea) setIdea(nextIdea);
    const restoredFormat = saved?.format ?? (selectedOutput ? formatFromOutput[selectedOutput] : undefined);
    if (restoredFormat) setFormat(restoredFormat);
    if (saved?.voice) setAiCustomPrompt((current) => current || `Giọng thương hiệu: ${saved?.voice}`);
    if (saved?.noCharacters) setNoCharacters(true);
    if (Array.isArray(saved?.selectedCharacterIds) && characters.length) {
      const valid = saved.selectedCharacterIds.filter((id) => characters.some((item) => item.id === id));
      if (valid.length) setSelectedCharacterIds((current) => current.size ? current : new Set(valid));
    }
    if (Array.isArray(saved?.taggedCharacterIds) && characters.length) {
      const valid = saved.taggedCharacterIds.filter((id) => characters.some((item) => item.id === id));
      if (valid.length) setTaggedCharacterIds((current) => current.size ? current : new Set(valid));
    }
    if (saved?.contentSetId) {
      setContentSetId(saved.contentSetId);
      setContentSetBrief(saved.contentSetFingerprint ?? null);
    }
    const selectedName = searchParams.get("character") || saved?.character;
    if (selectedName && selectedName !== "Thêm nhân vật mới" && characters.length) {
      const matched = characters.find((item) => item.name.toLocaleLowerCase() === selectedName.toLocaleLowerCase());
      if (matched) setSelectedCharacterIds((current) => current.size ? current : new Set([matched.id]));
    }
  // This is restoration, not a reactive editor. Applying it once avoids
  // overwriting a deliberate change made in the composer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, characters.length]);

  useEffect(() => {
    window.sessionStorage.setItem(`aida:content-draft:${projectId}`, JSON.stringify({
      idea,
      format,
      voice: aiCustomPrompt.replace(/^Giọng thương hiệu:\s*/, ""),
      noCharacters,
      selectedCharacterIds: [...selectedCharacterIds],
      taggedCharacterIds: [...taggedCharacterIds],
      contentSetId,
      contentSetFingerprint: JSON.stringify({ brief: idea.trim(), cast: [...selectedCharacterIds].sort(), format }),
      character: [...selectedCharacterIds][0]
        ? characters.find((item) => item.id === [...selectedCharacterIds][0])?.name
        : undefined,
    }));
  }, [projectId, idea, format, aiCustomPrompt, noCharacters, selectedCharacterIds, taggedCharacterIds, contentSetId, characters]);

  const fetchProjectPoints = useCallback(async () => {
    if (IS_MOCK_MODE) {
      setProjectPoints(0);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/wallet`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProjectPoints(Number(data.points || 0));
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  useDeferredTask(fetchProjectPoints);

  const ensureContentSet = useCallback(async () => {
    const fingerprint = JSON.stringify({ brief: idea.trim(), cast: [...selectedCharacterIds].sort(), format });
    if (contentSetId && contentSetBrief === fingerprint) return contentSetId;
    const response = await fetch("/api/content-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project?.id || projectId,
        brief: idea.trim(),
        selected_character_ids: [...selectedCharacterIds],
        brand_voice: project?.brand_voice,
        audience: project?.audience,
        content_guidelines: project?.content_guidelines,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.contentSet?.id) throw new Error(payload.error || "Chưa lưu được. Bạn thử lại nhé.");
    setContentSetId(payload.contentSet.id);
    setContentSetBrief(fingerprint);
    return payload.contentSet.id as string;
  }, [contentSetId, contentSetBrief, project, projectId, idea, selectedCharacterIds, format]);

  const recordImageOutput = useCallback(async (meme: { id?: string; image_url?: string | null }, variation: ContentVariation, characterIds: string[]) => {
    const setId = await ensureContentSet();
    if (!meme.image_url) return;
    const response = await fetch(`/api/content-sets/${setId}/outputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "image", format, meme_id: meme.id,
        caption: variation.caption ?? variation.content.caption, media_url: meme.image_url,
        source_snapshot: { selected_character_ids: characterIds, format, variation: { headline: variation.headline, caption: variation.caption } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.output?.id) {
      setImageOutputId(payload.output.id);
      setImageSourceUrl(meme.image_url);
    }
  }, [ensureContentSet, format]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data:mime;base64, prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const imageUrlToInlineData = useCallback(async (url: string) => {
    if (imageDataCacheRef.current[url]) return imageDataCacheRef.current[url];
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Chưa tải được ảnh nhân vật (${response.status})`);
    const blob = await response.blob();
    const data = await compressImageToBase64(blob);
    imageDataCacheRef.current[url] = data;
    return data;
  }, []);

  const addRefImages = useCallback(async (files: File[]) => {
    const remaining = MAX_REF_IMAGES - refImages.length;
    if (remaining <= 0) return;

    const validFiles = files
      .filter(isAcceptableReferenceFile)
      .slice(0, remaining);

    const newImages = await Promise.all(
      validFiles.map(async (file) => {
        const compressed = await compressImageToBase64(file);
        return {
          file,
          preview: URL.createObjectURL(file),
          base64: compressed.base64,
          mimeType: compressed.mimeType,
        };
      })
    );

    setRefImages((prev) => [...prev, ...newImages]);
  }, [refImages.length]);

  const removeRefImage = useCallback((index: number) => {
    setRefImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addAiRefImages = useCallback(async (files: File[]) => {
    const remaining = MAX_REF_IMAGES - aiRefImages.length;
    if (remaining <= 0) return;

    const validFiles = files
      .filter(isAcceptableReferenceFile)
      .slice(0, remaining);

    const newImages = await Promise.all(
      validFiles.map(async (file) => ({
        file,
        preview: URL.createObjectURL(file),
        base64: await fileToBase64(file),
        mimeType: file.type,
      }))
    );

    setAiRefImages((prev) => [...prev, ...newImages]);
  }, [aiRefImages.length]);

  const removeAiRefImage = useCallback((index: number) => {
    setAiRefImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleWatermarkLogoUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Logo phải là file ảnh");
      return;
    }
    if (file.size > MAX_REF_SIZE_MB * 1024 * 1024) {
      toast.error(`Logo tối đa ${MAX_REF_SIZE_MB}MB`);
      return;
    }
    const preview = URL.createObjectURL(file);
    const base64 = await fileToBase64(file);
    setWatermarkLogo((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return { preview, base64, mimeType: file.type };
    });
  };

  const toggleTaggedCharacter = (characterId: string) => {
    setTaggedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  };

  const toggleSelectedCharacter = (characterId: string) => {
    setSelectedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  };

  const appendMentionToIdea = (name: string) => {
    setIdea((prev) => `${prev.trimEnd()} @${name} `.trimStart());
  };

  const addOneOffCharacter = () => {
    const value = oneOffInput.trim().replace(/^@+/, "");
    if (!value) return;
    if (oneOffCharacters.some((n) => n.toLowerCase() === value.toLowerCase())) {
      setOneOffInput("");
      return;
    }
    setOneOffCharacters((prev) => [...prev, value]);
    appendMentionToIdea(value);
    setOneOffInput("");
  };

  const removeOneOffCharacter = (name: string) => {
    setOneOffCharacters((prev) => prev.filter((n) => n !== name));
  };

  const openQuickCharacterModal = () => {
    setQuickCharacterForm({ name: "", description: "", personality: "" });
    setShowQuickCharacterModal(true);
  };

  const handleQuickCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickCharacterForm.name.trim();
    if (!name) return;
    setQuickCharacterSaving(true);
    try {
      const created = await createCharacter({
        name,
        description: quickCharacterForm.description.trim() || `Nhân vật ${name}`,
        personality: quickCharacterForm.personality.trim() || "Linh hoạt theo ngữ cảnh meme",
      });
      if (created) {
        setSelectedCharacterIds((current) => new Set([...current, created.id]));
        setTaggedCharacterIds((current) => new Set([...current, created.id]));
        appendMentionToIdea(created.name);
        toast.success(`Đã tạo nhanh nhân vật "${created.name}"`);
        setShowQuickCharacterModal(false);
      } else {
        toast.error("Chưa tạo được nhân vật. Bạn thử lại nhé.");
      }
    } catch {
      toast.error("Chưa tạo được nhân vật. Bạn thử lại nhé.");
    }
    setQuickCharacterSaving(false);
  };

  // Clipboard paste handler for reference images (Step 1 only)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (step !== 1) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addRefImages(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [step, addRefImages]);

  useEffect(() => {
    const selected = variations[selectedVariation];
    if (!selected) return;
    const timeoutId = window.setTimeout(() => {
      setTaggedCharacterIds(new Set(selected.suggested_characters.map((c) => c.character_id)));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedVariation, variations]);

  const mapMemeToVariation = useCallback((meme: { generated_content: MemeContent; selected_characters: SelectedCharacter[] }): ContentVariation => {
    const content = meme.generated_content || {
      headline: "",
      tone: "theo meme cũ",
      layout_suggestion: { text_position: "top", character_positions: [] },
    };
    const selectedChars = Array.isArray(meme.selected_characters) ? meme.selected_characters : [];

    return {
      content,
      suggested_characters: selectedChars.map((sc) => ({
        ...sc,
        reasoning: "Từ meme đã lưu",
        pose_id: sc.pose_id || "",
        pose_name: sc.pose_name || "",
        suggested_emotion: sc.emotion || "neutral",
      })),
      headline: content?.headline || "",
      subtext: content?.subtext,
      caption: content?.caption,
      image_prompt: content?.image_prompt,
      text_rendering_notes: content?.text_rendering_notes,
      tone: content?.tone || "theo meme cũ",
      text_position: content?.layout_suggestion?.text_position || "top",
    };
  }, []);

  useEffect(() => {
    if (!fromMemeId || !fromMode || memes.length === 0) return;

    const key = `${fromMode}:${fromMemeId}`;
    if (prefillAppliedKey === key) return;

    const sourceMeme = memes.find((m) => m.id === fromMemeId);
    if (!sourceMeme) return;

    const timeoutId = window.setTimeout(() => {
      setIdea(sourceMeme.original_idea || "");
      setFormat(sourceMeme.format);
      setEnableWatermark(Boolean(sourceMeme.has_watermark));

      if (fromMode === "reuse") {
        setStep(1);
        setPrefillAppliedKey(key);
        return;
      }

      if (fromMode === "regenerate") {
        const variation = mapMemeToVariation(sourceMeme);
        setVariations([variation]);
        setSelectedVariation(0);
        setHasPickedVariation(true);
        const selectedChars = Array.isArray(sourceMeme.selected_characters)
          ? sourceMeme.selected_characters
          : [];
        setTaggedCharacterIds(new Set(selectedChars.map((c) => c.character_id)));
        setAiCustomPrompt("");
        setAiImageBase64(null);
        setAiGenerationRequestId(null);
        setAiError(null);
        setStep(3);
        setPrefillAppliedKey(key);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fromMemeId, fromMode, memes, prefillAppliedKey, mapMemeToVariation]);

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    setGenerating(true);

    try {
      const persistedContentSetId = await ensureContentSet();
      const results = await generateContent({
        project_id: project?.id || projectId,
        idea: idea.trim(),
        characters: noCharacters ? [] : characters.filter((character) => selectedCharacterIds.has(character.id)),
        projectStyle: project?.style_prompt || undefined,
        adHocCharacters: noCharacters ? [] : oneOffCharacters,
        noCharacters,
        selectedCharacterIds: [...selectedCharacterIds],
        contentSetId: persistedContentSetId,
        referenceImages: refImages.length > 0
          ? refImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType }))
          : undefined,
      });

      if (results && results.length > 0) {
        const mapped: ContentVariation[] = results.map((v: Record<string, unknown>) => ({
          content: (v.content as MemeContent) || {
            headline: v.headline as string,
            subtext: v.subtext as string | undefined,
            caption: v.caption as string | undefined,
            image_prompt: v.image_prompt as string | undefined,
            text_rendering_notes: v.text_rendering_notes as string | undefined,
            layout_suggestion: { text_position: (v.text_position as string) || "top", character_positions: [] },
            tone: v.tone as string,
          },
          suggested_characters: ((v.suggested_characters as Record<string, unknown>[]) || []).map((sc) => ({
            character_id: sc.character_id as string,
            character_name: sc.character_name as string,
            pose_id: (sc.pose_id as string) || "",
            pose_name: (sc.pose_name as string) || "",
            emotion: (sc.suggested_emotion as EmotionTag) || (sc.emotion as EmotionTag) || "neutral",
            reasoning: (sc.reasoning as string) || "",
            suggested_emotion: (sc.suggested_emotion as string) || "neutral",
          })),
          headline: (v.headline as string) || (v.content as MemeContent)?.headline || "",
          subtext: (v.subtext as string) || (v.content as MemeContent)?.subtext,
          caption: (v.caption as string) || (v.content as MemeContent)?.caption,
          image_prompt: (v.image_prompt as string) || (v.content as MemeContent)?.image_prompt,
          text_rendering_notes: (v.text_rendering_notes as string) || (v.content as MemeContent)?.text_rendering_notes,
          tone: (v.tone as string) || (v.content as MemeContent)?.tone || "",
          text_position: (v.text_position as string) || (v.content as MemeContent)?.layout_suggestion?.text_position || "top",
          visual_direction: (v.visual_direction as ContentVariation["visual_direction"]) || undefined,
        }));
        setVariations(mapped);
        setSelectedVariation(0);
        setHasPickedVariation(false);
        setStep(2);
      }
    } catch (error) {
      console.error("Generation failed:", error);
      toast.error("Chưa viết được ý tưởng. Bạn thử lại nhé.");
    }

    setGenerating(false);
  };

  const handleAssistImage = async () => {
    if (!idea.trim()) return;
    setGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/creative-assists`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "image_plan", intent: idea.trim(), selectedCharacterIds: noCharacters ? [] : [...selectedCharacterIds] }),
      });
      const accepted = await response.json();
      if (!response.ok) throw new Error(accepted.error || "Chưa gợi ý được. Bạn thử lại nhé.");
      let result: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const jobResponse = await fetch(`/api/projects/${projectId}/creative-assists/${accepted.jobId}`, { cache: "no-store" });
        const job = await jobResponse.json();
        if (!jobResponse.ok) throw new Error(job.error || "Chưa đọc được gợi ý. Bạn thử lại nhé.");
        if (job.job.status === "completed") { result = job.job.result; break; }
        if (job.job.status === "failed") throw new Error(job.job.error?.message || "Chưa gợi ý được. Bạn thử lại nhé.");
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      if (!result) throw new Error("Gợi ý đang lâu hơn bình thường. Bạn thử lại sau nhé.");
      const characterIds = Array.isArray(result.characterIds) ? result.characterIds.filter((value): value is string => typeof value === "string") : [];
      const textPosition = ["top", "bottom", "center", "split"].includes(String(result.textPosition)) ? result.textPosition as "top" | "bottom" | "center" | "split" : "bottom";
      const variation: ContentVariation = {
        content: { headline: typeof result.headline === "string" ? result.headline : "", subtext: typeof result.subtext === "string" ? result.subtext : undefined, caption: typeof result.caption === "string" ? result.caption : undefined, image_prompt: typeof result.imagePrompt === "string" ? result.imagePrompt : undefined, layout_suggestion: { text_position: textPosition, character_positions: [] }, tone: "natural" },
        suggested_characters: characterIds.map((characterId) => ({ character_id: characterId, character_name: characters.find((item) => item.id === characterId)?.name || "", emotion: "neutral" as EmotionTag, pose_id: "", pose_name: "", suggested_emotion: "", reasoning: "Nhân vật được chọn cho cảnh này." })),
        headline: typeof result.headline === "string" ? result.headline : "", subtext: typeof result.subtext === "string" ? result.subtext : undefined, caption: typeof result.caption === "string" ? result.caption : undefined, image_prompt: typeof result.imagePrompt === "string" ? result.imagePrompt : undefined, tone: "natural", text_position: textPosition, visual_direction: { scene: typeof result.visualDirection === "string" ? result.visualDirection : "" },
      };
      setVariations([variation]); setSelectedVariation(0); setHasPickedVariation(true); setTaggedCharacterIds(new Set(characterIds)); setStep(3);
      toast.success("Đã có chữ và cảnh gợi ý. Xem qua rồi bấm Vẽ meme.");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Chưa gợi ý được. Bạn thử lại nhé."); } finally { setGenerating(false); }
  };

  const handleDirectFlow = async () => {
    const normalizedIdea = idea.trim();
    if (!normalizedIdea) return;

    try {
      await ensureContentSet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chưa lưu được. Bạn thử lại nhé.");
      return;
    }

    const promptWithoutMentions = normalizedIdea.replace(/@([\p{L}\p{N}_\-\s]+)/gu, "$1").trim();

    let parsedHeadline = "";
    let parsedAiCustomPrompt = "";
    let parsedTextRenderingNotes = "";

    const scriptRegex = /(khung hình|panel|thoại|\bnói:|\btrả lời:|\bđáp:|\bhỏi:|\bbảo:)/i;
    if (scriptRegex.test(promptWithoutMentions) || promptWithoutMentions.split('\n').length > 1) {
      parsedHeadline = "";
      parsedTextRenderingNotes = ""; // gemini-image.ts prompt now handles script formats directly
      parsedAiCustomPrompt = promptWithoutMentions;
    } else {
      const quoteMatch = promptWithoutMentions.match(/(?:["“])([\s\S]*?)(?:["”])/);
      if (quoteMatch && quoteMatch[1].trim().length > 10) {
        parsedHeadline = quoteMatch[1].trim();
        parsedAiCustomPrompt = promptWithoutMentions.replace(quoteMatch[0], "").trim();
      } else {
        const isImageDescription = /^(vẽ|tạo|hình|ảnh|cảnh|scene|mascot|nhân vật|meme về|một)/i.test(promptWithoutMentions);
        if (isImageDescription || promptWithoutMentions.length > 80) {
          parsedHeadline = "";
          parsedAiCustomPrompt = promptWithoutMentions;
        } else {
          parsedHeadline = promptWithoutMentions;
          parsedAiCustomPrompt = "";
        }
      }
    }

    const selectedChars = noCharacters ? [] : characters.filter((c) => selectedCharacterIds.has(c.id));
    const directVariation: ContentVariation = {
      content: {
        headline: parsedHeadline,
        subtext: undefined,
        caption: undefined,
        tone: "theo ý tưởng người dùng",
        layout_suggestion: {
          text_position: "top",
          character_positions: [],
        },
      },
      suggested_characters: selectedChars.map((c) => {
        const firstPose = c.poses[0];
        return {
          character_id: c.id,
          character_name: c.name,
          pose_id: firstPose?.id || "",
          pose_name: firstPose?.name || "",
          emotion: firstPose?.emotion || "neutral",
          suggested_emotion: firstPose?.emotion || "neutral",
          reasoning: "Người dùng chọn thủ công",
        };
      }),
      headline: parsedHeadline,
      text_rendering_notes: parsedTextRenderingNotes || undefined,
      subtext: undefined,
      caption: undefined,
      tone: "theo ý tưởng người dùng",
      text_position: "top",
    };

    setVariations([directVariation]);
    setSelectedVariation(0);
    setHasPickedVariation(true);
    setTaggedCharacterIds(new Set(selectedChars.map((c) => c.id)));
    setAiCustomPrompt(parsedAiCustomPrompt);
    setStep(3);
  };

  // Phase 3: Generate meme with AI
  const handleAiGenerate = async () => {
    const v = variations[selectedVariation];
    if (!v) return;

    setAiGenerating(true);
    setAiError(null);
    setAiRefunded(0);
    setAiImageBase64(null);
    setAiGenerationRequestId(null);
    setImageSourceUrl(null);
    setSavedMemeId(null);
    setImageOutputId(null);

    try {
      const buildFullDescription = (desc?: string, personality?: string) =>
        [desc, personality ? `Tính cách: ${personality}` : ""].filter(Boolean).join(". ");

      let sourceCharacters: {
        name: string;
        emotion: string;
        description: string;
        characterId?: string;
        poseId?: string;
        poseImageBase64?: string;
        poseMimeType?: string;
      }[] = [];

      if (!noCharacters) {
        const taggedCharacters = characters.filter((c) => taggedCharacterIds.has(c.id));

        const sourceCharacterInputs = taggedCharacters.length > 0
          ? taggedCharacters.map((char) => {
              const suggested = v.suggested_characters.find((sc) => sc.character_id === char.id);
              return {
                id: char.id,
                name: char.name,
                emotion: suggested?.suggested_emotion || suggested?.emotion || "neutral",
                description: buildFullDescription(char.description, char.personality),
              };
            })
          : v.suggested_characters.map((sc) => {
              const char = characters.find((c) => c.id === sc.character_id);
              return {
                id: sc.character_id,
                name: sc.character_name,
                emotion: sc.suggested_emotion || sc.emotion,
                description: buildFullDescription(char?.description, char?.personality),
              };
            });

        sourceCharacters = await Promise.all(
          sourceCharacterInputs.map(async (item) => {
            const fullChar = characters.find((c) => c.id === item.id);
            const suggestedPoseId = v.suggested_characters.find((sc) => sc.character_id === item.id)?.pose_id;
            const selectedPose = fullChar?.poses.find((p) => p.id === suggestedPoseId) || fullChar?.poses[0];
            const refUrl = selectedPose?.image_url || fullChar?.avatar_url || fullChar?.poses[0]?.image_url;

            if (!fullChar) {
              throw new Error(`Không tìm thấy nhân vật "${item.name}". Bạn chọn lại nhân vật nhé.`);
            }

            if (!refUrl || refUrl.startsWith("/mock/")) {
              throw new Error(`Nhân vật "${item.name}" chưa có ảnh. Thêm ảnh ở trang Nhân vật trước nhé.`);
            }

            const inline = await imageUrlToInlineData(refUrl);
            return {
              name: item.name,
              emotion: item.emotion,
              description: item.description,
              characterId: item.id,
              poseId: selectedPose?.id,
              poseImageBase64: inline.base64,
              poseMimeType: inline.mimeType,
            };
          })
        );
      }

      const mergedRefImages = [...refImages, ...aiRefImages].slice(0, 4);

      const autoVisualPrompt = buildAutoVisualPrompt(v);
      const finalCustomPrompt = [autoVisualPrompt, aiCustomPrompt.trim()].filter(Boolean).join("\n\n");

      let watermarkLogoData: { base64?: string; mimeType?: string } = {};
      if (enableWatermark) {
        if (watermarkLogo) {
          watermarkLogoData = { base64: watermarkLogo.base64, mimeType: watermarkLogo.mimeType };
        } else if (project?.watermark_url) {
          try {
            const inlineLogo = await imageUrlToInlineData(project.watermark_url);
            watermarkLogoData = { base64: inlineLogo.base64, mimeType: inlineLogo.mimeType };
          } catch {
            // Keep text watermark fallback if project logo cannot be loaded
          }
        }
      }

      const usedCharacters: SelectedCharacter[] = sourceCharacters.map((character) => ({
        character_id: character.characterId || "",
        character_name: character.name,
        pose_id: character.poseId || "",
        pose_name: "",
        emotion: character.emotion as EmotionTag,
      }));
      const params = {
        project_id: project?.id || projectId,
        source_meme_id: lineageSourceMemeId,
        type: "meme" as const,
        headline: v.headline,
        subtext: v.subtext,
        tone: v.tone,
        textPosition: v.text_position,
        characters: sourceCharacters,
        format,
        style: project?.style_prompt || undefined,
        customPrompt: finalCustomPrompt || undefined,
        watermark: {
          enabled: enableWatermark,
          text: enableWatermark ? (resolvedWatermarkText.trim() || undefined) : undefined,
          logoBase64: watermarkLogoData.base64,
          logoMimeType: watermarkLogoData.mimeType,
        },
        backgroundDescription: undefined,
        referenceImages: mergedRefImages.length > 0
          ? mergedRefImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType }))
          : undefined,
      };
      const save = {
        original_idea: idea,
        generated_content: v.content,
        selected_characters: usedCharacters,
        has_watermark: enableWatermark,
      };
      if (!drawRequestRef.current) drawRequestRef.current = crypto.randomUUID();
      let result = await drawMeme(params, drawRequestRef.current, save);
      // Mã cũ đã dùng cho một lần vẽ hỏng (điểm đã hoàn): vẽ lại bằng mã mới.
      if (!result.ok && result.code === "REQUEST_USED") {
        drawRequestRef.current = crypto.randomUUID();
        result = await drawMeme(params, drawRequestRef.current, save);
      }

      if (!result.ok) {
        if (!result.network && result.code !== "DRAW_IN_PROGRESS") drawRequestRef.current = null;
        trackEvent("generate_image_failed", {
          action: "meme",
          project_id: project?.id || projectId,
          reason: result.code || (result.network ? "network" : "api_error"),
        });
        if (result.code === "INSUFFICIENT_POINTS" && typeof result.required === "number")
          setPointsNeeded({ required: result.required, current: result.current ?? 0 });
        setAiRefunded(result.refundedPoints ?? 0);
        setAiError(result.error);
      } else {
        drawRequestRef.current = null;
        setAiImageBase64(result.image || null);
        setImageSourceUrl(result.imageUrl);
        setAiGenerationRequestId(result.requestId);
        if (result.droppedReferences) {
          toast.warning(`${result.droppedReferences} ảnh mẫu không dùng được vì quá số lượng cho phép.`);
        }
        trackEvent("generate_image_success", {
          action: "meme",
          project_id: project?.id || projectId,
          points_spent: result.pointsUsed,
          request_id: result.requestId || undefined,
        });
        if (result.pointsUsed > 0)
          trackEvent("project_points_spent", {
            action: "meme",
            project_id: project?.id || projectId,
            points: result.pointsUsed,
          });
        const characterIds = sourceCharacters.flatMap((character) => character.characterId ? [character.characterId] : []);
        if (result.memeId && result.imageUrl) {
          setSavedMemeId(result.memeId);
          toast.success("Đã lưu vào Thư viện");
          // Ghi vào ý tưởng gốc chỉ để gom bài; hỏng thì ảnh vẫn đã nằm trong Thư viện.
          recordImageOutput({ id: result.memeId, image_url: result.imageUrl }, v, characterIds).catch(() => undefined);
        } else if (result.image) {
          // Máy chủ chưa lưu được: lưu từ trình duyệt như trước.
          try {
            const savedMeme = await saveMeme({
              ...save,
              format,
              image_base64: `data:image/png;base64,${result.image}`,
              source_meme_id: lineageSourceMemeId,
              generation_request_id: result.requestId,
            });
            setSavedMemeId(savedMeme?.id ?? null);
            setImageSourceUrl(savedMeme?.image_url ?? null);
            await recordImageOutput(savedMeme, v, characterIds);
            trackEvent("save_meme_success", {
              project_id: project?.id || projectId,
              request_id: result.requestId || undefined,
            });
            toast.success("Đã lưu vào Thư viện");
          } catch (saveErr) {
            trackEvent("save_meme_failed", {
              project_id: project?.id || projectId,
              request_id: result.requestId || undefined,
            });
            toast.error(saveErr instanceof Error ? saveErr.message : "Đã vẽ xong nhưng chưa lưu được vào Thư viện. Bấm Lưu để thử lại nhé.");
          }
        }
        fetchProjectPoints();
      }
    } catch (err) {
      trackEvent("generate_image_exception", {
        action: "meme",
        project_id: project?.id || projectId,
      });
      setAiError(err instanceof Error ? err.message : "Chưa vẽ được. Bạn thử lại nhé.");
    }

    setAiGenerating(false);
  };

  const aiImageSrc = aiImageBase64 ? `data:image/png;base64,${aiImageBase64}` : imageSourceUrl;

  const handleExport = () => {
    if (!aiImageSrc) return;
    const link = document.createElement("a");
    link.download = `meme-${Date.now()}.png`;
    link.href = aiImageSrc;
    link.click();
  };

  const handleSave = async () => {
    if (!variations[selectedVariation]) return;
    if (imageOutputId || savedMemeId) {
      toast.success("Ảnh này đã có trong Thư viện.");
      return;
    }
    setSaving(true);

    if (!aiImageBase64) {
      toast.error("Vẽ meme xong mới lưu được.");
      setSaving(false);
      return;
    }
    const imageData = `data:image/png;base64,${aiImageBase64}`;

    const v = variations[selectedVariation];
    try {
      const savedMeme = await saveMeme({
        original_idea: idea,
        generated_content: v.content,
        selected_characters: v.suggested_characters.filter((character) => taggedCharacterIds.has(character.character_id)),
        format,
        has_watermark: enableWatermark,
        image_base64: imageData,
        source_meme_id: lineageSourceMemeId,
        generation_request_id: aiGenerationRequestId,
      });
      setSavedMemeId(savedMeme?.id ?? null);
      setImageSourceUrl(savedMeme?.image_url ?? null);
      await recordImageOutput(savedMeme, v, [...taggedCharacterIds]);
      toast.success("Đã lưu vào Thư viện");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chưa lưu được. Bạn thử lại nhé.");
    }
    setSaving(false);
  };

  const handleReset = () => {
    // Soft reset: quay về bước ý tưởng nhưng giữ lại idea/ref để sửa nhanh
    if (fromMemeId || fromMode) {
      router.replace(`/projects/${projectId}/generate`);
    }

    setStep(1);
    setVariations([]);
    setSelectedVariation(0);
    setHasPickedVariation(false);
    setAiImageBase64(null);
    setAiGenerationRequestId(null);
    setAiError(null);
    setAiRefunded(0);
    setImageSourceUrl(null);
    setSavedMemeId(null);
    setImageOutputId(null);
    drawRequestRef.current = null;
    setAiGenerating(false);
    setGenerating(false);
    setSaving(false);
    setPrefillAppliedKey(null);
    setTaggedCharacterIds(new Set());
    setSelectedCharacterIds(new Set());
    setNoCharacters(false);
  };

  if (!loading && !project) notFound();

  const headerActions = showManual && step > 1 ? (
    <Button variant="outline" onClick={handleReset}>
      <RotateCcw size={16} /> Bắt đầu lại
    </Button>
  ) : undefined;
  const formatChoices = Object.entries(FORMAT_DIMENSIONS) as [MemeFormat, { width: number; height: number; label: string }][];
  const drawPrice = <PriceLine points={POINT_COSTS.meme} available={projectPoints} />;

  return (
    <PageContainer>
      <MemeAreaHeader projectRef={projectId} mode={showManual ? "manual" : "ai"} actions={headerActions} />

      {loading ? (
        <div role="status" aria-label="Đang tải" className="space-y-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          {/* Luồng chính: AIDA làm trọn meme. Chỉnh tay là một chế độ trong thanh trên. */}
          {!showManual && (
            <MemeAutopilot
              projectId={projectId}
              workspaceVersion={(project as { workspace_version?: number } | null)?.workspace_version ?? null}
              availablePoints={IS_MOCK_MODE ? null : projectPoints}
              onPointsChanged={fetchProjectPoints}
            />
          )}

          {fromMemeId && fromMode === "regenerate" && (
            <Alert tone="info" className="mb-4">
              Đang làm bản khác từ meme này. Sửa mô tả nếu muốn rồi bấm &ldquo;Vẽ meme&rdquo;.
            </Alert>
          )}

          {fromMemeId && fromMode === "reuse" && (
            <Alert tone="info" className="mb-4">
              Đã điền lại ý tưởng cũ. Sửa nếu muốn rồi làm tiếp.
            </Alert>
          )}

          {/* Step 1: Input */}
          {showManual && step === 1 && (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
              <Card className="min-w-0">
                <CardHeader>
                  <h2 className="flex items-center gap-2 text-lg font-semibold th-text-primary">
                    <Sparkles size={20} className="th-text-accent" aria-hidden />
                    Ý tưởng
                  </h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    id="idea"
                    aria-label="Ý tưởng"
                    placeholder='Ví dụ: Sếp nhắn "em rảnh không" lúc 10 giờ tối…'
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    rows={5}
                    className="text-base"
                  />
                  {/* Reference image upload */}
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium th-text-secondary">
                      <ImageIcon size={12} aria-hidden />
                      Ảnh mẫu (tuỳ chọn)
                    </p>
                    <div
                      className="cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors th-border th-bg-hover"
                      onClick={() => refInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addRefImages(Array.from(e.dataTransfer.files));
                      }}
                    >
                      <input
                        ref={refInputRef}
                        aria-label="Chọn ảnh mẫu"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addRefImages(Array.from(e.target.files || []));
                          e.target.value = "";
                        }}
                      />
                      {refImages.length === 0 ? (
                        <div className="py-2">
                          <Upload size={20} className="mx-auto mb-2 th-text-muted" aria-hidden />
                          <p className="text-sm th-text-tertiary">Bấm để chọn, kéo thả hoặc dán ảnh vào đây</p>
                          <p className="mt-1 text-xs th-text-muted">
                            Tối đa {MAX_REF_IMAGES} ảnh, mỗi ảnh &le; {MAX_REF_SIZE_MB}MB
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap justify-center gap-2">
                            {refImages.map((img, idx) => (
                              <div key={idx} className="group relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={img.preview}
                                  alt={`Ảnh mẫu ${idx + 1}`}
                                  className="h-20 w-20 rounded-lg border object-cover th-border"
                                />
                                <button
                                  type="button"
                                  aria-label={`Bỏ ảnh mẫu ${idx + 1}`}
                                  onClick={(e) => { e.stopPropagation(); removeRefImage(idx); }}
                                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full th-bg-danger th-text-on-primary"
                                >
                                  <X size={12} aria-hidden />
                                </button>
                              </div>
                            ))}
                            {refImages.length < MAX_REF_IMAGES && (
                              <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed th-border th-text-muted">
                                <Upload size={16} aria-hidden />
                              </div>
                            )}
                          </div>
                          <p className="text-xs th-text-muted">Meme sẽ bám theo bối cảnh và người, vật trong ảnh</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl p-2 th-bg-tertiary">
                      <input
                        type="checkbox"
                        checked={noCharacters}
                        onChange={(e) => {
                          setNoCharacters(e.target.checked);
                          if (e.target.checked) {
                            setSelectedCharacterIds(new Set());
                            setOneOffCharacters([]);
                            setTaggedCharacterIds(new Set());
                          }
                        }}
                        className="h-4 w-4 th-accent-control"
                      />
                      <span className="text-sm th-text-secondary">Không dùng nhân vật của kênh</span>
                      <span className="ml-auto hidden text-xs th-text-muted sm:inline">Ví dụ: ảnh sự kiện, ảnh có sẵn…</span>
                    </label>

                    {!noCharacters && (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs th-text-tertiary">Nhân vật có trong meme:</p>
                          <Button size="sm" variant="outline" onClick={openQuickCharacterModal}>
                            <Plus size={14} aria-hidden /> Thêm nhân vật
                          </Button>
                        </div>

                        {characters.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {characters.map((c) => {
                              const rawAvatar = c.avatar_url || c.poses[0]?.image_url;
                              const avatar = rawAvatar && !rawAvatar.startsWith("/mock/") ? rawAvatar : null;
                              const selected = selectedCharacterIds.has(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => toggleSelectedCharacter(c.id)}
                                  className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-colors ${
                                    selected ? "th-border-accent th-bg-accent-light" : "th-border th-bg-tertiary th-bg-hover"
                                  }`}
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-semibold th-bg-card th-text-muted">
                                    {avatar ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={avatar} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      c.name[0]?.toUpperCase()
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium th-text-primary">@{c.name}</p>
                                    <p className="text-xs th-text-muted">{c.poses.length} biểu cảm</p>
                                  </div>
                                  <span className={`ml-auto text-xs ${selected ? "th-text-accent" : "th-text-muted"}`}>
                                    {selected ? "Đã chọn" : "Chọn"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs th-text-muted">Kênh chưa có nhân vật. Vẫn làm meme được, hoặc tạo nhanh ở nút trên.</p>
                        )}

                        <div>
                          <label htmlFor="one-off-character" className="mb-1.5 block text-xs th-text-tertiary">Nhân vật chỉ dùng cho meme này:</label>
                          <div className="flex gap-2">
                            <Input
                              id="one-off-character"
                              placeholder="Ví dụ: anh xe ôm công nghệ, chú mèo hàng xóm…"
                              value={oneOffInput}
                              onChange={(e) => setOneOffInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addOneOffCharacter();
                                }
                              }}
                              className="text-sm"
                            />
                            <Button type="button" variant="outline" onClick={addOneOffCharacter}>
                              <Plus size={14} aria-hidden /> Thêm
                            </Button>
                          </div>
                          {oneOffCharacters.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {oneOffCharacters.map((name) => (
                                <Chip key={name} selected onClick={() => removeOneOffCharacter(name)} aria-label={`Bỏ nhân vật ${name}`}>
                                  @{name} <X size={12} aria-hidden />
                                </Chip>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs th-text-tertiary">Khổ ảnh:</p>
                    <div role="radiogroup" aria-label="Khổ ảnh" className="flex flex-wrap gap-1.5">
                      {formatChoices.map(([key]) => (
                        <Chip key={key} role="radio" selected={format === key} onClick={() => setFormat(key)}>
                          {key}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button size="lg" className="w-full" onClick={handleAssistImage} loading={generating} disabled={!idea.trim()}>
                      <Zap size={18} aria-hidden />
                      {generating ? "Đang viết…" : "Gợi ý chữ và cảnh"}
                    </Button>
                    <Button size="lg" variant="outline" className="w-full" onClick={handleDirectFlow} disabled={!idea.trim()}>
                      <Wand2 size={18} aria-hidden />
                      Tự viết mô tả ảnh
                    </Button>
                  </div>
                  <p className="text-xs th-text-tertiary">Gợi ý chữ không tốn điểm. Chỉ tính điểm khi bấm Vẽ meme ở bước sau.</p>
                </CardContent>
              </Card>
              <Card className="p-5 lg:sticky lg:top-6">
                <p className="text-sm font-medium th-text-secondary">Xem trước</p>
                <EmptyState
                  className="mt-4 aspect-[4/5] max-h-[620px] justify-center"
                  icon={ImageIcon}
                  title="Ảnh của bạn sẽ hiện ở đây"
                  hint="Chọn nhân vật hoặc thêm ảnh mẫu khi cần giữ đúng người, vật và bối cảnh."
                />
              </Card>
            </div>
          )}

          {/* Step 2: Select variation */}
          {showManual && step === 2 && (
            <div className="space-y-5">
              <p className="text-sm th-text-secondary">Có {variations.length} phương án. Chọn một để vẽ.</p>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {variations.map((v, index) => (
                  <Card key={index} hover onClick={() => { setSelectedVariation(index); setHasPickedVariation(true); }}
                    className={selectedVariation === index ? "th-border-accent th-shadow-lg" : ""}>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-lg px-2 py-1 text-xs ${selectedVariation === index ? "th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-tertiary"}`}>
                          Phương án {index + 1}
                        </span>
                        {v.tone && <span className="rounded-lg px-2 py-1 text-xs th-bg-tertiary th-text-tertiary">{v.tone}</span>}
                      </div>
                      <div>
                        <p className="text-lg font-semibold leading-tight th-text-primary">&ldquo;{v.headline}&rdquo;</p>
                        {v.subtext && <p className="mt-1 text-sm th-text-secondary">{v.subtext}</p>}
                      </div>
                      {v.caption && (
                        <div className="rounded-lg p-2 th-bg-tertiary">
                          <p className="mb-0.5 text-xs th-text-tertiary">Nội dung bài đăng:</p>
                          <p className="text-xs th-text-secondary">{v.caption}</p>
                        </div>
                      )}
                      {v.suggested_characters.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs th-text-muted">Nhân vật:</p>
                          {v.suggested_characters.map((sc, ci) => (
                            <div key={ci} className="flex items-center gap-2 py-1">
                              <span className="text-sm th-text-secondary">{sc.character_name}</span>
                              <span className="text-xs th-text-muted">· {sc.reasoning}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {v.visual_direction && (
                        <div className="rounded-lg p-2 th-bg-tertiary">
                          <p className="mb-1 text-xs th-text-tertiary">Cảnh sẽ vẽ:</p>
                          <p className="line-clamp-3 text-xs th-text-secondary">
                            {v.visual_direction.scene || v.visual_direction.character_styling || v.visual_direction.composition || "Đã có mô tả cảnh chi tiết"}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>Quay lại</Button>
                <Button variant="outline" onClick={handleGenerate} loading={generating}>
                  <RotateCcw size={16} aria-hidden /> {generating ? "Đang gợi ý…" : "Gợi ý 3 ý khác"}
                </Button>
                <Button onClick={() => setStep(3)} disabled={!hasPickedVariation}>Tiếp tục xem trước <ChevronRight size={16} aria-hidden /></Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview & Export */}
          {showManual && step === 3 && variations[selectedVariation] && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {aiGenerating ? (
                  <JobStatus
                    state="working"
                    title="Đang vẽ meme"
                    detail="Mất khoảng 10–30 giây. Ảnh tự lưu vào Thư viện khi xong."
                  />
                ) : aiError ? (
                  <JobStatus
                    state="failed"
                    title="Chưa vẽ được"
                    detail={aiError}
                    refundedPoints={aiRefunded}
                    onRetry={handleAiGenerate}
                  >
                    {drawPrice}
                  </JobStatus>
                ) : aiImageSrc ? (
                  <Card className="p-4 sm:p-6">
                    <div className="flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={aiImageSrc} alt="Meme vừa vẽ" className="block max-h-[600px] w-auto max-w-full rounded-2xl" />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download size={14} aria-hidden /> Tải ảnh
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleAiGenerate}>
                        <RotateCcw size={14} aria-hidden /> Vẽ lại
                      </Button>
                      {savedMemeId ? (
                        <Link
                          href={`/projects/${projectId}/video?from=${encodeURIComponent(savedMemeId)}`}
                          className={buttonClasses("outline", "sm")}
                        >
                          <Clapperboard size={14} aria-hidden /> Làm video từ ảnh này
                        </Link>
                      ) : (
                        <Button variant="outline" size="sm" disabled title="Lưu ảnh xong mới làm video được">
                          <Clapperboard size={14} aria-hidden /> Làm video từ ảnh này
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 flex justify-center">{drawPrice}</div>
                  </Card>
                ) : (
                  <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl th-bg-accent-light th-text-accent">
                      <Wand2 size={20} aria-hidden />
                    </span>
                    <div>
                      <p className="text-lg font-semibold th-text-primary">Vẽ meme</p>
                      <p className="mt-1 max-w-sm text-sm th-text-tertiary">
                        Vẽ ảnh hoàn chỉnh từ chữ, nhân vật và kiểu ảnh bạn đã chọn. Xong là tự lưu vào Thư viện.
                      </p>
                    </div>
                    {drawPrice}
                    <Button size="lg" onClick={handleAiGenerate}>
                      <Wand2 size={18} aria-hidden />
                      Vẽ meme
                    </Button>
                  </Card>
                )}
              </div>

              {/* Controls sidebar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader><h3 className="text-sm font-semibold th-text-primary">Khổ ảnh</h3></CardHeader>
                  <CardContent>
                    <div role="radiogroup" aria-label="Khổ ảnh" className="flex flex-wrap gap-1.5">
                      {formatChoices.map(([key, val]) => (
                        <Chip key={key} role="radio" selected={format === key} onClick={() => setFormat(key)} title={val.label}>
                          {key}
                        </Chip>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><h3 className="text-sm font-semibold th-text-primary">Logo</h3></CardHeader>
                  <CardContent className="space-y-3">
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-sm th-text-secondary">Đóng logo ở góc dưới bên phải</span>
                      <input
                        type="checkbox"
                        checked={enableWatermark}
                        onChange={(e) => setEnableWatermark(e.target.checked)}
                        className="h-4 w-4 th-accent-control"
                      />
                    </label>

                    {enableWatermark && (
                      <>
                        <Input
                          id="watermark-text"
                          label="Chữ ký kênh"
                          placeholder="Ví dụ: @tenkenh"
                          value={resolvedWatermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          className="text-sm"
                        />

                        <div>
                          <p className="mb-1.5 text-xs font-medium th-text-secondary">Logo (tuỳ chọn)</p>
                          <div
                            className="cursor-pointer rounded-xl border p-3 text-center th-border th-bg-hover"
                            onClick={() => watermarkLogoInputRef.current?.click()}
                          >
                            <input
                              ref={watermarkLogoInputRef}
                              aria-label="Chọn ảnh logo"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                void handleWatermarkLogoUpload(e.target.files?.[0] || null);
                                e.target.value = "";
                              }}
                            />
                            {watermarkLogo ? (
                              <div className="flex items-center justify-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={watermarkLogo.preview} alt="Logo" className="h-10 w-10 rounded object-contain" />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (watermarkLogo) URL.revokeObjectURL(watermarkLogo.preview);
                                    setWatermarkLogo(null);
                                  }}
                                >
                                  Bỏ logo
                                </Button>
                              </div>
                            ) : (
                              <p className="text-xs th-text-muted">Chọn ảnh logo để đóng vào ảnh</p>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><h3 className="text-sm font-semibold th-text-primary">Ảnh mẫu và ghi chú</h3></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium th-text-secondary">
                        <ImageIcon size={12} aria-hidden /> Ảnh mẫu để vẽ theo
                      </p>
                      <div
                        className="cursor-pointer rounded-xl border-2 border-dashed p-3 text-center transition-colors th-border th-bg-hover"
                        onClick={() => aiRefInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          addAiRefImages(Array.from(e.dataTransfer.files));
                        }}
                      >
                        <input
                          ref={aiRefInputRef}
                          aria-label="Chọn ảnh mẫu để vẽ theo"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            addAiRefImages(Array.from(e.target.files || []));
                            e.target.value = "";
                          }}
                        />
                        {aiRefImages.length === 0 ? (
                          <div className="py-1">
                            <Upload size={16} className="mx-auto mb-1 th-text-muted" aria-hidden />
                            <p className="text-xs th-text-tertiary">Thả ảnh mẫu để vẽ theo bố cục và kiểu ảnh</p>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-2">
                            {aiRefImages.map((img, idx) => (
                              <div key={idx} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.preview} alt={`Ảnh mẫu ${idx + 1}`} className="h-14 w-14 rounded-lg border object-cover th-border" />
                                <button
                                  type="button"
                                  aria-label={`Bỏ ảnh mẫu ${idx + 1}`}
                                  onClick={(e) => { e.stopPropagation(); removeAiRefImage(idx); }}
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full th-bg-danger th-text-on-primary"
                                >
                                  <X size={12} aria-hidden />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {!noCharacters && characters.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium th-text-secondary">
                          <Tags size={12} aria-hidden /> Gắn nhân vật có trong ảnh
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {characters.map((char) => (
                            <Chip key={char.id} selected={taggedCharacterIds.has(char.id)} onClick={() => toggleTaggedCharacter(char.id)}>
                              {char.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}

                    <Textarea
                      id="ai-custom-prompt"
                      label="Ghi chú"
                      placeholder="Ví dụ: theo bố cục ảnh mẫu 1, chữ đặt giữa, giọng châm nhẹ"
                      value={aiCustomPrompt}
                      onChange={(e) => setAiCustomPrompt(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                  </CardContent>
                </Card>

                {variations[selectedVariation].caption && (
                  <Card>
                    <CardHeader><h3 className="text-sm font-semibold th-text-primary">Nội dung bài đăng</h3></CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm th-text-secondary">{variations[selectedVariation].caption}</p>
                      <Button variant="ghost" size="sm" className="mt-2"
                        onClick={() => {
                          navigator.clipboard.writeText(variations[selectedVariation].caption || "");
                          toast.success("Đã chép nội dung bài đăng");
                        }}>
                        Sao chép
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  <Button className="w-full" size="lg" onClick={handleExport} disabled={!aiImageSrc}>
                    <Download size={18} aria-hidden /> Tải ảnh
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    size="lg"
                    onClick={handleSave}
                    loading={saving}
                    disabled={!aiImageSrc || Boolean(imageOutputId || savedMemeId)}
                  >
                    <Save size={18} aria-hidden /> {imageOutputId || savedMemeId ? "Đã lưu vào Thư viện" : "Lưu vào Thư viện"}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setStep(2)} disabled={variations.length < 2}>
                    Chọn phương án khác
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <OutOfPointsModal
        open={Boolean(pointsNeeded)}
        onClose={() => setPointsNeeded(null)}
        required={pointsNeeded?.required ?? 0}
        current={pointsNeeded?.current ?? 0}
        action="Vẽ meme"
        onFunded={() => {
          setPointsNeeded(null);
          fetchProjectPoints();
          void handleAiGenerate();
        }}
      />

      <Modal isOpen={showQuickCharacterModal} onClose={() => setShowQuickCharacterModal(false)} title="Tạo nhanh nhân vật">
        <form onSubmit={handleQuickCreateCharacter} className="space-y-4">
          <Input
            id="quick-char-name"
            label="Tên nhân vật"
            placeholder="Ví dụ: cô chủ quán cà phê"
            value={quickCharacterForm.name}
            onChange={(e) => setQuickCharacterForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <Textarea
            id="quick-char-desc"
            label="Mô tả ngoại hình (tuỳ chọn)"
            placeholder="Ví dụ: áo khoác denim, tóc ngắn, đeo kính tròn"
            value={quickCharacterForm.description}
            onChange={(e) => setQuickCharacterForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
          />
          <Textarea
            id="quick-char-personality"
            label="Tính cách (tuỳ chọn)"
            placeholder="Ví dụ: nói chuyện hài hước, hơi cà khịa"
            value={quickCharacterForm.personality}
            onChange={(e) => setQuickCharacterForm((prev) => ({ ...prev, personality: e.target.value }))}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setShowQuickCharacterModal(false)}>Huỷ</Button>
            <Button type="submit" loading={quickCharacterSaving}>Tạo và chọn</Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
