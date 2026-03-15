"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useCharacters, generateImage } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import {
  Plus,
  Upload,
  UploadCloud,
  Trash2,
  Edit2,
  Image as ImageIcon,
  SmilePlus,
  ChevronDown,
  ChevronUp,
  Wand2,
  Loader2,
  RotateCcw,
  Download,
  Brain,
  Check,
} from "lucide-react";
import { BulkUploader } from "@/components/ui/bulk-uploader";
import type { Character } from "@/types/database";
import { PROMPT_TEMPLATES, type PromptTemplate } from "@/lib/prompt-templates";
import { useWallet } from "@/contexts/WalletContext";
import { trackEvent } from "@/lib/analytics";

export default function CharactersPage() {
  const params = useParams();
  const projectId = params.id as string;

  const toast = useToast();
  const { project } = useProject(projectId);
  const { characters, loading, createCharacter, updateCharacter, deleteCharacter, addPose, deletePose } = useCharacters(projectId);
  const { refreshBalance } = useWallet();

  const [expandedChar, setExpandedChar] = useState<string | null>(null);
  const [deleteCharTarget, setDeleteCharTarget] = useState<string | null>(null);
  const [deletePoseTarget, setDeletePoseTarget] = useState<string | null>(null);

  // Character form
  const [showCharModal, setShowCharModal] = useState(false);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [charForm, setCharForm] = useState({ name: "", description: "", personality: "" });
  const [charSaving, setCharSaving] = useState(false);

  // Pose form
  const [showPoseModal, setShowPoseModal] = useState(false);
  const [poseCharId, setPoseCharId] = useState<string | null>(null);
  const [poseForm, setPoseForm] = useState({
    name: "",
    description: "",
    is_transparent: false,
  });
  const [poseFile, setPoseFile] = useState<File | null>(null);
  const [posePreview, setPosePreview] = useState<string | null>(null);
  const [poseSaving, setPoseSaving] = useState(false);

  // Bulk upload
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadCharId, setBulkUploadCharId] = useState<string | null>(null);

  // AI Pose generation
  const [showAiPoseModal, setShowAiPoseModal] = useState(false);
  const [aiPoseCharId, setAiPoseCharId] = useState<string | null>(null);
  const [aiPoseStyle, setAiPoseStyle] = useState("");
  const [aiPoseGenerating, setAiPoseGenerating] = useState(false);
  const [aiPoseImage, setAiPoseImage] = useState<string | null>(null);
  const [aiPoseError, setAiPoseError] = useState<string | null>(null);
  const [aiPoseSaving, setAiPoseSaving] = useState(false);
  const [aiPoseRequestId, setAiPoseRequestId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);

  // AI character roster suggestion
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [fanpageBrief, setFanpageBrief] = useState("");
  const [suggestCount, setSuggestCount] = useState(4);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestItems, setSuggestItems] = useState<Array<{
    selected: boolean;
    name: string;
    role: string;
    personality: string;
    description: string;
    why_fit: string;
  }>>([]);
  const [creatingSuggested, setCreatingSuggested] = useState(false);
  const [autoGenerateBaseImage, setAutoGenerateBaseImage] = useState(true);

  const openCreateChar = () => {
    setEditingChar(null);
    setCharForm({ name: "", description: "", personality: "" });
    setShowCharModal(true);
  };

  const openEditChar = (char: Character) => {
    setEditingChar(char);
    setCharForm({ name: char.name, description: char.description, personality: char.personality });
    setShowCharModal(true);
  };

  const saveCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    setCharSaving(true);
    try {
      if (editingChar) {
        await updateCharacter(editingChar.id, charForm);
        toast.success(`Đã cập nhật nhân vật "${charForm.name}"`);
      } else {
        await createCharacter(charForm);
        toast.success(`Đã tạo nhân vật "${charForm.name}"`);
      }
      setShowCharModal(false);
    } catch {
      toast.error("Không thể lưu nhân vật. Vui lòng thử lại.");
    }
    setCharSaving(false);
  };

  const openAddPose = (charId: string) => {
    setPoseCharId(charId);
    setPoseForm({ name: "", description: "", is_transparent: false });
    setPoseFile(null);
    setPosePreview(null);
    setShowPoseModal(true);
  };

  const handlePoseFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPoseFile(file);
      setPosePreview(URL.createObjectURL(file));
    }
  };

  const savePose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poseFile || !poseCharId) return;
    setPoseSaving(true);
    try {
      await addPose(poseCharId, { ...poseForm, emotion: "neutral", file: poseFile });
      setShowPoseModal(false);
      toast.success("Đã tải lên tư thế thành công");
    } catch (err) {
      toast.error("Tải lên thất bại: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    }
    setPoseSaving(false);
  };

  const openBulkUpload = (charId: string) => {
    setBulkUploadCharId(charId);
    setShowBulkUploadModal(true);
  };

  const handleBulkUploadFile = async (file: File) => {
    if (!bulkUploadCharId) return;
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    await addPose(bulkUploadCharId, {
      name: nameWithoutExt || "Pose",
      emotion: "neutral",
      description: "",
      is_transparent: false,
      file,
    });
  };

  const openAiPose = (charId: string) => {
    setAiPoseCharId(charId);
    setAiPoseStyle("");
    setAiPoseImage(null);
    setAiPoseError(null);
    setSelectedTemplate(null);
    setShowTemplateGuide(false);
    setShowAiPoseModal(true);
  };

  const selectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setShowTemplateGuide(false);
  };

  const handleSuggestCharacters = async () => {
    if (!fanpageBrief.trim()) {
      toast.error("Nhập mô tả fanpage trước");
      return;
    }

    trackEvent("suggest_characters_started", {
      project_id: project?.id || projectId,
      count: suggestCount,
    });

    setSuggestLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project?.id || projectId,
          fanpage_description: fanpageBrief.trim(),
          count: suggestCount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Không thể gợi ý nhân vật");
        return;
      }

      const items = (data.suggestions || []).map((s: {
        name: string;
        role: string;
        personality: string;
        description: string;
        why_fit: string;
      }) => ({ selected: true, ...s }));
      if (items.length === 0) {
        toast.error("AI không trả về gợi ý nào. Thử mô tả fanpage chi tiết hơn.");
        return;
      }
      setSuggestItems(items);
      trackEvent("suggest_characters_success", {
        project_id: project?.id || projectId,
        count: items.length,
      });
    } catch {
      trackEvent("suggest_characters_failed", {
        project_id: project?.id || projectId,
      });
      toast.error("Không thể gợi ý nhân vật lúc này");
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleCreateSuggestedCharacters = async () => {
    const selected = suggestItems.filter((s) => s.selected);
    if (selected.length === 0) {
      toast.error("Chọn ít nhất 1 nhân vật");
      return;
    }

    setCreatingSuggested(true);
    trackEvent("bulk_character_create_started", {
      project_id: project?.id || projectId,
      count: selected.length,
      auto_generate_base: autoGenerateBaseImage,
    });
    let success = 0;
    let generated = 0;
    try {
      for (const item of selected) {
        const created = await createCharacter({
          name: item.name,
          personality: item.personality,
          description: `${item.description}${item.role ? `. Vai trò: ${item.role}` : ""}`,
        });
        if (created) {
          success += 1;

          if (autoGenerateBaseImage) {
            try {
              const result = await generateImage({
                project_id: project?.id || projectId,
                type: "character",
                characterName: created.name,
                characterDescription: `${created.description}${created.personality ? `. Tính cách: ${created.personality}` : ""}`,
                emotion: "neutral",
                style: project?.style_prompt || undefined,
              });

              if (result.image) {
                const response = await fetch(`data:image/png;base64,${result.image}`);
                const blob = await response.blob();
                const file = new File([blob], `ai-character-base-${Date.now()}.png`, { type: "image/png" });
                await addPose(created.id, {
                  name: "Base (AI)",
                  emotion: "neutral",
                  description: "AI generated base character image",
                  is_transparent: false,
                  file,
                });
                generated += 1;
              }
            } catch (imgErr) {
              console.error(`Failed to generate base image for "${item.name}":`, imgErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("Bulk character creation error:", err);
      toast.error("Có lỗi xảy ra khi tạo nhân vật");
    }
    setCreatingSuggested(false);

    if (success > 0) {
      trackEvent("bulk_character_create_completed", {
        project_id: project?.id || projectId,
        created: success,
        generated_base: generated,
      });
      toast.success(
        autoGenerateBaseImage
          ? `Đã tạo ${success}/${selected.length} nhân vật, generate ảnh base ${generated} nhân vật`
          : `Đã tạo ${success}/${selected.length} nhân vật`
      );
      setShowSuggestModal(false);
      setSuggestItems([]);
    } else {
      toast.error("Không tạo được nhân vật nào");
    }
  };

  const handleAiPoseGenerate = async () => {
    if (!aiPoseCharId) return;
    const char = characters.find((c) => c.id === aiPoseCharId);
    if (!char) return;

    setAiPoseGenerating(true);
    setAiPoseError(null);
    setAiPoseImage(null);
    setAiPoseRequestId(null);

    try {
      // Gộp đầy đủ thông tin: description + personality + project style
      const fullDescription = [
        char.description,
        char.personality ? `Tính cách: ${char.personality}` : "",
      ].filter(Boolean).join(". ");

      // Chỉ dùng style khi user chủ động chọn template hoặc tự nhập custom style
      const styleToUse = aiPoseStyle.trim() || selectedTemplate?.characterStyle || undefined;

      const result = await generateImage({
        project_id: project?.id || projectId,
        type: "character",
        characterName: char.name,
        characterDescription: fullDescription || `Nhân vật ${char.name} cho fanpage meme Việt Nam`,
        emotion: "neutral",
        style: styleToUse,
      });

      if (result.error) {
        trackEvent("generate_image_failed", {
          action: "character",
          project_id: project?.id || projectId,
          reason: result.code || "api_error",
        });
        setAiPoseError(result.error);
      } else if (result.image) {
        setAiPoseImage(result.image);
        setAiPoseRequestId(result.generation_request_id || null);
        trackEvent("generate_image_success", {
          action: "character",
          project_id: project?.id || projectId,
          points_spent: result.pointsUsed ?? 3,
          request_id: result.generation_request_id || undefined,
        });
        trackEvent("project_points_spent", {
          action: "character",
          project_id: project?.id || projectId,
          points: result.pointsUsed ?? 3,
        });
        refreshBalance();
      }
    } catch (err) {
      trackEvent("generate_image_exception", {
        action: "character",
        project_id: project?.id || projectId,
      });
      setAiPoseError(err instanceof Error ? err.message : "Lỗi không xác định khi tạo pose bằng AI");
    }

    setAiPoseGenerating(false);
  };

  const handleSaveAiPose = async () => {
    if (!aiPoseCharId || !aiPoseImage) return;
    setAiPoseSaving(true);

    try {
      // Convert base64 to File for addPose
      const response = await fetch(`data:image/png;base64,${aiPoseImage}`);
      const blob = await response.blob();
      const file = new File([blob], `ai-character-base-${Date.now()}.png`, { type: "image/png" });
      const newPose = await addPose(aiPoseCharId, {
        name: "Base (AI)",
        emotion: "neutral",
        description: "AI generated base character image",
        is_transparent: false,
        file,
      });

      if (aiPoseRequestId && newPose?.id) {
        await fetch("/api/ai/log-output", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project?.id || projectId,
            request_id: aiPoseRequestId,
            output_kind: "character_pose",
            output_id: newPose.id,
            output_url: newPose.image_url,
            output_title: newPose.name,
            metadata: {
              character_id: aiPoseCharId,
              emotion: "neutral",
            },
          }),
        });
      }

      trackEvent("save_pose_success", {
        project_id: project?.id || projectId,
        request_id: aiPoseRequestId || undefined,
      });

      setShowAiPoseModal(false);
      toast.success("Đã lưu pose AI thành công");
    } catch (err) {
      toast.error("Lưu pose thất bại: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    }

    setAiPoseSaving(false);
  };

  const handleDownloadAiPose = () => {
    if (!aiPoseImage) return;
    const link = document.createElement("a");
    link.download = `character-ai-${Date.now()}.png`;
    link.href = `data:image/png;base64,${aiPoseImage}`;
    link.click();
  };

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Nhân vật</h1>
            <p className="th-text-tertiary mt-1">Quản lý character identity cho fanpage</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowSuggestModal(true)} size="lg">
              <Brain size={18} />
              AI gợi ý bộ nhân vật
            </Button>
            <Button onClick={openCreateChar} size="lg">
              <Plus size={18} />
              Thêm nhân vật
            </Button>
          </div>
        </div>

        {/* Characters List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 th-bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 th-bg-card rounded-2xl flex items-center justify-center mb-4">
              <SmilePlus size={32} className="th-text-muted" />
            </div>
            <h3 className="text-lg font-medium th-text-secondary">Chưa có nhân vật nào</h3>
            <p className="th-text-muted mt-1 mb-5">Mô tả fanpage để AI gợi ý dàn nhân vật ngay lập tức</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowSuggestModal(true)}>
                <Brain size={18} />
                AI gợi ý nhân vật
              </Button>
              <Button onClick={openCreateChar}>
                <Plus size={18} />
                Tạo thủ công
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {characters.map((char) => (
              <Card key={char.id}>
                <div
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedChar(expandedChar === char.id ? null : char.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 th-bg-tertiary rounded-2xl overflow-hidden flex items-center justify-center text-xl font-bold th-text-tertiary">
                      {(char.avatar_url || char.poses[0]?.image_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={(char.avatar_url || char.poses[0]?.image_url)!} alt={char.name} className="w-full h-full object-cover" />
                      ) : (
                        char.name[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/projects/${projectId}/characters/${char.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold th-text-primary hover:th-text-accent transition-colors"
                      >
                        {char.name}
                      </Link>
                      <p className="text-sm th-text-tertiary line-clamp-1">{char.personality || char.description || "Chưa có mô tả"}</p>
                      <p className="text-xs th-text-muted mt-0.5">{char.poses.length} biểu cảm</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" aria-label={`Chỉnh sửa ${char.name}`} onClick={(e) => { e.stopPropagation(); openEditChar(char); }}>
                      <Edit2 size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={`Xoá ${char.name}`} onClick={(e) => { e.stopPropagation(); setDeleteCharTarget(char.id); }}>
                      <Trash2 size={14} style={{ color: "var(--danger)" }} />
                    </Button>
                    {expandedChar === char.id ? <ChevronUp size={18} className="th-text-tertiary" /> : <ChevronDown size={18} className="th-text-tertiary" />}
                  </div>
                </div>

                {expandedChar === char.id && (
                  <div className="px-5 pb-5 border-t pt-4 th-border" style={{ borderColor: "var(--border-primary)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium th-text-secondary">Tư thế / Biểu cảm</h4>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => openAiPose(char.id)}>
                          <Wand2 size={14} />
                          Tạo bằng AI (3 pts)
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openBulkUpload(char.id)}>
                          <UploadCloud size={14} />
                          Tải lên hàng loạt
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openAddPose(char.id)}>
                          <Upload size={14} />
                          Tải lên tư thế
                        </Button>
                      </div>
                    </div>
                    {char.poses.length === 0 ? (
                      <div className="text-center py-8 th-text-muted text-sm">
                        Chưa có tư thế nào. Tải lên ảnh nhân vật với các biểu cảm khác nhau.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {char.poses.map((pose) => {
                          return (
                            <div key={pose.id} className="group relative th-bg-tertiary rounded-xl overflow-hidden">
                              <div className="aspect-square flex items-center justify-center" style={{ background: "var(--bg-tertiary)", opacity: 0.5 }}>
                                {pose.image_url && !pose.image_url.startsWith("/mock/") ? (
                                  <img src={pose.image_url} alt={pose.name} className="w-full h-full object-contain" />
                                ) : (
                                  <div className="text-center p-2">
                                    <ImageIcon size={24} className="mx-auto th-text-muted" />
                                    <p className="text-xs th-text-tertiary mt-1">{pose.name}</p>
                                  </div>
                                )}
                              </div>
                              <div className="p-2">
                                <p className="text-xs th-text-primary truncate">{pose.name}</p>
                                <p className="text-xs th-text-tertiary truncate">{pose.description || "Ảnh pose"}</p>
                              </div>
                              <button
                                aria-label={`Xoá tư thế ${pose.name}`}
                                onClick={() => setDeletePoseTarget(pose.id)}
                                className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 size={12} className="text-white" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Character Modal */}
        <Modal isOpen={showCharModal} onClose={() => setShowCharModal(false)} title={editingChar ? "Chỉnh sửa nhân vật" : "Thêm nhân vật mới"}>
          <form onSubmit={saveCharacter} className="space-y-4">
            <Input id="char-name" label="Tên nhân vật" placeholder='VD: "Bò Bull", "Gấu Bear", "Thỏ Bảy Màu"' value={charForm.name} onChange={(e) => setCharForm((f) => ({ ...f, name: e.target.value }))} required />
            <Textarea id="char-desc" label="Mô tả ngoại hình" placeholder="Mô tả hình dáng nhân vật để AI hiểu ngữ cảnh" value={charForm.description} onChange={(e) => setCharForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            <Textarea id="char-personality" label="Tính cách" placeholder='VD: "Lạc quan, hay flexing, thích chứng khoán lên xanh, tự tin thái quá"' value={charForm.personality} onChange={(e) => setCharForm((f) => ({ ...f, personality: e.target.value }))} rows={2} />
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="ghost" type="button" onClick={() => setShowCharModal(false)}>Huỷ</Button>
              <Button type="submit" loading={charSaving}>{editingChar ? "Lưu thay đổi" : "Tạo nhân vật"}</Button>
            </div>
          </form>
        </Modal>

        {/* AI Suggest Character Roster Modal */}
        <Modal isOpen={showSuggestModal} onClose={() => setShowSuggestModal(false)} title="AI gợi ý bộ nhân vật" size="xl">
          <div className="space-y-4">
            <Textarea
              id="fanpage-brief"
              label="Mô tả fanpage"
              placeholder="VD: Fanpage tài chính cho người mới, giọng hài hước đời thường, target 22-35 tuổi..."
              value={fanpageBrief}
              onChange={(e) => setFanpageBrief(e.target.value)}
              rows={4}
            />
            <div className="flex items-center gap-2">
              <label className="text-sm th-text-secondary">Số nhân vật:</label>
              <select
                value={suggestCount}
                onChange={(e) => setSuggestCount(Number(e.target.value))}
                className="px-2 py-1 rounded-lg th-bg-card th-text-primary"
                style={{ border: "1px solid var(--border-primary)" }}
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <Button onClick={handleSuggestCharacters} loading={suggestLoading}>
                <Brain size={16} /> Gợi ý
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm th-text-secondary">
              <input
                type="checkbox"
                checked={autoGenerateBaseImage}
                onChange={(e) => setAutoGenerateBaseImage(e.target.checked)}
              />
              Tự generate ảnh base cho mỗi nhân vật sau khi tạo (tốn points)
            </label>

            {suggestItems.length > 0 && (
              <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                {suggestItems.map((item, idx) => (
                  <div key={`${item.name}-${idx}`} className="p-3 rounded-xl border space-y-2" style={{ borderColor: "var(--border-primary)", background: "var(--bg-tertiary)" }}>
                    <label className="flex items-center gap-2 text-sm th-text-primary">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => {
                          setSuggestItems((prev) => prev.map((s, i) => (i === idx ? { ...s, selected: e.target.checked } : s)));
                        }}
                      />
                      <Check size={14} /> Chọn nhân vật này
                    </label>
                    <Input
                      id={`suggest-name-${idx}`}
                      label="Tên"
                      value={item.name}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSuggestItems((prev) => prev.map((s, i) => (i === idx ? { ...s, name: value } : s)));
                      }}
                    />
                    <Input
                      id={`suggest-role-${idx}`}
                      label="Vai trò"
                      value={item.role}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSuggestItems((prev) => prev.map((s, i) => (i === idx ? { ...s, role: value } : s)));
                      }}
                    />
                    <Textarea
                      id={`suggest-personality-${idx}`}
                      label="Tính cách"
                      value={item.personality}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSuggestItems((prev) => prev.map((s, i) => (i === idx ? { ...s, personality: value } : s)));
                      }}
                      rows={2}
                    />
                    <Textarea
                      id={`suggest-description-${idx}`}
                      label="Mô tả ngoại hình"
                      value={item.description}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSuggestItems((prev) => prev.map((s, i) => (i === idx ? { ...s, description: value } : s)));
                      }}
                      rows={2}
                    />
                    <p className="text-xs th-text-muted">Vì sao phù hợp: {item.why_fit}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowSuggestModal(false)}>Đóng</Button>
              <Button onClick={handleCreateSuggestedCharacters} loading={creatingSuggested} disabled={suggestItems.length === 0}>
                Tạo nhân vật đã chọn
              </Button>
            </div>
          </div>
        </Modal>

        {/* Upload Pose Modal */}
        <Modal isOpen={showPoseModal} onClose={() => setShowPoseModal(false)} title="Tải lên tư thế">
          <form onSubmit={savePose} className="space-y-4">
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Ảnh tư thế</label>
              <div className="border-2 border-dashed rounded-xl p-6 text-center th-border-accent-hover transition-colors cursor-pointer th-border" onClick={() => document.getElementById("pose-file")?.click()}>
                {posePreview ? (
                  <img src={posePreview} alt="Preview" className="w-32 h-32 mx-auto object-contain rounded-lg" />
                ) : (
                  <>
                    <ImageIcon size={32} className="mx-auto th-text-muted mb-2" />
                    <p className="text-sm th-text-tertiary">Bấm để chọn ảnh</p>
                    <p className="text-xs th-text-muted mt-1">Khuyến nghị PNG nền trong suốt</p>
                  </>
                )}
                <input id="pose-file" type="file" accept="image/*" className="hidden" onChange={handlePoseFileChange} />
              </div>
            </div>
            <Input id="pose-name" label="Tên tư thế" placeholder='VD: "Giơ tay ăn mừng", "Khóc lóc", "Ngồi suy nghĩ"' value={poseForm.name} onChange={(e) => setPoseForm((f) => ({ ...f, name: e.target.value }))} required />
            <Textarea id="pose-desc" label="Mô tả (tuỳ chọn)" placeholder="Mô tả tư thế này để AI hiểu ngữ cảnh" value={poseForm.description} onChange={(e) => setPoseForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={poseForm.is_transparent} onChange={(e) => setPoseForm((f) => ({ ...f, is_transparent: e.target.checked }))} className="w-4 h-4 rounded accent-[var(--accent)]" style={{ borderColor: "var(--border-primary)", background: "var(--bg-tertiary)" }} />
              <span className="text-sm th-text-secondary">Có nền trong suốt</span>
            </label>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="ghost" type="button" onClick={() => setShowPoseModal(false)}>Huỷ</Button>
              <Button type="submit" loading={poseSaving} disabled={!poseFile}>Tải lên tư thế</Button>
            </div>
          </form>
        </Modal>

        {/* Bulk Upload Modal */}
        <Modal isOpen={showBulkUploadModal} onClose={() => setShowBulkUploadModal(false)} title="Tải lên hàng loạt" size="xl">
          <div className="space-y-4">
            {/* Character info */}
            {bulkUploadCharId && (() => {
              const char = characters.find((c) => c.id === bulkUploadCharId);
              if (!char) return null;
              return (
                <div className="flex items-center gap-3 p-3 rounded-xl th-bg-tertiary">
                  <div className="w-10 h-10 rounded-xl th-bg-card flex items-center justify-center text-sm font-bold th-text-tertiary">
                    {char.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium th-text-primary">{char.name}</p>
                    <p className="text-xs th-text-tertiary">Tải nhiều ảnh pose cùng lúc cho nhân vật này</p>
                  </div>
                </div>
              );
            })()}

            {/* Bulk Uploader */}
            <BulkUploader
              onUpload={handleBulkUploadFile}
              accept="image/*"
              maxFiles={50}
              maxSizeMB={10}
              label="Kéo thả nhiều ảnh pose vào đây"
              hint="Hỗ trợ PNG, JPG, WebP. Tối đa 50 ảnh, mỗi ảnh ≤ 10MB. Tên file sẽ thành tên pose."
            />
          </div>
        </Modal>

        {/* AI Generate Character Modal */}
        <Modal isOpen={showAiPoseModal} onClose={() => setShowAiPoseModal(false)} title="Tạo character bằng AI" size="xl">
          <div className="space-y-5">
            {/* Character info */}
            {aiPoseCharId && (() => {
              const char = characters.find((c) => c.id === aiPoseCharId);
              if (!char) return null;
              return (
                <div className="flex items-center gap-3 p-3 rounded-xl th-bg-tertiary">
                  <div className="w-10 h-10 rounded-xl th-bg-card flex items-center justify-center text-sm font-bold th-text-tertiary">
                    {char.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium th-text-primary">{char.name}</p>
                    <p className="text-xs th-text-tertiary truncate">{char.personality || char.description || "Chưa có mô tả"}</p>
                  </div>
                </div>
              );
            })()}

            {/* Style Template Picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium th-text-secondary">Chọn phong cách</label>
                <button
                  type="button"
                  onClick={() => setShowTemplateGuide(!showTemplateGuide)}
                  className="text-xs th-text-accent hover:underline"
                >
                  {showTemplateGuide ? "Ẩn hướng dẫn" : "Xem hướng dẫn prompt"}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className={`rounded-xl text-center transition-all border p-3 ${
                    !selectedTemplate ? "th-border-accent ring-2 th-ring-accent th-bg-accent-light" : "th-border th-bg-hover"
                  }`}
                >
                  <span className={`text-xs font-medium block ${!selectedTemplate ? "th-text-accent" : "th-text-primary"}`}>
                    Không ép template
                  </span>
                  <span className="text-[10px] th-text-muted block mt-1">Giữ đúng mô tả nhân vật</span>
                </button>
                {PROMPT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t)}
                    className={`rounded-xl text-center transition-all border overflow-hidden ${
                      selectedTemplate?.id === t.id
                        ? "th-border-accent ring-2 th-ring-accent"
                        : "th-border th-bg-hover"
                    }`}
                  >
                    {t.previewUrl ? (
                      <div className="aspect-square overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.previewUrl} alt={t.nameVi} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-square flex items-center justify-center th-bg-tertiary">
                        <span className="text-3xl">{t.preview}</span>
                      </div>
                    )}
                    <div className="p-2">
                      <span className={`text-xs font-medium block ${
                        selectedTemplate?.id === t.id ? "th-text-accent" : "th-text-primary"
                      }`}>{t.nameVi}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Guide / Example */}
            {showTemplateGuide && selectedTemplate && (
              <div className="p-4 rounded-xl border space-y-3" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-primary)" }}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold th-text-primary">{selectedTemplate.preview} {selectedTemplate.nameVi}</h4>
                  <span className="flex gap-1">
                    {selectedTemplate.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded th-bg-card th-text-muted">#{tag}</span>
                    ))}
                  </span>
                </div>
                <p className="text-xs th-text-secondary">{selectedTemplate.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-medium th-text-muted mb-1 uppercase tracking-wide">Mô tả mẫu</p>
                    <p className="text-xs th-text-secondary p-2 rounded-lg th-bg-card">{selectedTemplate.exampleDescription}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium th-text-muted mb-1 uppercase tracking-wide">Emotion mẫu</p>
                    <p className="text-xs th-text-secondary p-2 rounded-lg th-bg-card">{selectedTemplate.exampleEmotion}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  setShowTemplateGuide(false);
                }}>
                  OK, tôi hiểu rồi
                </Button>
              </div>
            )}

            <div className="p-2 rounded-lg th-bg-tertiary text-xs th-text-secondary">
              AI sẽ tạo 1 ảnh <strong>base character</strong> (không khóa emotion). Emotion sẽ được xử lý theo từng meme sau này.
            </div>

            {/* Custom style override */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium th-text-secondary">Style tuỳ chỉnh</label>
                <span className="text-[10px] th-text-muted">(để trống = chỉ dùng mô tả nhân vật{selectedTemplate ? ` + template ${selectedTemplate.nameVi}` : ""})</span>
              </div>
              <Textarea
                id="ai-pose-style"
                placeholder={selectedTemplate ? `Đang dùng template ${selectedTemplate.nameVi}. Nhập ở đây để override...` : 'VD: "Chibi dễ thương", "Flat vector", hoặc để trống để AI bám mô tả nhân vật...'}
                value={aiPoseStyle}
                onChange={(e) => setAiPoseStyle(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>

            {/* Generate button */}
            {!aiPoseImage && !aiPoseGenerating && (
              <Button className="w-full" size="lg" onClick={handleAiPoseGenerate}>
                <Wand2 size={18} />
                Tạo Character bằng AI ({selectedTemplate?.nameVi || "Không template"}) — 3 pts
              </Button>
            )}

            {/* Generating state */}
            {aiPoseGenerating && (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="w-16 h-16 rounded-2xl th-bg-accent-light flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)" }} />
                </div>
                <p className="th-text-primary font-medium">AI đang tạo character...</p>
                <p className="th-text-tertiary text-xs">Quá trình này có thể mất 10-30 giây</p>
              </div>
            )}

            {/* Error state */}
            {aiPoseError && !aiPoseGenerating && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl th-bg-danger-light th-border-danger" style={{ borderWidth: "1px", borderStyle: "solid" }}>
                  <p className="th-text-danger text-sm">{aiPoseError}</p>
                </div>
                <Button variant="outline" className="w-full" onClick={handleAiPoseGenerate}>
                  <RotateCcw size={14} /> Thử lại
                </Button>
              </div>
            )}

            {/* Result preview */}
            {aiPoseImage && !aiPoseGenerating && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="relative rounded-2xl overflow-hidden inline-block th-bg-tertiary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${aiPoseImage}`}
                      alt="AI generated pose"
                      className="block w-72 h-72 object-contain"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleAiPoseGenerate}>
                    <RotateCcw size={14} /> Tạo lại (3 pts)
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleDownloadAiPose}>
                    <Download size={14} /> Tải ảnh
                  </Button>
                  <Button className="flex-1" onClick={handleSaveAiPose} loading={aiPoseSaving}>
                    <ImageIcon size={14} /> Lưu Pose
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>

        {/* Delete Character Confirmation */}
        <ConfirmModal
          isOpen={!!deleteCharTarget}
          onClose={() => setDeleteCharTarget(null)}
          onConfirm={async () => {
            if (!deleteCharTarget) return;
            await deleteCharacter(deleteCharTarget);
            toast.success("Đã xoá nhân vật");
            setDeleteCharTarget(null);
          }}
          title="Xoá nhân vật?"
          message="Nhân vật và tất cả tư thế sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          confirmText="Xoá nhân vật"
          variant="danger"
        />

        {/* Delete Pose Confirmation */}
        <ConfirmModal
          isOpen={!!deletePoseTarget}
          onClose={() => setDeletePoseTarget(null)}
          onConfirm={async () => {
            if (!deletePoseTarget) return;
            await deletePose(deletePoseTarget);
            toast.success("Đã xoá tư thế");
            setDeletePoseTarget(null);
          }}
          title="Xoá tư thế?"
          message="Tư thế này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          confirmText="Xoá tư thế"
          variant="danger"
        />
      </main>
    </div>
  );
}
