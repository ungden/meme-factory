"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useProject, useMemes } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import {
  Download,
  Trash2,
  Image as ImageIcon,
  Calendar,
  Copy,
  CheckSquare,
  Square,
  X,
  Package,
  Loader2,
  CheckCircle,
} from "lucide-react";
import type { MemeContent } from "@/types/database";

export default function GalleryPage() {
  const params = useParams();
  const projectId = params.id as string;
  const toast = useToast();

  const { project } = useProject(projectId);
  const { memes, loading, remove } = useMemes(projectId);
  const [selectedMeme, setSelectedMeme] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0 });

  const selected = memes.find((m) => m.id === selectedMeme);

  // Only memes with images can be downloaded
  const downloadableMemes = memes.filter((m) => m.image_url);
  const selectedDownloadable = Array.from(selectedIds).filter((id) =>
    downloadableMemes.some((m) => m.id === id)
  );

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(downloadableMemes.map((m) => m.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget);
    toast.success("Đã xoá meme");
    if (selectedMeme === deleteTarget) setSelectedMeme(null);
    selectedIds.delete(deleteTarget);
    setDeleteTarget(null);
  };

  const handleDownload = (imageUrl: string | null, id: string) => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `meme-${id}.png`;
    link.click();
    toast.success("Đang tải xuống...");
  };

  const handleCopyCaption = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("Đã sao chép caption");
      })
      .catch(() => {
        toast.error("Không thể sao chép");
      });
  };

  const handleBulkDownload = useCallback(async () => {
    if (selectedDownloadable.length === 0) {
      toast.error("Chưa chọn meme nào có ảnh để tải");
      return;
    }

    setIsZipping(true);
    setZipProgress({ done: 0, total: selectedDownloadable.length });

    try {
      // Dynamic import jszip to avoid SSR issues
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      let done = 0;
      const CONCURRENCY = 4;

      const fetchAndAdd = async (memeId: string) => {
        const meme = memes.find((m) => m.id === memeId);
        if (!meme?.image_url) return;

        try {
          const response = await fetch(meme.image_url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();

          // Determine extension from content type
          const contentType = response.headers.get("content-type") || "image/png";
          const ext = contentType.includes("webp")
            ? "webp"
            : contentType.includes("jpeg") || contentType.includes("jpg")
            ? "jpg"
            : "png";

          const content = meme.generated_content as MemeContent;
          // Use headline as filename (sanitized), fallback to id
          const safeName = (content?.headline || meme.original_idea || memeId)
            .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ-]/gi, "")
            .trim()
            .slice(0, 60);

          zip.file(`${safeName || memeId}.${ext}`, blob);
        } catch (err) {
          console.warn(`Failed to fetch meme ${memeId}:`, err);
        }

        done++;
        setZipProgress({ done, total: selectedDownloadable.length });
      };

      // Fetch in batches
      for (let i = 0; i < selectedDownloadable.length; i += CONCURRENCY) {
        const batch = selectedDownloadable.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(fetchAndAdd));
      }

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Trigger download
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      const projectName = project?.name?.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ-]/gi, "").trim() || "memes";
      link.download = `${projectName}-${selectedDownloadable.length}-memes.zip`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Đã tải ${selectedDownloadable.length} meme thành file ZIP`);
      exitSelectionMode();
    } catch (err) {
      console.error("ZIP download failed:", err);
      toast.error("Lỗi khi tạo file ZIP. Vui lòng thử lại.");
    }

    setIsZipping(false);
  }, [selectedDownloadable, memes, project, toast]);

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Thư viện</h1>
            <p className="th-text-tertiary mt-1">{memes.length} meme đã tạo</p>
          </div>
          {!loading && memes.length > 0 && !selectionMode && (
            <Button variant="outline" onClick={() => setSelectionMode(true)}>
              <CheckSquare size={16} />
              Chọn để tải
            </Button>
          )}
        </div>

        {/* Selection bar */}
        {selectionMode && (
          <div
            className="flex items-center justify-between mb-4 p-3 rounded-xl border"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--accent)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium th-text-primary">
                {selectedDownloadable.length} / {downloadableMemes.length} đã chọn
              </span>
              <button
                onClick={selectedIds.size === downloadableMemes.length ? deselectAll : selectAll}
                className="text-xs th-text-accent hover:underline"
              >
                {selectedIds.size === downloadableMemes.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleBulkDownload}
                disabled={selectedDownloadable.length === 0 || isZipping}
                loading={isZipping}
              >
                {isZipping ? (
                  <>
                    <Package size={14} />
                    Đang nén... ({zipProgress.done}/{zipProgress.total})
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Tải xuống ({selectedDownloadable.length})
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
                <X size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* ZIP progress bar */}
        {isZipping && (
          <div className="mb-4 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div
              className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-violet-500 to-indigo-500"
              style={{
                width: `${zipProgress.total > 0 ? (zipProgress.done / zipProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-square th-bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : memes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 th-bg-card rounded-2xl flex items-center justify-center mb-4">
              <ImageIcon size={32} className="th-text-muted" />
            </div>
            <h3 className="text-lg font-medium th-text-secondary">Chưa có meme nào</h3>
            <p className="th-text-muted mt-1">Meme đã tạo sẽ xuất hiện ở đây</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memes.map((meme) => {
              const content = meme.generated_content as MemeContent;
              const isSelected = selectedIds.has(meme.id);
              const hasImage = !!meme.image_url;

              return (
                <Card
                  key={meme.id}
                  hover
                  onClick={() => {
                    if (selectionMode) {
                      if (hasImage) toggleSelection(meme.id);
                    } else {
                      setSelectedMeme(meme.id);
                    }
                  }}
                  className={`group overflow-hidden relative ${
                    selectionMode && isSelected ? "ring-2 ring-violet-500" : ""
                  }`}
                >
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div className="absolute top-2 left-2 z-10">
                      {isSelected ? (
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center"
                          style={{ background: "var(--accent)" }}
                        >
                          <CheckCircle size={16} className="text-white" />
                        </div>
                      ) : hasImage ? (
                        <div
                          className="w-6 h-6 rounded-md border-2 flex items-center justify-center bg-white/80 dark:bg-black/40"
                          style={{ borderColor: "var(--border-primary)" }}
                        >
                          <Square size={12} className="th-text-muted" />
                        </div>
                      ) : (
                        <div
                          className="w-6 h-6 rounded-md border-2 flex items-center justify-center bg-white/50 opacity-40 cursor-not-allowed"
                          style={{ borderColor: "var(--border-primary)" }}
                          title="Không có ảnh để tải"
                        >
                          <Square size={12} className="th-text-muted" />
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className="aspect-square relative overflow-hidden flex items-center justify-center"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {meme.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meme.image_url} alt={content?.headline || meme.original_idea} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-4">
                        <ImageIcon size={24} className="mx-auto th-text-muted mb-2" />
                        <p className="text-xs th-text-tertiary line-clamp-3">
                          {content?.headline || meme.original_idea}
                        </p>
                      </div>
                    )}
                    {!selectionMode && (
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                        style={{ background: "var(--bg-overlay)" }}
                      >
                        <button
                          aria-label="Tải xuống meme"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(meme.image_url, meme.id);
                          }}
                          className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                        >
                          <Download size={18} className="text-white" />
                        </button>
                        <button
                          aria-label="Xoá meme"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(meme.id);
                          }}
                          className="p-2 bg-red-500/30 rounded-xl hover:bg-red-500/50 transition-colors"
                        >
                          <Trash2 size={18} className="text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs th-text-primary font-medium truncate">
                      {content?.headline || meme.original_idea}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs th-text-muted flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(meme.created_at).toLocaleDateString("vi-VN")}
                      </span>
                      <span className="px-1.5 py-0.5 text-xs th-bg-tertiary th-text-tertiary rounded">
                        {meme.format}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        <Modal isOpen={!!selected} onClose={() => setSelectedMeme(null)} title="Chi tiết meme" size="xl">
          {selected &&
            (() => {
              const content = selected.generated_content as MemeContent;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="th-bg-tertiary rounded-xl overflow-hidden flex items-center justify-center min-h-[200px]">
                    {selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.image_url} alt={((selected.generated_content as MemeContent)?.headline) || selected.original_idea} className="w-full h-auto" />
                    ) : (
                      <div className="text-center p-8">
                        <ImageIcon size={48} className="mx-auto th-text-muted mb-2" />
                        <p className="text-sm th-text-tertiary">{content?.headline}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs th-text-muted uppercase tracking-wider">Ý tưởng gốc</p>
                      <p className="text-sm th-text-secondary mt-1">{selected.original_idea}</p>
                    </div>
                    {content?.headline && (
                      <div>
                        <p className="text-xs th-text-muted uppercase tracking-wider">Headline</p>
                        <p className="text-lg font-bold th-text-primary mt-1">{content.headline}</p>
                      </div>
                    )}
                    {content?.caption && (
                      <div>
                        <p className="text-xs th-text-muted uppercase tracking-wider">Caption</p>
                        <p className="text-sm th-text-secondary mt-1">{content.caption}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1"
                          onClick={() => handleCopyCaption(content.caption || "")}
                        >
                          <Copy size={12} /> Sao chép
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs th-text-tertiary">
                      <Calendar size={12} />
                      {new Date(selected.created_at).toLocaleString("vi-VN")}
                      <span className="px-1.5 py-0.5 th-bg-tertiary rounded">{selected.format}</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => handleDownload(selected.image_url, selected.id)}>
                        <Download size={14} /> Tải xuống
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(selected.id)}>
                        <Trash2 size={14} /> Xoá
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Xoá meme?"
          message="Meme này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          confirmText="Xoá meme"
          variant="danger"
        />
      </main>
    </div>
  );
}
