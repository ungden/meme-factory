"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ChevronLeft,
  Edit2,
  Trash2,
  Upload,
  UploadCloud,
  Wand2,
  Loader2,
  RotateCcw,
  Download,
  Image as ImageIcon,
  Star,
  Check,
} from "lucide-react";
import { BulkUploader } from "@/components/ui/bulk-uploader";
import type { EmotionTag } from "@/types/database";
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

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();

  const projectId = params.id as string;
  const characterId = params.characterId as string;

  const { project } = useProject(projectId);
  const { characters, loading, updateCharacter, deleteCharacter, addPose, deletePose, setCharacterAvatar } = useCharacters(projectId);
  const { points, refreshBalance } = useWallet();

  const character = characters.find((c) => c.id === characterId);

  // Edit character modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", personality: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete character
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Upload pose modal
  const [showPoseModal, setShowPoseModal] = useState(false);
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
  const [bulkUploadEmotion, setBulkUploadEmotion] = useState<EmotionTag>("neutral");

  // AI Pose generation
  const [showAiPoseModal, setShowAiPoseModal] = useState(false);
  const [aiPoseEmotion, setAiPoseEmotion] = useState<EmotionTag>("happy");
  const [aiPoseStyle, setAiPoseStyle] = useState("");
  const [aiPoseGenerating, setAiPoseGenerating] = useState(false);
  const [aiPoseImage, setAiPoseImage] = useState<string | null>(null);
  const [aiPoseError, setAiPoseError] = useState<string | null>(null);
  const [aiPoseSaving, setAiPoseSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);

  // Delete pose
  const [deletePoseTarget, setDeletePoseTarget] = useState<string | null>(null);

  // Set avatar
  const [settingAvatar, setSettingAvatar] = useState(false);

  // --- Handlers ---

  const openEditChar = () => {
    if (!character) return;
    setEditForm({ name: character.name, description: character.description, personality: character.personality });
    setShowEditModal(true);
  };

  const saveCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await updateCharacter(characterId, editForm);
      toast.success(`Đã cập nhật nhân vật "${editForm.name}"`);
      setShowEditModal(false);
    } catch {
      toast.error("Không thể lưu nhân vật. Vui lòng thử lại.");
    }
    setEditSaving(false);
  };

  const handleDelete = async () => {
    await deleteCharacter(characterId);
    toast.success("Đã xoá nhân vật");
    router.push(`/projects/${projectId}/characters`);
  };

  const openAddPose = () => {
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
    if (!poseFile) return;
    setPoseSaving(true);
    try {
      await addPose(characterId, { ...poseForm, file: poseFile });
      setShowPoseModal(false);
      toast.success("Đã tải lên tư thế thành công");
    } catch (err) {
      toast.error("Tải lên thất bại: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    }
    setPoseSaving(false);
  };

  const handleBulkUploadFile = async (file: File) => {
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    await addPose(characterId, {
      name: nameWithoutExt || "Pose",
      emotion: bulkUploadEmotion,
      description: "",
      is_transparent: false,
      file,
    });
  };

  const openAiPose = () => {
    setAiPoseEmotion("happy");
    setAiPoseStyle("");
    setAiPoseImage(null);
    setAiPoseError(null);
    setSelectedTemplate(null);
    setShowAiPoseModal(true);
  };

  const selectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
  };

  const handleAiPoseGenerate = async () => {
    if (!character) return;

    await refreshBalance();
    if (!hasEnoughPoints(points, "character")) {
      toast.error(`Không đủ points. Tạo ảnh nhân vật cần ${POINT_COSTS.character} points, bạn có ${points} points. Vui lòng mua thêm trong Ví tiền.`);
      return;
    }

    setAiPoseGenerating(true);
    setAiPoseError(null);
    setAiPoseImage(null);

    try {
      const fullDescription = [
        character.description,
        character.personality ? `Tính cách: ${character.personality}` : "",
      ].filter(Boolean).join(". ");

      const styleToUse = aiPoseStyle.trim() || selectedTemplate?.characterStyle || undefined;

      const result = await generateImage({
        type: "character",
        characterName: character.name,
        characterDescription: fullDescription || `Nhân vật ${character.name} cho fanpage meme Việt Nam`,
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
    if (!aiPoseImage) return;
    setAiPoseSaving(true);

    try {
      const response = await fetch(`data:image/png;base64,${aiPoseImage}`);
      const blob = await response.blob();
      const file = new File([blob], `ai-pose-${aiPoseEmotion}-${Date.now()}.png`, { type: "image/png" });

      const emotionInfo = EMOTION_OPTIONS.find((e) => e.value === aiPoseEmotion);
      await addPose(characterId, {
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

  const handleDownloadAiPose = () => {
    if (!aiPoseImage) return;
    const link = document.createElement("a");
    link.download = `pose-ai-${aiPoseEmotion}-${Date.now()}.png`;
    link.href = `data:image/png;base64,${aiPoseImage}`;
    link.click();
  };

  const handleSetAvatar = async (poseImageUrl: string) => {
    setSettingAvatar(true);
    try {
      await setCharacterAvatar(characterId, poseImageUrl);
      toast.success("Đã đặt ảnh đại diện");
    } catch {
      toast.error("Không thể đặt ảnh đại diện");
    }
    setSettingAvatar(false);
  };

  // --- Loading / Not found ---

  if (loading) {
    return (
      <div className="flex">
        <Sidebar projectId={projectId} />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-6 w-48 th-bg-tertiary rounded-lg" />
            <div className="flex gap-6">
              <div className="w-32 h-32 th-bg-tertiary rounded-2xl" />
              <div className="flex-1 space-y-3">
                <div className="h-8 w-64 th-bg-tertiary rounded-lg" />
                <div className="h-4 w-96 th-bg-tertiary rounded" />
                <div className="h-4 w-80 th-bg-tertiary rounded" />
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="aspect-square th-bg-tertiary rounded-xl" />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex">
        <Sidebar projectId={projectId} />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <div className="flex flex-col items-center justify-center py-20">
            <p className="th-text-tertiary mb-4">Không tìm thấy nhân vật</p>
            <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/characters`)}>
              <ChevronLeft size={16} /> Quay lại danh sách
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const avatarSrc = character.avatar_url || character.poses[0]?.image_url;

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Link href={`/projects/${projectId}/characters`} className="th-text-muted hover:th-text-primary transition-colors flex items-center gap-1">
            <ChevronLeft size={16} />
            Nhân vật
          </Link>
          <span className="th-text-muted">/</span>
          <span className="th-text-primary font-medium">{character.name}</span>
        </div>

        {/* Character Header */}
        <Card className="mb-6">
          <div className="p-6 flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-32 h-32 th-bg-tertiary rounded-2xl overflow-hidden flex items-center justify-center text-4xl font-bold th-text-muted">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={character.name} className="w-full h-full object-cover" />
                ) : (
                  character.name[0]?.toUpperCase()
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h1 className="text-2xl font-bold th-text-primary">{character.name}</h1>
                  <p className="text-sm th-text-muted mt-0.5">{character.poses.length} biểu cảm</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={openEditChar}>
                    <Edit2 size={14} /> Chỉnh sửa
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                    <Trash2 size={14} style={{ color: "var(--danger)" }} />
                  </Button>
                </div>
              </div>

              {character.description && (
                <div className="mb-2">
                  <p className="text-xs th-text-muted uppercase tracking-wider mb-0.5">Mô tả ngoại hình</p>
                  <p className="text-sm th-text-secondary">{character.description}</p>
                </div>
              )}

              {character.personality && (
                <div>
                  <p className="text-xs th-text-muted uppercase tracking-wider mb-0.5">Tính cách</p>
                  <p className="text-sm th-text-secondary">{character.personality}</p>
                </div>
              )}

              {!character.description && !character.personality && (
                <p className="text-sm th-text-muted italic">Chưa có mô tả. Bấm &ldquo;Chỉnh sửa&rdquo; để thêm.</p>
              )}
            </div>
          </div>
        </Card>

        {/* Poses Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold th-text-primary">Tư thế / Biểu cảm</h2>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={openAiPose}>
                <Wand2 size={14} />
                Tạo bằng AI (3 pts)
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setBulkUploadEmotion("neutral"); setShowBulkUploadModal(true); }}>
                <UploadCloud size={14} />
                Tải lên hàng loạt
              </Button>
              <Button size="sm" onClick={openAddPose}>
                <Upload size={14} />
                Tải lên tư thế
              </Button>
            </div>
          </div>

          {character.poses.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto th-bg-tertiary rounded-2xl flex items-center justify-center mb-4">
                  <ImageIcon size={28} className="th-text-muted" />
                </div>
                <h3 className="font-medium th-text-secondary mb-1">Chưa có tư thế nào</h3>
                <p className="text-sm th-text-muted mb-4">Tải lên ảnh hoặc dùng AI để tạo biểu cảm cho nhân vật</p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={openAiPose}>
                    <Wand2 size={14} /> Tạo bằng AI
                  </Button>
                  <Button onClick={openAddPose}>
                    <Upload size={14} /> Tải lên ảnh
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {character.poses.map((pose) => {
                const emotionInfo = EMOTION_OPTIONS.find((e) => e.value === pose.emotion);
                const isAvatar = character.avatar_url === pose.image_url;
                return (
                  <Card key={pose.id} className="group relative overflow-hidden">
                    <div className="aspect-square flex items-center justify-center th-bg-tertiary relative">
                      {pose.image_url && !pose.image_url.startsWith("/mock/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pose.image_url} alt={pose.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center p-2">
                          <p className="text-3xl">{emotionInfo?.emoji || "😐"}</p>
                          <p className="text-xs th-text-tertiary mt-1">{pose.name}</p>
                        </div>
                      )}
                      {/* Avatar badge */}
                      {isAvatar && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-medium flex items-center gap-1" style={{ background: "var(--accent)", color: "white" }}>
                          <Star size={10} /> Ảnh đại diện
                        </div>
                      )}
                      {/* Hover actions */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {!isAvatar && pose.image_url && !pose.image_url.startsWith("/mock/") && (
                          <button
                            onClick={() => handleSetAvatar(pose.image_url)}
                            disabled={settingAvatar}
                            className="p-2 bg-white/90 rounded-xl hover:bg-white transition-colors"
                            title="Đặt làm ảnh đại diện"
                          >
                            {settingAvatar ? <Loader2 size={16} className="animate-spin text-gray-700" /> : <Star size={16} className="text-gray-700" />}
                          </button>
                        )}
                        {isAvatar && (
                          <div className="p-2 bg-white/90 rounded-xl">
                            <Check size={16} style={{ color: "var(--accent)" }} />
                          </div>
                        )}
                        <button
                          onClick={() => setDeletePoseTarget(pose.id)}
                          className="p-2 bg-red-500/90 rounded-xl hover:bg-red-600 transition-colors"
                          title="Xoá tư thế"
                        >
                          <Trash2 size={16} className="text-white" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm th-text-primary truncate font-medium">{pose.name}</p>
                      <p className="text-xs th-text-tertiary">{emotionInfo?.emoji} {emotionInfo?.label || pose.emotion}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== MODALS ===== */}

        {/* Edit Character Modal */}
        <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Chỉnh sửa nhân vật">
          <form onSubmit={saveCharacter} className="space-y-4">
            <Input id="char-name" label="Tên nhân vật" placeholder='VD: "Bò Bull", "Gấu Bear"' value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
            <Textarea id="char-desc" label="Mô tả ngoại hình" placeholder="Mô tả hình dáng nhân vật để AI hiểu ngữ cảnh" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            <Textarea id="char-personality" label="Tính cách" placeholder='VD: "Lạc quan, hay flexing, thích chứng khoán lên xanh"' value={editForm.personality} onChange={(e) => setEditForm((f) => ({ ...f, personality: e.target.value }))} rows={2} />
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="ghost" type="button" onClick={() => setShowEditModal(false)}>Huỷ</Button>
              <Button type="submit" loading={editSaving}>Lưu thay đổi</Button>
            </div>
          </form>
        </Modal>

        {/* Upload Pose Modal */}
        <Modal isOpen={showPoseModal} onClose={() => setShowPoseModal(false)} title="Tải lên tư thế">
          <form onSubmit={savePose} className="space-y-4">
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Ảnh tư thế</label>
              <div className="border-2 border-dashed rounded-xl p-6 text-center th-border-accent-hover transition-colors cursor-pointer th-border" onClick={() => document.getElementById("pose-file-detail")?.click()}>
                {posePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={posePreview} alt="Preview" className="w-32 h-32 mx-auto object-contain rounded-lg" />
                ) : (
                  <>
                    <ImageIcon size={32} className="mx-auto th-text-muted mb-2" />
                    <p className="text-sm th-text-tertiary">Bấm để chọn ảnh</p>
                    <p className="text-xs th-text-muted mt-1">Khuyến nghị PNG nền trong suốt</p>
                  </>
                )}
                <input id="pose-file-detail" type="file" accept="image/*" className="hidden" onChange={handlePoseFileChange} />
              </div>
            </div>
            <Input id="pose-name" label="Tên tư thế" placeholder='VD: "Giơ tay ăn mừng", "Khóc lóc"' value={poseForm.name} onChange={(e) => setPoseForm((f) => ({ ...f, name: e.target.value }))} required />
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
            <Textarea id="pose-desc" label="Mô tả (tuỳ chọn)" placeholder="Mô tả tư thế này" value={poseForm.description} onChange={(e) => setPoseForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={poseForm.is_transparent} onChange={(e) => setPoseForm((f) => ({ ...f, is_transparent: e.target.checked }))} className="w-4 h-4 rounded accent-[var(--accent)]" />
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
            <div className="flex items-center gap-3 p-3 rounded-xl th-bg-tertiary">
              <div className="w-10 h-10 rounded-xl th-bg-card flex items-center justify-center text-sm font-bold th-text-tertiary overflow-hidden">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={character.name} className="w-full h-full object-cover" />
                ) : (
                  character.name[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium th-text-primary">{character.name}</p>
                <p className="text-xs th-text-tertiary">Tải nhiều ảnh pose cùng lúc</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Cảm xúc mặc định</label>
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
            <BulkUploader
              onUpload={handleBulkUploadFile}
              accept="image/*"
              maxFiles={50}
              maxSizeMB={10}
              label="Kéo thả nhiều ảnh pose vào đây"
              hint="Hỗ trợ PNG, JPG, WebP. Tối đa 50 ảnh, mỗi ảnh ≤ 10MB."
            />
          </div>
        </Modal>

        {/* AI Generate Pose Modal */}
        <Modal isOpen={showAiPoseModal} onClose={() => setShowAiPoseModal(false)} title="Tạo tư thế bằng AI" size="xl">
          <div className="space-y-5">
            {/* Character info */}
            <div className="flex items-center gap-3 p-3 rounded-xl th-bg-tertiary">
              <div className="w-10 h-10 rounded-xl th-bg-card flex items-center justify-center text-sm font-bold th-text-tertiary overflow-hidden">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={character.name} className="w-full h-full object-cover" />
                ) : (
                  character.name[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium th-text-primary">{character.name}</p>
                <p className="text-xs th-text-tertiary truncate">{character.personality || character.description || "Chưa có mô tả"}</p>
              </div>
            </div>

            {/* Style Template Picker */}
            <div>
              <label className="text-sm font-medium th-text-secondary mb-2 block">Chọn phong cách</label>
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
                <span className="text-[10px] th-text-muted">(để trống = chỉ dùng mô tả nhân vật{selectedTemplate ? ` + template ${selectedTemplate.nameVi}` : ""})</span>
              </div>
              <Textarea
                id="ai-pose-style-detail"
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
                Tạo Pose bằng AI ({selectedTemplate?.nameVi || "Không template"}) — 3 pts
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
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
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
