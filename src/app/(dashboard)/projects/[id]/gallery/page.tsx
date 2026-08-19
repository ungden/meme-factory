"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject, useMemes } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import { recordMemeExport, useMemeCollections, useMemeExports } from "@/lib/use-templates";
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
  CheckCircle,
  Wand2,
  Sparkles,
  Type,
  FolderPlus,
  CopyPlus,
} from "lucide-react";
import { FORMAT_DIMENSIONS, type MemeContent, type MemeFormat } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const toast = useToast();

  const { project } = useProject(projectId);
  const { memes, loading, remove, reload } = useMemes(projectId);
  const [selectedMeme, setSelectedMeme] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0 });

  const { collections, membership, create: createCollection, addMeme, removeMeme } = useMemeCollections(projectId);
  const { exports: exportHistory, reload: reloadExports } = useMemeExports(selectedMeme);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<"all" | "7d" | "30d">("all");
  const [formatFilter, setFormatFilter] = useState<"all" | MemeFormat>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "draft">("all");
  const [duplicating, setDuplicating] = useState(false);

  // All filtering happens on the already-loaded list; no extra round trip.
  const visibleMemes = memes.filter((meme) => {
    if (activeCollection && !(membership[activeCollection] ?? []).includes(meme.id)) return false;
    if (formatFilter !== "all" && meme.format !== formatFilter) return false;
    if (statusFilter !== "all" && meme.status !== statusFilter) return false;
    if (timeFilter !== "all") {
      const days = timeFilter === "7d" ? 7 : 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      if (new Date(meme.created_at).getTime() < cutoff) return false;
    }
    return true;
  });

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
    toast.success("Đã xoá đầu ra");
    if (selectedMeme === deleteTarget) setSelectedMeme(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget);
      return next;
    });
    setDeleteTarget(null);
  };

  const handleDownload = (imageUrl: string | null, id: string) => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `meme-${id}.png`;
    link.click();
    toast.success("Đang tải xuống...");

    const meme = memes.find((entry) => entry.id === id);
    if (project?.id && meme) {
      const dimensions = FORMAT_DIMENSIONS[meme.format];
      void recordMemeExport({
        projectId: project.id,
        memeId: meme.id,
        baseImageId: meme.base_image_id ?? null,
        aspectRatio: meme.format,
        width: dimensions.width,
        height: dimensions.height,
        hadWatermark: Boolean(meme.has_watermark),
      }).then(() => {
        if (selectedMeme === id) reloadExports();
      });
    }
  };

  /** Reuses the stored image object; only the row is copied. */
  const handleDuplicate = async (id: string) => {
    const source = memes.find((meme) => meme.id === id);
    if (!source || !project?.id) return;

    setDuplicating(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("memes").insert({
        project_id: project.id,
        original_idea: source.original_idea,
        generated_content: source.generated_content,
        selected_characters: source.selected_characters,
        format: source.format,
        image_url: source.image_url,
        has_watermark: source.has_watermark,
        status: source.status,
        source_meme_id: source.id,
        editor_doc: source.editor_doc ?? null,
        base_image_id: source.base_image_id ?? null,
        composed_locally: Boolean(source.composed_locally),
      });
      if (error) throw new Error(error.message);
      toast.success("Đã nhân bản");
      setSelectedMeme(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nhân bản thất bại");
    } finally {
      setDuplicating(false);
    }
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

  const goRegenerate = (memeId: string) => {
    setSelectedMeme(null);
    setDeleteTarget(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    requestAnimationFrame(() => {
      router.push(`/projects/${projectId}/generate?fromMeme=${encodeURIComponent(memeId)}&mode=regenerate`);
    });
  };

  const goEditText = (memeId: string) => {
    setSelectedMeme(null);
    setDeleteTarget(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    requestAnimationFrame(() => {
      router.push(`/projects/${projectId}/editor?meme=${encodeURIComponent(memeId)}`);
    });
  };

  const goReuseIdea = (memeId: string) => {
    setSelectedMeme(null);
    setDeleteTarget(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    requestAnimationFrame(() => {
      router.push(`/projects/${projectId}/generate?fromMeme=${encodeURIComponent(memeId)}&mode=reuse`);
    });
  };

  const handleBulkDownload = useCallback(async () => {
    if (selectedDownloadable.length === 0) {
      toast.error("Chưa chọn đầu ra nào có ảnh để tải");
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

      toast.success(`Đã tải ${selectedDownloadable.length} đầu ra thành file ZIP`);
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
            <p className="th-text-tertiary mt-1">{memes.length} đầu ra đã lưu từ tất cả chế độ Studio</p>
          </div>
          {!loading && memes.length > 0 && !selectionMode && (
            <Button variant="outline" onClick={() => setSelectionMode(true)}>
              <CheckSquare size={16} />
              Chọn để tải
            </Button>
          )}
        </div>

        {/* Filters */}
        {!loading && memes.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Lọc theo thời gian"
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value as typeof timeFilter)}
              className="rounded-xl border th-border-secondary th-bg-tertiary px-3 py-1.5 text-xs th-text-primary"
            >
              <option value="all">Mọi thời điểm</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
            </select>
            <select
              aria-label="Lọc theo khổ ảnh"
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value as typeof formatFilter)}
              className="rounded-xl border th-border-secondary th-bg-tertiary px-3 py-1.5 text-xs th-text-primary"
            >
              <option value="all">Mọi khổ ảnh</option>
              {(Object.keys(FORMAT_DIMENSIONS) as MemeFormat[]).map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="rounded-xl border th-border-secondary th-bg-tertiary px-3 py-1.5 text-xs th-text-primary"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="completed">Đã hoàn tất</option>
              <option value="draft">Nháp</option>
            </select>
            <span className="text-xs th-text-tertiary">
              {visibleMemes.length} / {memes.length} đầu ra
            </span>
          </div>
        )}

        {/* Collections */}
        {!loading && memes.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCollection(null)}
              className={`rounded-full border px-3 py-1 text-xs ${
                activeCollection === null
                  ? "border-blue-600 text-blue-600 bg-blue-600/10"
                  : "th-border-secondary th-text-tertiary"
              }`}
            >
              Tất cả ({memes.length})
            </button>
            {collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => setActiveCollection(collection.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeCollection === collection.id
                    ? "border-blue-600 text-blue-600 bg-blue-600/10"
                    : "th-border-secondary th-text-tertiary"
                }`}
              >
                {collection.name} ({collection.meme_count})
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                const name = window.prompt("Tên bộ sưu tập mới");
                if (!name?.trim()) return;
                try {
                  await createCollection(name.trim());
                  toast.success("Đã tạo bộ sưu tập");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Không tạo được bộ sưu tập");
                }
              }}
              className="flex items-center gap-1 rounded-full border border-dashed th-border-secondary px-3 py-1 text-xs th-text-tertiary"
            >
              <FolderPlus size={12} /> Bộ sưu tập mới
            </button>
          </div>
        )}

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
              className="h-full rounded-full transition-all duration-300 bg-blue-500"
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
            <h3 className="text-lg font-medium th-text-secondary">Chưa có đầu ra nào</h3>
            <p className="th-text-muted mt-1">Ảnh từ Nội dung nhanh và Dựng cảnh sẽ xuất hiện ở đây</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleMemes.map((meme) => {
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
                    selectionMode && isSelected ? "ring-2 ring-blue-500" : ""
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
                          aria-label="Tạo biến thể từ meme này"
                          onClick={(e) => {
                            e.stopPropagation();
                            goRegenerate(meme.id);
                          }}
                          className="p-2 bg-blue-500/40 rounded-xl hover:bg-blue-500/60 transition-colors"
                          title="Tạo biến thể"
                        >
                          <Sparkles size={18} className="text-white" />
                        </button>
                        <button
                          aria-label="Sửa chữ trên meme này"
                          onClick={(e) => {
                            e.stopPropagation();
                            goEditText(meme.id);
                          }}
                          className="p-2 bg-blue-500/40 rounded-xl hover:bg-blue-500/60 transition-colors"
                          title="Sửa chữ (0 điểm)"
                        >
                          <Type size={18} className="text-white" />
                        </button>
                        <button
                          aria-label="Dùng lại ý tưởng"
                          onClick={(e) => {
                            e.stopPropagation();
                            goReuseIdea(meme.id);
                          }}
                          className="p-2 bg-blue-500/40 rounded-xl hover:bg-blue-500/60 transition-colors"
                          title="Dùng lại ý tưởng"
                        >
                          <Wand2 size={18} className="text-white" />
                        </button>
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
                      {meme.source_meme_id && (
                        <span className="px-1.5 py-0.5 text-xs rounded th-bg-accent-light th-text-accent">
                          Biến thể
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        <Modal isOpen={!!selected} onClose={() => setSelectedMeme(null)} title="Chi tiết đầu ra" size="xl">
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
                      {selected.source_meme_id && (
                        <span className="px-1.5 py-0.5 rounded th-bg-accent-light th-text-accent">Biến thể từ đầu ra cũ</span>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => goRegenerate(selected.id)}>
                        <Sparkles size={14} /> Tạo biến thể
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => goEditText(selected.id)}>
                        <Type size={14} /> Sửa chữ
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={duplicating}
                        onClick={() => handleDuplicate(selected.id)}
                      >
                        <CopyPlus size={14} /> Nhân bản
                      </Button>
                      {collections.length > 0 && (
                        <select
                          aria-label="Thêm vào bộ sưu tập"
                          defaultValue=""
                          onChange={async (event) => {
                            const collectionId = event.target.value;
                            event.target.value = "";
                            if (!collectionId) return;
                            const already = (membership[collectionId] ?? []).includes(selected.id);
                            try {
                              if (already) {
                                await removeMeme(collectionId, selected.id);
                                toast.success("Đã bỏ khỏi bộ sưu tập");
                              } else {
                                await addMeme(collectionId, selected.id);
                                toast.success("Đã thêm vào bộ sưu tập");
                              }
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Không cập nhật được");
                            }
                          }}
                          className="rounded-xl border th-border-secondary th-bg-tertiary px-3 text-sm th-text-primary"
                        >
                          <option value="">Bộ sưu tập…</option>
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {(membership[collection.id] ?? []).includes(selected.id) ? "✓ " : ""}
                              {collection.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <Button variant="outline" size="sm" onClick={() => goReuseIdea(selected.id)}>
                        <Wand2 size={14} /> Dùng lại idea
                      </Button>
                      <Button size="sm" onClick={() => handleDownload(selected.image_url, selected.id)}>
                        <Download size={14} /> Tải xuống
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(selected.id)}>
                        <Trash2 size={14} /> Xoá
                      </Button>
                    </div>

                    {exportHistory.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs th-text-muted uppercase tracking-wider mb-1.5">
                          Lịch sử tải xuống
                        </p>
                        <ul className="space-y-1">
                          {exportHistory.slice(0, 6).map((entry) => (
                            <li
                              key={entry.id}
                              className="flex items-center justify-between gap-2 text-xs th-text-tertiary"
                            >
                              <span>
                                {new Date(entry.created_at).toLocaleString("vi-VN", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className="tabular-nums">
                                {entry.format.toUpperCase()} · {entry.width}×{entry.height}
                                {entry.file_size_bytes
                                  ? ` · ${(entry.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
          title="Xoá đầu ra?"
          message="Đầu ra này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          confirmText="Xoá đầu ra"
          variant="danger"
        />
      </main>
    </div>
  );
}
