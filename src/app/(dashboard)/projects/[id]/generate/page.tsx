"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useProject, useCharacters, useMemes, generateContent, generateImage } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Zap, Sparkles, Download, Save, RotateCcw, ChevronRight, Check, Wand2, ImageIcon, Loader2, Upload, X, Tags, Plus } from "lucide-react";
import type { MemeContent, MemeFormat, SelectedCharacter, EmotionTag } from "@/types/database";
import { FORMAT_DIMENSIONS } from "@/types/database";
import { useWallet } from "@/contexts/WalletContext";
import { POINT_COSTS, hasEnoughPoints } from "@/lib/point-pricing";

interface ContentVariation {
  content: MemeContent;
  suggested_characters: (SelectedCharacter & {
    reasoning: string;
    pose_id: string;
    pose_name: string;
    suggested_emotion: string;
  })[];
  headline: string;
  subtext?: string;
  caption?: string;
  tone: string;
  text_position: string;
  visual_direction?: {
    scene?: string;
    character_styling?: string;
    composition?: string;
    camera?: string;
    lighting?: string;
    art_style?: string;
  };
}

export default function GeneratePage() {
  const params = useParams();
  const projectId = params.id as string;

  const { project, loading: projLoading } = useProject(projectId);
  const { characters, loading: charsLoading, createCharacter } = useCharacters(projectId);
  const { saveMeme } = useMemes(projectId);

  const toast = useToast();
  const { points, refreshBalance } = useWallet();
  const loading = projLoading || charsLoading;

  // Steps
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [idea, setIdea] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<ContentVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState(0);
  const [hasPickedVariation, setHasPickedVariation] = useState(false);
  const [format, setFormat] = useState<MemeFormat>("1:1");
  const [saving, setSaving] = useState(false);

  // AI image generation
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiImageBase64, setAiImageBase64] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reference images for meme ideas
  const [refImages, setRefImages] = useState<{ file: File; preview: string; base64: string; mimeType: string }[]>([]);
  const refInputRef = useRef<HTMLInputElement>(null);
  const imageDataCacheRef = useRef<Record<string, { base64: string; mimeType: string }>>({});
  const [aiRefImages, setAiRefImages] = useState<{ file: File; preview: string; base64: string; mimeType: string }[]>([]);
  const aiRefInputRef = useRef<HTMLInputElement>(null);
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkLogo, setWatermarkLogo] = useState<{ preview: string; base64: string; mimeType: string } | null>(null);
  const watermarkLogoInputRef = useRef<HTMLInputElement>(null);
  const [taggedCharacterIds, setTaggedCharacterIds] = useState<Set<string>>(new Set());
  const [oneOffCharacters, setOneOffCharacters] = useState<string[]>([]);
  const [oneOffInput, setOneOffInput] = useState("");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [showQuickCharacterModal, setShowQuickCharacterModal] = useState(false);
  const [quickCharacterSaving, setQuickCharacterSaving] = useState(false);
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    description: "",
    personality: "",
  });
  const MAX_REF_IMAGES = 4;
  const MAX_REF_SIZE_MB = 5;

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
    if (!response.ok) throw new Error(`Không thể tải ảnh nhân vật (${response.status})`);
    const blob = await response.blob();
    const base64 = await fileToBase64(new File([blob], "character-ref", { type: blob.type || "image/png" }));
    const data = { base64, mimeType: blob.type || "image/png" };
    imageDataCacheRef.current[url] = data;
    return data;
  }, []);

  const addRefImages = useCallback(async (files: File[]) => {
    const remaining = MAX_REF_IMAGES - refImages.length;
    if (remaining <= 0) return;

    const validFiles = files
      .filter((f) => f.type.startsWith("image/"))
      .filter((f) => f.size <= MAX_REF_SIZE_MB * 1024 * 1024)
      .slice(0, remaining);

    const newImages = await Promise.all(
      validFiles.map(async (file) => ({
        file,
        preview: URL.createObjectURL(file),
        base64: await fileToBase64(file),
        mimeType: file.type,
      }))
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
      .filter((f) => f.type.startsWith("image/"))
      .filter((f) => f.size <= MAX_REF_SIZE_MB * 1024 * 1024)
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
      toast.error("Logo watermark phải là file ảnh");
      return;
    }
    if (file.size > MAX_REF_SIZE_MB * 1024 * 1024) {
      toast.error(`Logo watermark tối đa ${MAX_REF_SIZE_MB}MB`);
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
        appendMentionToIdea(created.name);
        toast.success(`Đã tạo nhanh nhân vật "${created.name}"`);
        setShowQuickCharacterModal(false);
      } else {
        toast.error("Không thể tạo nhân vật. Vui lòng thử lại.");
      }
    } catch {
      toast.error("Không thể tạo nhân vật. Vui lòng thử lại.");
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
    setTaggedCharacterIds(new Set(selected.suggested_characters.map((c) => c.character_id)));
  }, [selectedVariation, variations]);

  useEffect(() => {
    if (!watermarkText && project?.name) {
      setWatermarkText(project.name);
    }
  }, [project?.name, watermarkText]);

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    setGenerating(true);

    try {
      const results = await generateContent({
        project_id: project?.id || projectId,
        idea: idea.trim(),
        characters,
        projectStyle: project?.style_prompt || undefined,
        adHocCharacters: oneOffCharacters,
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
      toast.error("Không thể tạo nội dung. Vui lòng thử lại.");
    }

    setGenerating(false);
  };

  const handleDirectFlow = () => {
    const normalizedIdea = idea.trim();
    if (!normalizedIdea) return;

    const promptWithoutMentions = normalizedIdea.replace(/@([\p{L}\p{N}_\-\s]+)/gu, "$1").trim();

    const selectedChars = characters.filter((c) => selectedCharacterIds.has(c.id));
    const directVariation: ContentVariation = {
      content: {
        headline: "",
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
      headline: "",
      subtext: undefined,
      caption: undefined,
      tone: "theo ý tưởng người dùng",
      text_position: "top",
    };

    setVariations([directVariation]);
    setSelectedVariation(0);
    setHasPickedVariation(true);
    setTaggedCharacterIds(new Set(selectedChars.map((c) => c.id)));
    setAiCustomPrompt((prev) => (prev.trim() ? prev : promptWithoutMentions));
    setStep(3);
  };

  const buildAutoVisualPrompt = (v: ContentVariation) => {
    const d = v.visual_direction;
    if (!d) return "";
    return [
      d.scene ? `Bối cảnh: ${d.scene}` : "",
      d.character_styling ? `Nhân vật/Thần thái/Outfit: ${d.character_styling}` : "",
      d.composition ? `Bố cục: ${d.composition}` : "",
      d.camera ? `Góc máy: ${d.camera}` : "",
      d.lighting ? `Ánh sáng: ${d.lighting}` : "",
      d.art_style ? `Phong cách: ${d.art_style}` : "",
    ].filter(Boolean).join("\n");
  };

  // Phase 3: Generate meme with AI
  const handleAiGenerate = async () => {
    const v = variations[selectedVariation];
    if (!v) return;

    // Refresh balance then check points
    await refreshBalance();
    if (!hasEnoughPoints(points, "meme")) {
      toast.error(`Không đủ points. Tạo meme cần ${POINT_COSTS.meme} points, bạn có ${points} points. Vui lòng mua thêm trong Ví tiền.`);
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setAiImageBase64(null);

    try {
      const taggedCharacters = characters.filter((c) => taggedCharacterIds.has(c.id));
      const sourceCharacterInputs = taggedCharacters.length > 0
        ? taggedCharacters.map((char) => {
            const suggested = v.suggested_characters.find((sc) => sc.character_id === char.id);
            return {
              id: char.id,
              name: char.name,
              emotion: suggested?.suggested_emotion || suggested?.emotion || "neutral",
              description: char.description,
            };
          })
        : v.suggested_characters.map((sc) => {
            const char = characters.find((c) => c.id === sc.character_id);
            return {
              id: sc.character_id,
              name: sc.character_name,
              emotion: sc.suggested_emotion || sc.emotion,
              description: char?.description,
            };
          });

      const sourceCharacters = await Promise.all(
        sourceCharacterInputs.map(async (item) => {
          const fullChar = characters.find((c) => c.id === item.id);
          const suggestedPoseId = v.suggested_characters.find((sc) => sc.character_id === item.id)?.pose_id;
          const selectedPose = fullChar?.poses.find((p) => p.id === suggestedPoseId) || fullChar?.poses[0];
          const refUrl = selectedPose?.image_url || fullChar?.avatar_url || fullChar?.poses[0]?.image_url;

          if (!fullChar) {
            throw new Error(`Không tìm thấy dữ liệu nhân vật "${item.name}". Vui lòng chọn lại nhân vật.`);
          }

          if (!refUrl || refUrl.startsWith("/mock/")) {
            throw new Error(`Nhân vật "${item.name}" chưa có ảnh ref hợp lệ. Vui lòng thêm pose/đặt avatar trước khi tạo ảnh.`);
          }

          const inline = await imageUrlToInlineData(refUrl);
          return {
            name: item.name,
            emotion: item.emotion,
            description: item.description,
            poseImageBase64: inline.base64,
            poseMimeType: inline.mimeType,
          };
        })
      );

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

      const result = await generateImage({
        type: "meme",
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
          text: enableWatermark ? (watermarkText.trim() || project?.name || undefined) : undefined,
          logoBase64: watermarkLogoData.base64,
          logoMimeType: watermarkLogoData.mimeType,
        },
        backgroundDescription: undefined,
        referenceImages: mergedRefImages.length > 0
          ? mergedRefImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType }))
          : undefined,
      });

      if (result.error) {
        setAiError(result.error);
      } else if (result.image) {
        setAiImageBase64(result.image);
        try {
          await saveMeme({
            original_idea: idea,
            generated_content: v.content,
            selected_characters: v.suggested_characters,
            format,
            has_watermark: enableWatermark,
            image_base64: `data:image/png;base64,${result.image}`,
          });
          toast.success("Đã tự động lưu vào bộ sưu tập");
        } catch (saveErr) {
          toast.error(saveErr instanceof Error ? saveErr.message : "Tạo ảnh xong nhưng lưu bộ sưu tập thất bại");
        }
        // Refresh wallet to show updated points
        refreshBalance();
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Lỗi không xác định khi tạo ảnh AI");
    }

    setAiGenerating(false);
  };

  const handleExport = () => {
    if (!aiImageBase64) return;
    const link = document.createElement("a");
    link.download = `meme-ai-${Date.now()}.png`;
    link.href = `data:image/png;base64,${aiImageBase64}`;
    link.click();
  };

  const handleSave = async () => {
    if (!variations[selectedVariation]) return;
    setSaving(true);

    if (!aiImageBase64) {
      toast.error("Bạn cần tạo ảnh AI trước khi lưu");
      setSaving(false);
      return;
    }
    const imageData = `data:image/png;base64,${aiImageBase64}`;

    const v = variations[selectedVariation];
    try {
      await saveMeme({
        original_idea: idea,
        generated_content: v.content,
        selected_characters: v.suggested_characters,
        format,
        has_watermark: enableWatermark,
        image_base64: imageData,
      });
      toast.success("Đã lưu meme vào thư viện!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể lưu meme. Vui lòng thử lại.");
    }
    setSaving(false);
  };

  const handleReset = () => {
    setStep(1);
    setIdea("");
    setVariations([]);
    setSelectedVariation(0);
    setHasPickedVariation(false);
    setAiImageBase64(null);
    setAiError(null);
    setAiCustomPrompt("");
    setTaggedCharacterIds(new Set());
    setSelectedCharacterIds(new Set());
    setOneOffCharacters([]);
    setOneOffInput("");
    setEnableWatermark(true);
    setWatermarkText(project?.name || "");
    if (watermarkLogo) URL.revokeObjectURL(watermarkLogo.preview);
    setWatermarkLogo(null);
    // Clean up reference image object URLs
    refImages.forEach((img) => URL.revokeObjectURL(img.preview));
    aiRefImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setRefImages([]);
    setAiRefImages([]);
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar projectId={projectId} />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <div className="animate-pulse h-96 th-bg-card rounded-2xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Tạo Meme</h1>
            <p className="th-text-tertiary mt-1">Nhập ý tưởng và để AI tạo meme hoàn hảo</p>
          </div>
          {step > 1 && (
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw size={16} /> Làm lại
            </Button>
          )}
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-3 mb-8">
          {[
            { num: 1, label: "Nhập ý tưởng" },
            { num: 2, label: "Chọn nội dung" },
            { num: 3, label: "Xem trước & Xuất" },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                step === s.num ? "th-border-accent th-bg-accent-light th-text-accent"
                : step > s.num ? "th-border-success th-bg-success-light th-text-success"
                : "th-bg-tertiary th-text-tertiary th-border"
              }`}>
                {step > s.num ? <Check size={14} /> : <span>{s.num}</span>}
                {s.label}
              </div>
              {i < 2 && <ChevronRight size={16} className="th-text-muted" />}
            </div>
          ))}
        </div>

        {/* Step 1: Input */}
        {step === 1 && (
          <div className="max-w-2xl">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold th-text-primary flex items-center gap-2">
                  <Sparkles size={20} style={{ color: "var(--accent)" }} />
                  Ý tưởng meme của bạn?
                </h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  id="idea"
                  placeholder='VD: "Khi team dev nói deploy xong rồi nhưng bug vẫn còn nguyên", "Thị trường chứng khoán hôm nay đỏ lửa, anh em ôm nhau khóc"...'
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  rows={4}
                  className="text-base"
                />
                {/* Reference image upload */}
                <div>
                  <p className="text-xs font-medium th-text-secondary mb-2 flex items-center gap-1.5">
                    <ImageIcon size={12} />
                    Ảnh tham khảo (tuỳ chọn)
                  </p>
                  <div
                    className="border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer th-border th-bg-hover"
                    onClick={() => refInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const files = Array.from(e.dataTransfer.files);
                      addRefImages(files);
                    }}
                  >
                    <input
                      ref={refInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        addRefImages(files);
                        e.target.value = "";
                      }}
                    />
                    {refImages.length === 0 ? (
                      <div className="py-2">
                        <Upload size={24} className="mx-auto mb-2 th-text-muted" />
                        <p className="text-sm th-text-tertiary">
                          Click, kéo thả, hoặc Ctrl+V để dán ảnh
                        </p>
                        <p className="text-xs th-text-muted mt-1">
                          Tối đa {MAX_REF_IMAGES} ảnh, mỗi ảnh &le; {MAX_REF_SIZE_MB}MB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap justify-center">
                          {refImages.map((img, idx) => (
                            <div key={idx} className="relative group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.preview}
                                alt={`Reference ${idx + 1}`}
                                className="w-20 h-20 object-cover rounded-lg border"
                                style={{ borderColor: "var(--border-primary)" }}
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); removeRefImage(idx); }}
                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
                                style={{ background: "var(--danger, #ef4444)" }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {refImages.length < MAX_REF_IMAGES && (
                            <div className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center th-border th-text-muted">
                              <Upload size={18} />
                            </div>
                          )}
                        </div>
                        <p className="text-xs th-text-muted">
                          AI sẽ phân tích ảnh để hiểu context tốt hơn
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs th-text-tertiary">Nhân vật có sẵn (click để mention):</p>
                    <Button size="sm" variant="outline" onClick={openQuickCharacterModal}>
                      <Plus size={14} /> Tạo nhanh nhân vật
                    </Button>
                  </div>

                  {characters.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {characters.map((c) => {
                        const avatar = c.avatar_url || c.poses[0]?.image_url;
                        const selected = selectedCharacterIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleSelectedCharacter(c.id)}
                            className={`flex items-center gap-2 p-2 rounded-xl text-left border transition-all ${
                              selected
                                ? "th-border-accent th-bg-accent-light"
                                : "th-bg-tertiary th-bg-hover th-border"
                            }`}
                          >
                            <div className="w-9 h-9 rounded-lg overflow-hidden th-bg-card flex items-center justify-center text-xs font-bold th-text-muted">
                              {avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatar} alt={c.name} className="w-full h-full object-cover" />
                              ) : (
                                c.name[0]?.toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium th-text-primary truncate">@{c.name}</p>
                              <p className="text-[11px] th-text-muted">{c.poses.length} biểu cảm</p>
                            </div>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                appendMentionToIdea(c.name);
                              }}
                              className="ml-auto text-[10px] px-2 py-1 rounded-md th-bg-card th-text-secondary"
                            >
                              mention
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs th-text-muted">Chưa có nhân vật thư viện. Bạn vẫn có thể tạo meme ngay, hoặc tạo nhanh ở nút bên trên.</p>
                  )}

                  <div>
                    <p className="text-xs th-text-tertiary mb-1.5">Nhân vật dùng 1 lần (không lưu thư viện):</p>
                    <div className="flex gap-2">
                      <Input
                        id="one-off-character"
                        placeholder="VD: Anh xe ôm công nghệ, chú mèo hàng xóm..."
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
                        <Plus size={14} /> Thêm
                      </Button>
                    </div>
                    {oneOffCharacters.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {oneOffCharacters.map((name) => (
                          <span key={name} className="px-2 py-1 rounded-lg text-xs th-bg-accent-light th-text-accent flex items-center gap-1">
                            @{name}
                            <button type="button" onClick={() => removeOneOffCharacter(name)} className="th-text-accent">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs th-text-muted">Bạn không bắt buộc phải có nhân vật sẵn trong thư viện để tạo meme.</p>
                <div>
                  <p className="text-xs th-text-tertiary mb-2">Định dạng nhanh:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {(Object.entries(FORMAT_DIMENSIONS) as [MemeFormat, { width: number; height: number; label: string }][]).map(([key]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormat(key)}
                        className={`px-2 py-2 rounded-lg text-xs border ${
                          format === key ? "th-border-accent th-bg-accent-light th-text-accent" : "th-bg-tertiary th-border th-text-secondary"
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button size="lg" className="w-full" onClick={handleGenerate} loading={generating} disabled={!idea.trim()}>
                    <Zap size={18} />
                    {generating ? "AI đang xử lý..." : "Tạo nội dung meme"}
                  </Button>
                  <Button size="lg" variant="outline" className="w-full" onClick={handleDirectFlow} disabled={!idea.trim()}>
                    <Wand2 size={18} />
                    Bỏ qua AI idea, tạo ảnh luôn
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Select variation */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm th-text-secondary">AI đã tạo {variations.length} phiên bản. Hãy bấm chọn 1 phiên bản trước khi tiếp tục.</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {variations.map((v, index) => (
                <Card key={index} hover onClick={() => { setSelectedVariation(index); setHasPickedVariation(true); }}
                  className={selectedVariation === index ? "th-border-accent th-shadow-lg" : ""}>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 rounded-lg text-xs ${selectedVariation === index ? "th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-tertiary"}`}>
                        Phiên bản {index + 1}
                      </span>
                      <span className="px-2 py-1 th-bg-tertiary rounded-lg text-xs th-text-tertiary">{v.tone}</span>
                    </div>
                    <div>
                      <p className="th-text-primary font-bold text-lg leading-tight">&ldquo;{v.headline}&rdquo;</p>
                      {v.subtext && <p className="th-text-secondary text-sm mt-1">{v.subtext}</p>}
                    </div>
                    {v.caption && (
                      <div className="p-2 rounded-lg" style={{ background: "var(--bg-tertiary)", opacity: 0.5 }}>
                        <p className="text-xs th-text-tertiary mb-0.5">Caption:</p>
                        <p className="text-xs th-text-secondary">{v.caption}</p>
                      </div>
                    )}
                    {v.suggested_characters.length > 0 && (
                      <div>
                        <p className="text-xs th-text-muted mb-1">Nhân vật:</p>
                        {v.suggested_characters.map((sc, ci) => (
                          <div key={ci} className="flex items-center gap-2 py-1">
                            <span className="text-sm th-text-secondary">{sc.character_name}</span>
                            <span className="text-xs th-text-muted">- {sc.reasoning}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {v.visual_direction && (
                      <div className="p-2 rounded-lg" style={{ background: "var(--bg-tertiary)", opacity: 0.6 }}>
                        <p className="text-xs th-text-tertiary mb-1">AI visual direction:</p>
                        <p className="text-xs th-text-secondary line-clamp-3">
                          {v.visual_direction.scene || v.visual_direction.character_styling || v.visual_direction.composition || "Đã có chỉ dẫn hình ảnh chi tiết"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Quay lại</Button>
              <Button onClick={() => setStep(3)} disabled={!hasPickedVariation}>Tiếp tục xem trước <ChevronRight size={16} /></Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Export */}
        {step === 3 && variations[selectedVariation] && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview area */}
            <div className="lg:col-span-2 space-y-4">
              {/* AI Preview */}
                <Card>
                  <CardContent className="p-6">
                    {/* No image yet — show generate button */}
                    {!aiImageBase64 && !aiGenerating && (
                      <div className="flex flex-col items-center justify-center py-16 space-y-4">
                        <div className="w-20 h-20 rounded-2xl th-bg-accent-light flex items-center justify-center">
                          <Wand2 size={36} style={{ color: "var(--accent)" }} />
                        </div>
                        <div className="text-center">
                          <p className="th-text-primary font-semibold text-lg">Tạo ảnh meme bằng AI</p>
                          <p className="th-text-tertiary text-sm mt-1 max-w-sm">
                            AIDA AI sẽ tạo ảnh meme hoàn chỉnh dựa trên nội dung, nhân vật và phong cách đã chọn
                          </p>
                        </div>
                        <Button size="lg" onClick={handleAiGenerate}>
                          <Wand2 size={18} />
                          Tạo ảnh bằng AI ({POINT_COSTS.meme} pts)
                        </Button>
                        <p className="text-xs th-text-muted">
                          Bạn có <strong>{points}</strong> points
                        </p>
                      </div>
                    )}

                    {/* Generating state */}
                    {aiGenerating && (
                      <div className="flex flex-col items-center justify-center py-16 space-y-4">
                        <div className="w-20 h-20 rounded-2xl th-bg-accent-light flex items-center justify-center">
                          <Loader2 size={36} className="animate-spin" style={{ color: "var(--accent)" }} />
                        </div>
                        <div className="text-center">
                          <p className="th-text-primary font-semibold">AI đang tạo ảnh...</p>
                          <p className="th-text-tertiary text-sm mt-1">Quá trình này có thể mất 10-30 giây</p>
                        </div>
                      </div>
                    )}

                    {/* Error state */}
                    {aiError && !aiGenerating && (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl th-bg-danger-light th-border-danger" style={{ borderWidth: "1px", borderStyle: "solid" }}>
                          <p className="th-text-danger text-sm font-medium">Lỗi tạo ảnh</p>
                          <p className="th-text-danger text-xs mt-1 opacity-80">{aiError}</p>
                        </div>
                        <div className="flex justify-center">
                          <Button onClick={handleAiGenerate}>
                            <RotateCcw size={16} /> Thử lại ({POINT_COSTS.meme} pts)
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* AI Image result */}
                    {aiImageBase64 && !aiGenerating && (
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <div className="relative rounded-2xl overflow-hidden inline-block" style={{ maxWidth: "100%" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`data:image/png;base64,${aiImageBase64}`}
                              alt="AI generated meme"
                              className="block max-h-[600px] w-auto rounded-2xl"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                          <Button variant="outline" size="sm" onClick={handleAiGenerate}>
                            <RotateCcw size={14} /> Tạo lại ({POINT_COSTS.meme} pts)
                          </Button>
                          <span className="text-xs th-text-muted">{points} pts còn lại</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </div>

            {/* Controls sidebar */}
            <div className="space-y-4">
              {/* Format */}
              <Card>
                <CardHeader><h3 className="text-sm font-semibold th-text-primary">Định dạng</h3></CardHeader>
                <CardContent className="space-y-2">
                  {(Object.entries(FORMAT_DIMENSIONS) as [MemeFormat, { width: number; height: number; label: string }][]).map(([key, val]) => (
                    <button key={key} onClick={() => setFormat(key)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all border ${
                        format === key ? "th-border-accent th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-secondary border-transparent th-bg-hover"
                      }`}>
                      <span>{key}</span>
                      <span className="text-xs th-text-muted">{val.label}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><h3 className="text-sm font-semibold th-text-primary">Watermark</h3></CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm th-text-secondary">Bật watermark góc phải dưới</span>
                    <input
                      type="checkbox"
                      checked={enableWatermark}
                      onChange={(e) => setEnableWatermark(e.target.checked)}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                  </label>

                  {enableWatermark && (
                    <>
                      <Input
                        id="watermark-text"
                        label="Text watermark"
                        placeholder="VD: Cậu Vàng Finance"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        className="text-sm"
                      />

                      <div>
                        <p className="text-xs font-medium th-text-secondary mb-1.5">Logo watermark (tuỳ chọn)</p>
                        <div
                          className="border rounded-xl p-3 text-center cursor-pointer th-border th-bg-hover"
                          onClick={() => watermarkLogoInputRef.current?.click()}
                        >
                          <input
                            ref={watermarkLogoInputRef}
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
                              <img src={watermarkLogo.preview} alt="Watermark logo" className="w-10 h-10 object-contain rounded" />
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
                                Xoá logo
                              </Button>
                            </div>
                          ) : (
                            <p className="text-xs th-text-muted">Tải logo để AI gắn đúng watermark theo brand</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* AI reference and prompt controls */}
                <Card>
                  <CardHeader><h3 className="text-sm font-semibold th-text-primary">Ref ảnh + Prompt AI</h3></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-medium th-text-secondary mb-2 flex items-center gap-1.5">
                        <ImageIcon size={12} /> Ảnh tham khảo cho bước tạo ảnh
                      </p>
                      <div
                        className="border-2 border-dashed rounded-xl p-3 text-center transition-colors cursor-pointer th-border th-bg-hover"
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
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            addAiRefImages(files);
                            e.target.value = "";
                          }}
                        />
                        {aiRefImages.length === 0 ? (
                          <div className="py-1">
                            <Upload size={18} className="mx-auto mb-1 th-text-muted" />
                            <p className="text-xs th-text-tertiary">Thả ảnh meme mẫu để AI học bố cục/style</p>
                          </div>
                        ) : (
                          <div className="flex gap-2 flex-wrap justify-center">
                            {aiRefImages.map((img, idx) => (
                              <div key={idx} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.preview} alt={`AI ref ${idx + 1}`} className="w-14 h-14 object-cover rounded-lg border" style={{ borderColor: "var(--border-primary)" }} />
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeAiRefImage(idx); }}
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                                  style={{ background: "var(--danger, #ef4444)" }}
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium th-text-secondary mb-2 flex items-center gap-1.5">
                        <Tags size={12} /> Tag nhân vật xuất hiện trong ảnh
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {characters.map((char) => {
                          const active = taggedCharacterIds.has(char.id);
                          return (
                            <button
                              key={char.id}
                              type="button"
                              onClick={() => toggleTaggedCharacter(char.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                                active
                                  ? "th-border-accent th-bg-accent-light th-text-accent"
                                  : "th-bg-tertiary th-border th-text-secondary th-bg-hover"
                              }`}
                            >
                              {char.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium th-text-secondary mb-1.5">Prompt bổ sung</p>
                      <Textarea
                        id="ai-custom-prompt"
                        placeholder="VD: Bám bố cục ảnh ref số 1, headline đặt giữa, tone châm biếm nhẹ, nhân vật bên trái nhìn vào chart đỏ..."
                        value={aiCustomPrompt}
                        onChange={(e) => setAiCustomPrompt(e.target.value)}
                        rows={3}
                        className="text-xs"
                      />
                    </div>
                  </CardContent>
                </Card>
              

              

              {/* Caption */}
              {variations[selectedVariation].caption && (
                <Card>
                  <CardHeader><h3 className="text-sm font-semibold th-text-primary">Caption mạng xã hội</h3></CardHeader>
                  <CardContent>
                    <p className="text-sm th-text-secondary whitespace-pre-wrap">{variations[selectedVariation].caption}</p>
                    <Button variant="ghost" size="sm" className="mt-2"
                      onClick={() => {
                        navigator.clipboard.writeText(variations[selectedVariation].caption || "");
                        toast.success("Đã sao chép caption");
                      }}>
                      Sao chép
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleExport}
                  disabled={!aiImageBase64}
                >
                  <Download size={18} /> Tải xuống PNG
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  size="lg"
                  onClick={handleSave}
                  loading={saving}
                  disabled={!aiImageBase64}
                >
                  <Save size={18} /> Lưu vào thư viện
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setStep(2)}>
                  Quay lại chọn phiên bản
                </Button>
              </div>
            </div>
          </div>
        )}

        <Modal isOpen={showQuickCharacterModal} onClose={() => setShowQuickCharacterModal(false)} title="Tạo nhanh nhân vật">
          <form onSubmit={handleQuickCreateCharacter} className="space-y-4">
            <Input
              id="quick-char-name"
              label="Tên nhân vật"
              placeholder="VD: Cô chủ quán cà phê"
              value={quickCharacterForm.name}
              onChange={(e) => setQuickCharacterForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <Textarea
              id="quick-char-desc"
              label="Mô tả ngoại hình (tuỳ chọn)"
              placeholder="VD: Áo khoác denim, tóc ngắn, đeo kính tròn"
              value={quickCharacterForm.description}
              onChange={(e) => setQuickCharacterForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
            <Textarea
              id="quick-char-personality"
              label="Tính cách (tuỳ chọn)"
              placeholder="VD: Nói chuyện hài hước, hơi cà khịa"
              value={quickCharacterForm.personality}
              onChange={(e) => setQuickCharacterForm((prev) => ({ ...prev, personality: e.target.value }))}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setShowQuickCharacterModal(false)}>Huỷ</Button>
              <Button type="submit" loading={quickCharacterSaving}>Tạo và mention</Button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
}
