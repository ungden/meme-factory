"use client";

import { useState } from "react";
import { ImageIcon, ImagePlus, Sparkles, Star, Trash2 } from "lucide-react";
import Button from "@/components/ui/button";
import { BulkUploader } from "@/components/ui/bulk-uploader";
import ConfirmModal from "@/components/ui/confirm-modal";
import EmptyState from "@/components/ui/empty-state";
import JobStatus from "@/components/ui/job-status";
import Modal from "@/components/ui/modal";
import PriceLine from "@/components/ui/price-line";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { compressImageToFile } from "@/lib/image-utils";
import type { CharacterPose, EmotionTag } from "@/types/database";
import { isInsufficientPoints } from "./character-pack";
import { ApiError, postJson } from "./use-character-pack";

type AddPose = (
  characterId: string,
  input: { name: string; emotion: EmotionTag; description: string; is_transparent: boolean; file: File },
) => Promise<unknown>;

/**
 * Ảnh khác của một nhân vật: ảnh bạn thêm và ảnh AIDA vẽ thêm. Đây là ảnh mẫu
 * khi vẽ meme có nhân vật, và là nơi chọn ảnh đại diện.
 */
export default function CharacterImages({
  projectRef,
  character,
  pointsPerImage,
  available,
  addPose,
  deletePose,
  setAvatar,
  reload,
  onSpent,
  onOutOfPoints,
}: {
  projectRef: string;
  character: { id: string; name: string; avatar_url: string | null; poses: CharacterPose[] };
  pointsPerImage: number | null;
  available: number | null;
  addPose: AddPose;
  deletePose: (poseId: string) => Promise<void>;
  setAvatar: (characterId: string, url: string) => Promise<void>;
  reload: () => Promise<void>;
  onSpent: () => void;
  onOutOfPoints: (needed: { required: number; current: number; retry: () => void }) => void;
}) {
  const toast = useToast();
  const [drawOpen, setDrawOpen] = useState(false);
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [lastNote, setLastNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<string | null>(null);

  async function draw(text: string) {
    setDrawOpen(false);
    setDrawing(true);
    setDrawError("");
    setLastNote(text);
    try {
      // Máy chủ lưu ảnh vào kho trước khi trả lời: đóng tab lúc này không mất ảnh đã trả điểm.
      await postJson(`/api/projects/${projectRef}/characters/${character.id}/images`, { note: text });
      setNote("");
      toast.success(`Đã vẽ thêm một ảnh cho ${character.name}`);
      await reload();
    } catch (cause) {
      if (cause instanceof ApiError && isInsufficientPoints(cause.payload)) {
        onOutOfPoints({
          required: Number(cause.payload.required) || pointsPerImage || 0,
          current: Number(cause.payload.current) || available || 0,
          retry: () => void draw(text),
        });
      } else {
        setDrawError((cause as Error).message);
      }
    } finally {
      setDrawing(false);
      onSpent();
    }
  }

  async function addFile(file: File) {
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
    const compressed = await compressImageToFile(file, 1024, file.name);
    await addPose(character.id, { name: name || "Ảnh của bạn", emotion: "neutral", description: "", is_transparent: false, file: compressed });
  }

  async function makeAvatar(url: string) {
    setAvatarBusy(url);
    try {
      await setAvatar(character.id, url);
      toast.success("Đã đổi ảnh đại diện");
    } catch {
      toast.error("Chưa đổi được ảnh đại diện. Bạn thử lại nhé.");
    } finally {
      setAvatarBusy(null);
    }
  }

  const usable = character.poses.filter((pose) => pose.image_url && !pose.image_url.startsWith("/mock/"));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="character-images-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="character-images-title" className="text-lg font-semibold th-text-primary">
            Ảnh khác
          </h2>
          <p className="text-sm th-text-secondary">Ảnh mẫu để AIDA vẽ đúng {character.name} trong meme. Chọn một tấm làm ảnh đại diện.</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end">
          {pointsPerImage !== null && <PriceLine points={pointsPerImage} available={available} note="mỗi ảnh vẽ thêm" />}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <ImagePlus size={14} aria-hidden /> Thêm ảnh
            </Button>
            <Button size="sm" onClick={() => setDrawOpen(true)} disabled={drawing}>
              <Sparkles size={14} aria-hidden /> Vẽ thêm ảnh
            </Button>
          </div>
        </div>
      </div>

      {drawing && <JobStatus state="working" title={`Đang vẽ thêm ảnh cho ${character.name}…`} detail="Thường mất 10–30 giây." />}
      {!drawing && drawError && (
        <JobStatus
          state="failed"
          title="Chưa vẽ được ảnh"
          detail={`${drawError} Lần hỏng này không bị tính điểm.`}
          onRetry={() => void draw(lastNote)}
        />
      )}

      {usable.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Chưa có ảnh nào"
          hint="Thêm ảnh có sẵn của nhân vật, hoặc để AIDA vẽ thêm."
          action={
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <ImagePlus size={14} aria-hidden /> Thêm ảnh
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {usable.map((pose) => {
            const isAvatar = character.avatar_url === pose.image_url;
            return (
              <li key={pose.id} className="flex flex-col overflow-hidden rounded-2xl border th-border th-bg-card">
                <div className="relative aspect-square th-bg-tertiary">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app */}
                  <img src={pose.image_url} alt={pose.name} className="h-full w-full object-contain" />
                  {isAvatar && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full th-bg-accent-light px-2 py-0.5 text-xs font-medium th-text-accent">
                      <Star size={12} aria-hidden /> Ảnh đại diện
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="truncate text-sm font-medium th-text-primary" title={pose.name}>
                    {pose.name}
                  </p>
                  <div className="mt-auto flex gap-1">
                    {!isAvatar && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        loading={avatarBusy === pose.image_url}
                        disabled={Boolean(avatarBusy)}
                        onClick={() => void makeAvatar(pose.image_url)}
                      >
                        <Star size={14} aria-hidden /> Đại diện
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" aria-label={`Xoá ảnh ${pose.name}`} title="Xoá ảnh" onClick={() => setDeleteTarget(pose.id)}>
                      <Trash2 size={14} aria-hidden className="th-text-danger" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={drawOpen} onClose={() => setDrawOpen(false)} title={`Vẽ thêm ảnh cho ${character.name}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void draw(note.trim());
          }}
        >
          <Textarea
            id="character-draw-note"
            label="Muốn vẽ thế nào? (không bắt buộc)"
            placeholder="Ví dụ: đang cười lớn, giơ ngón cái"
            value={note}
            maxLength={300}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-xs th-text-tertiary">AIDA vẽ theo ảnh đại diện và đặc điểm cần giữ, ảnh xong tự nằm trong mục Ảnh khác.</p>
          {pointsPerImage !== null && <PriceLine points={pointsPerImage} available={available} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDrawOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit">
              <Sparkles size={14} aria-hidden /> Vẽ
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={`Thêm ảnh cho ${character.name}`} size="xl">
        <BulkUploader
          onUpload={addFile}
          accept="image/*"
          maxFiles={50}
          maxSizeMB={10}
          label="Kéo thả ảnh vào đây, hoặc bấm để chọn ảnh"
          hint="PNG, JPG hoặc WEBP, tối đa 50 ảnh, mỗi ảnh không quá 10 MB. Ảnh có nền trong suốt cho kết quả đẹp nhất."
        />
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await deletePose(deleteTarget);
            toast.success("Đã xoá ảnh");
            setDeleteTarget(null);
          } catch {
            toast.error("Chưa xoá được ảnh. Bạn thử lại nhé.");
          } finally {
            setDeleting(false);
          }
        }}
        title="Xoá ảnh này?"
        message="Ảnh này sẽ mất hẳn, không lấy lại được."
        confirmText="Xoá ảnh"
        variant="danger"
      />
    </section>
  );
}
