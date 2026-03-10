"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
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
} from "lucide-react";
import { BulkUploader } from "@/components/ui/bulk-uploader";
import type { Character, EmotionTag } from "@/types/database";
import { PROMPT_TEMPLATES, type PromptTemplate } from "@/lib/prompt-templates";
import { useWallet } from "@/contexts/WalletContext";
import { POINT_COSTS, hasEnoughPoints } from "@/lib/point-pricing";

const EMOTION_OPTIONS: { value: EmotionTag; label: string; emoji: string }[] = [
  { value: "happy", label: "Vui", emoji: "😊" },
  { value: "sad", label: "Buồn", emoji: "😢" },
  { value: "angry", label: "Giận", emoji: "😠" },
  { value: "surprised", label: "Ngạc nhiên", emoji: "😲" },
  { value: "confused", label: "Bối rối", emoji: "😕" },
  { value: "cool", label: "Cool", emoji: "😎" },
  { value: "love", label: "Yêu", emoji: "😍" },
  { value: "scared", label: "Sợ", emoji: "😱" },
  { value: "thinking", label: "Suy nghĩ", emoji: "🤔" },
  { value: "laughing", label: "Cười lớn", emoji: "😂" },
  { value: "crying", label: "Khóc", emoji: "😭" },
  { value: "neutral", label: "Bình thường", emoji: "😐" },
  { value: "excited", label: "Phấn khích", emoji: "🤩" },
  { value: "tired", label: "Mệt", emoji: "😴" },
];

export default function CharactersPage() {
  const params = useParams();
  const projectId = params.id as string;

  const toast = useToast();
  const { project } = useProject(projectId);
  const { characters, loading, createCharacter, updateCharacter, deleteCharacter, addPose, deletePose } = useCharacters(projectId);
  const { points, refreshBalance } = useWallet();

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
    emotion: "neutral" as EmotionTag,
    description: "",
    is_transparent: false,
  });
  const [poseFile, setPoseFile] = useState<File | null>(null);
  const [posePreview, setPosePreview] = useState<string | null>(null);
  const [poseSaving, setPoseSaving] = useState(false);

  // Bulk upload
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadCharId, setBulkUploadCharId] = useState<string | null>(null);
  const [bulkUploadEmotion, setBulkUploadEmotion] = useState<EmotionTag>("neutral");

  // AI Pose generation
  const [showAiPoseModal, setShowAiPoseModal] = useState(false);
  const [aiPoseCharId, setAiPoseCharId] = useState<string | null>(null);
  const [aiPoseEmotion, setAiPoseEmotion] = useState<EmotionTag>("happy");
  const [aiPoseStyle, setAiPoseStyle] = useState("");
  const [aiPoseGenerating, setAiPoseGenerating] = useState(false);
  const [aiPoseImage, setAiPoseImage] = useState<string | null>(null);
  const [aiPoseError, setAiPoseError] = useState<string | null>(null);
  const [aiPoseSaving, setAiPoseSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(PROMPT_TEMPLATES[0]);
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);

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
    setPoseForm({ name: "", emotion: "neutral", description: "", is_transparent: false });
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
      await addPose(poseCharId, { ...poseForm, file: poseFile });
      setShowPoseModal(false);
      toast.success("Đã tải lên tư thế thành công");
    } catch (err) {
      toast.error("Tải lên thất bại: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    }
    setPoseSaving(false);
  };

  const openBulkUpload = (charId: string) => {
    setBulkUploadCharId(charId);
    setBulkUploadEmotion("neutral");
    setShowBulkUploadModal(true);
  };

  const handleBulkUploadFile = async (file: File) => {
    if (!bulkUploadCharId) return;
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    await addPose(bulkUploadCharId, {
      name: nameWithoutExt || "Pose",
      emotion: bulkUploadEmotion,
      description: "",
      is_transparent: false,
      file,
    });
  };

  const openAiPose = (charId: string) => {
    setAiPoseCharId(charId);
    setAiPoseEmotion("happy");
    setAiPoseStyle("");
    setAiPoseImage(null);
    setAiPoseError(null);
    setSelectedTemplate(PROMPT_TEMPLATES[0]);
    setShowTemplateGuide(false);
    setShowAiPoseModal(true);
  };

  const selectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setAiPoseStyle(template.characterStyle);
    setShowTemplateGuide(false);
  };

  const handleAiPoseGenerate = async () => {
    if (!aiPoseCharId) return;
    const char = characters.find((c) => c.id === aiPoseCharId);
    if (!char) return;

    // Refresh balance then check points
    await refreshBalance();
    if (!hasEnoughPoints(points, "character")) {
      toast.error(`Không đủ points. Tạo ảnh nhân vật cần ${POINT_COSTS.character} points, bạn có ${points} points. Vui lòng mua thêm trong Ví tiền.`);
      return;
    }

    setAiPoseGenerating(true);
    setAiPoseError(null);
    setAiPoseImage(null);

    try {
      // Gộp đầy đủ thông tin: description + personality + project style
      const fullDescription = [
        char.description,
        char.personality ? `Tính cách: ${char.personality}` : "",
      ].filter(Boolean).join(". ");

      // Ưu tiên: custom style > template style > project style
      const styleToUse = aiPoseStyle || selectedTemplate?.characterStyle || project?.style_prompt || undefined;

      const result = await generateImage({
        type: "character",
        characterName: char.name,
        characterDescription: fullDescription || `Nhân vật ${char.name} cho fanpage meme Việt Nam`,
        emotion: EMOTION_OPTIONS.find((e) => e.value === aiPoseEmotion)?.label || aiPoseEmotion,
        style: styleToUse,
      });

      if (result.error) {
        setAiPoseError(result.error);
      } else if (result.image) {
        setAiPoseImage(result.image);
        refreshBalance();
      }
    } catch (err) {
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
      const file = new File([blob], `ai-pose-${aiPoseEmotion}-${Date.now()}.png`, { type: "image/png" });

      const emotionInfo = EMOTION_OPTIONS.find((e) => e.value === aiPoseEmotion);
      await addPose(aiPoseCharId, {
        name: `${emotionInfo?.label || aiPoseEmotion} (AI)`,
        emotion: aiPoseEmotion,
        description: `AI generated pose - ${emotionInfo?.label || aiPoseEmotion}`,
        is_transparent: false,
        file,
      });

      setShowAiPoseModal(false);
      toast.success("Đã lưu pose AI thành công");
    } catch (err) {
      toast.error("Lưu pose thất bại: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    }

    setAiPoseSaving(false);
  };

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Nhân vật</h1>
            <p className="th-text-tertiary mt-1">Quản lý nhân vật và biểu cảm cho fanpage</p>
          </div>
          <Button onClick={openCreateChar} size="lg">
            <Plus size={18} />
            Thêm nhân vật
          </Button>
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
            <p className="th-text-muted mt-1 mb-5">Tạo nhân vật và tải lên biểu cảm để bắt đầu làm meme</p>
            <Button onClick={openCreateChar}>
              <Plus size={18} />
              Tạo nhân vật đầu tiên
            </Button>
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
                      {char.avatar_url ? (
                        <img src={char.avatar_url} alt={char.name} className="w-full h-full object-cover" />
                      ) : (
                        char.name[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold th-text-primary">{char.name}</h3>
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
                          const emotionInfo = EMOTION_OPTIONS.find((e) => e.value === pose.emotion);
                          return (
                            <div key={pose.id} className="group relative th-bg-tertiary rounded-xl overflow-hidden">
                              <div className="aspect-square flex items-center justify-center" style={{ background: "var(--bg-tertiary)", opacity: 0.5 }}>
                                {pose.image_url && !pose.image_url.startsWith("/mock/") ? (
                                  <img src={pose.image_url} alt={pose.name} className="w-full h-full object-contain" />
                                ) : (
                                  <div className="text-center p-2">
                                    <p className="text-2xl">{emotionInfo?.emoji || "😐"}</p>
                                    <p className="text-xs th-text-tertiary mt-1">{pose.name}</p>
                                  </div>
                                )}
                              </div>
                              <div className="p-2">
                                <p className="text-xs th-text-primary truncate">{pose.name}</p>
                                <p className="text-xs th-text-tertiary">{emotionInfo?.emoji} {emotionInfo?.label || pose.emotion}</p>
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
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Biểu cảm</label>
              <div className="grid grid-cols-4 gap-2">
                {EMOTION_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setPoseForm((f) => ({ ...f, emotion: opt.value }))}
                    className={`px-2 py-2 rounded-lg text-xs text-center transition-all border ${
                      poseForm.emotion === opt.value ? "th-border-accent th-text-accent th-bg-accent-light" : "th-bg-tertiary th-border th-text-secondary th-bg-hover"
                    }`}>
                    <span className="text-base">{opt.emoji}</span><br />{opt.label}
                  </button>
                ))}
              </div>
            </div>
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

            {/* Emotion selector for all uploads */}
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Cảm xúc mặc định cho tất cả ảnh</label>
              <div className="grid grid-cols-7 gap-1.5">
                {EMOTION_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setBulkUploadEmotion(opt.value)}
                    className={`px-1 py-2 rounded-lg text-xs text-center transition-all border ${
                      bulkUploadEmotion === opt.value ? "th-border-accent th-text-accent th-bg-accent-light" : "th-bg-tertiary th-border th-text-secondary th-bg-hover"
                    }`}>
                    <span className="text-base block">{opt.emoji}</span>
                    <span className="text-[10px] block mt-0.5">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

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

        {/* AI Generate Pose Modal */}
        <Modal isOpen={showAiPoseModal} onClose={() => setShowAiPoseModal(false)} title="Tạo tư thế bằng AI" size="xl">
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

            {/* Emotion selector */}
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Biểu cảm / Tư thế</label>
              <div className="grid grid-cols-7 gap-1.5">
                {EMOTION_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setAiPoseEmotion(opt.value)}
                    className={`px-1 py-2 rounded-lg text-xs text-center transition-all border ${
                      aiPoseEmotion === opt.value ? "th-border-accent th-text-accent th-bg-accent-light" : "th-bg-tertiary th-border th-text-secondary th-bg-hover"
                    }`}>
                    <span className="text-base block">{opt.emoji}</span>
                    <span className="text-[10px] block mt-0.5">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom style override */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium th-text-secondary">Style tuỳ chỉnh</label>
                <span className="text-[10px] th-text-muted">(để trống = dùng template đã chọn)</span>
              </div>
              <Textarea
                id="ai-pose-style"
                placeholder={selectedTemplate ? `Đang dùng: ${selectedTemplate.nameVi}. Nhập ở đây để override...` : 'VD: "Chibi dễ thương", "Flat vector"...'}
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
                Tạo Pose bằng AI ({selectedTemplate?.nameVi || "Custom"}) — 3 pts
              </Button>
            )}

            {/* Generating state */}
            {aiPoseGenerating && (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="w-16 h-16 rounded-2xl th-bg-accent-light flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)" }} />
                </div>
                <p className="th-text-primary font-medium">AI đang tạo pose...</p>
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
