"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";
import SharePost from "@/components/content/share-post";
import PromptModal from "@/components/ui/prompt-modal";
import { suggestHashtags } from "@/lib/post-text";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useProject, useMemes } from "@/lib/use-store";
import Button, { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/card";
import EmptyState from "@/components/ui/empty-state";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import Select from "@/components/ui/select";
import { PageContainer, PageHeader, Skeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/format";
import { recordMemeExport, useMemeCollections, useMemeExports } from "@/lib/use-templates";
import {
  Download,
  Trash2,
  Image as ImageIcon,
  Calendar,
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
  SearchX,
} from "lucide-react";
import { FORMAT_DIMENSIONS, type ContentOutput, type Meme, type MemeContent, type MemeFormat } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

/**
 * `?item=<id>` mở thẳng một bài: id của meme thì mở khung chi tiết, id của
 * video thì cuộn tới thẻ video đó. Thẻ ở trang chính dẫn về đây.
 */
const GALLERY_ITEM_PARAM = "item";

/** Trạng thái video hiển thị cho người dùng; không rơi về mã thô. */
const VIDEO_STATUS_LABELS: Record<string, string> = {
  draft: "Bản nháp",
  queued: "Đang chờ",
  running: "Đang làm",
  failed: "Chưa làm được",
};

const FINISHED_VIDEO = ["completed", "approved", "rejected"];

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const toast = useToast();

  const { project } = useProject(projectId);
  // Hashtag gợi ý theo tên fanpage — người dùng vẫn sửa được sau khi dán.
  const postHashtags = suggestHashtags(project?.name);
  const { memes, loading, hasMore, loadingMore, loadMore, remove, reload } = useMemes(projectId);
  const [selectedMeme, setSelectedMeme] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);

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
  const [contentOutputs, setContentOutputs] = useState<ContentOutput[]>([]);
  const [outputsLoaded, setOutputsLoaded] = useState(false);

  // Bài được mở qua link: meme cũ có thể nằm ngoài trang đầu của danh sách.
  const linkedItem = searchParams.get(GALLERY_ITEM_PARAM);
  const [linkedMeme, setLinkedMeme] = useState<Meme | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const handledMemeLink = useRef<string | null>(null);
  const handledVideoLink = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/content-sets?project=${encodeURIComponent(projectId)}`)
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active) return;
        const outputs = (payload?.contentSets ?? []).flatMap((set: { content_outputs?: ContentOutput[] }) => set.content_outputs ?? []);
        setContentOutputs(outputs);
      })
      .catch(() => { if (active) setContentOutputs([]); })
      .finally(() => { if (active) setOutputsLoaded(true); });
    return () => { active = false; };
  }, [projectId]);

  // A video draft exists only to hold the reviewed script and its quote. The
  // library starts showing it once it has actually been submitted to a provider.
  const videoOutputs = contentOutputs.filter((output) => output.kind === "video" && output.status !== "draft");

  useEffect(() => {
    if (!linkedItem || loading || handledMemeLink.current === linkedItem) return;
    handledMemeLink.current = linkedItem;
    if (memes.some((meme) => meme.id === linkedItem)) {
      setSelectedMeme(linkedItem);
      return;
    }
    if (!project?.id) {
      handledMemeLink.current = null;
      return;
    }
    let active = true;
    createClient()
      .from("memes")
      .select("*")
      .eq("id", linkedItem)
      .eq("project_id", project.id)
      .maybeSingle()
      .then((result: { data: unknown }) => {
        const data = result.data as Meme | null;
        if (!active || !data) return;
        setLinkedMeme(data);
        setSelectedMeme(linkedItem);
      });
    return () => { active = false; };
  }, [linkedItem, loading, memes, project?.id]);

  useEffect(() => {
    if (!linkedItem || !outputsLoaded || handledVideoLink.current === linkedItem) return;
    handledVideoLink.current = linkedItem;
    if (!videoOutputs.some((output) => output.id === linkedItem)) return;
    setHighlighted(linkedItem);
    requestAnimationFrame(() => document.getElementById(`item-${linkedItem}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [linkedItem, outputsLoaded, videoOutputs]);

  const reviewOutput = useCallback(async (outputId: string, status: "approved" | "rejected") => {
    try {
      const response = await fetch(`/api/content-outputs/${outputId}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Chưa lưu được. Bạn thử lại nhé.");
      setContentOutputs((current) => current.map((output) => output.id === outputId ? payload.output : output));
      toast.success(status === "approved" ? "Đã duyệt" : "Đã đánh dấu cần sửa");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chưa lưu được. Bạn thử lại nhé.");
    }
  }, [toast]);

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

  const memesThisMonth = memes.filter((meme) => {
    const created = new Date(meme.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const composedCount = memes.filter((meme) => meme.composed_locally).length;
  const watermarkedCount = memes.filter((meme) => meme.has_watermark).length;
  const topCharacter = (() => {
    const counts = new Map<string, number>();
    for (const meme of memes) {
      const name = Array.isArray(meme.selected_characters) && meme.selected_characters[0]?.character_name;
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let best: { name: string; count: number } | null = null;
    for (const [name, count] of counts) {
      if (!best || count > best.count) best = { name, count };
    }
    return best;
  })();

  const selected = memes.find((m) => m.id === selectedMeme) ?? (linkedMeme && linkedMeme.id === selectedMeme ? linkedMeme : undefined);

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
    toast.success("Đã xoá");
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
    toast.success("Đang tải ảnh…");

    const meme = memes.find((entry) => entry.id === id) ?? (linkedMeme?.id === id ? linkedMeme : undefined);
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
  const handleDuplicate = async (source: Meme) => {
    if (!project?.id) return;

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
      toast.success("Đã sao chép thành bài mới");
      closeDetail();
      await reload();
    } catch {
      toast.error("Chưa sao chép được. Bạn thử lại nhé.");
    } finally {
      setDuplicating(false);
    }
  };

  const closeDetail = () => {
    setSelectedMeme(null);
    // Đóng khung chi tiết thì bỏ `?item=` để tải lại trang không mở lại nó.
    if (linkedItem) router.replace(`/projects/${projectId}/gallery`, { scroll: false });
  };

  const leaveTo = (href: string) => {
    setSelectedMeme(null);
    setDeleteTarget(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    requestAnimationFrame(() => router.push(href));
  };

  const goRegenerate = (memeId: string) =>
    leaveTo(`/projects/${projectId}/generate?fromMeme=${encodeURIComponent(memeId)}&mode=regenerate`);
  const goEditText = (memeId: string) => leaveTo(`/projects/${projectId}/editor?meme=${encodeURIComponent(memeId)}`);
  const goReuseIdea = (memeId: string) =>
    leaveTo(`/projects/${projectId}/generate?fromMeme=${encodeURIComponent(memeId)}&mode=reuse`);

  const handleBulkDownload = useCallback(async () => {
    if (selectedDownloadable.length === 0) {
      toast.error("Chưa chọn ảnh nào để tải");
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

      toast.success(`Đã tải ${selectedDownloadable.length} ảnh trong một tệp nén`);
      exitSelectionMode();
    } catch (err) {
      console.error("ZIP download failed:", err);
      toast.error("Chưa nén được ảnh. Bạn thử lại nhé.");
    }

    setIsZipping(false);
  }, [selectedDownloadable, memes, project, toast]);

  const countLine = `${visibleMemes.length} ảnh · ${videoOutputs.length} video${visibleMemes.length !== memes.length ? ` (lọc từ ${memes.length} ảnh)` : ""}`;

  return (
    <PageContainer width="work">
      <PageHeader
        title="Thư viện"
        description={loading ? "Meme, video, phim bạn làm đều nằm ở đây." : countLine}
        actions={
          !loading && memes.length > 0 && !selectionMode ? (
            <Button variant="outline" onClick={() => setSelectionMode(true)}>
              <CheckSquare size={16} />
              Chọn để tải
            </Button>
          ) : null
        }
      />

      {videoOutputs.length > 0 && (
        <section className="mb-6" aria-labelledby="videos-title">
          <h2 id="videos-title" className="mb-3 text-lg font-semibold th-text-primary">Video và phim</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videoOutputs.map((output) => (
              <VideoCard
                key={output.id}
                output={output}
                highlighted={highlighted === output.id}
                hashtags={postHashtags}
                onReview={reviewOutput}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && memes.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Tổng số ảnh" value={String(memes.length)} hint={`+${memesThisMonth} trong tháng này`} />
          <StatCard
            label="Ghép chữ"
            value={String(composedCount)}
            hint={`${Math.round((composedCount / memes.length) * 100)}% miễn phí`}
          />
          <StatCard
            label="Có logo"
            value={`${Math.round((watermarkedCount / memes.length) * 100)}%`}
            hint={`${watermarkedCount} / ${memes.length} ảnh`}
          />
          <StatCard
            label="Nhân vật dùng nhiều nhất"
            value={topCharacter?.name ?? "—"}
            hint={topCharacter ? `${topCharacter.count} meme` : "chưa có số liệu"}
          />
        </div>
      )}

      {!loading && memes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select
              aria-label="Lọc theo thời gian"
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value as typeof timeFilter)}
              className="py-1.5 text-sm"
            >
              <option value="all">Mọi thời điểm</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
            </Select>
          </div>
          <div className="w-36">
            <Select
              aria-label="Lọc theo khổ ảnh"
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value as typeof formatFilter)}
              className="py-1.5 text-sm"
            >
              <option value="all">Mọi khổ ảnh</option>
              {(Object.keys(FORMAT_DIMENSIONS) as MemeFormat[]).map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="py-1.5 text-sm"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="completed">Đã xong</option>
              <option value="draft">Nháp</option>
            </Select>
          </div>
          <span className="text-xs th-text-tertiary">
            {visibleMemes.length} / {memes.length} ảnh
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="space-y-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium th-text-tertiary">Album</span>
            <button
              type="button"
              aria-label="Tạo album"
              onClick={() => setNewCollectionOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-lg th-text-tertiary th-bg-hover hover:th-text-primary lg:h-8 lg:w-8"
            >
              <FolderPlus size={16} />
            </button>
          </div>
          <CollectionRow
            label="Tất cả"
            count={memes.length}
            active={activeCollection === null}
            onClick={() => setActiveCollection(null)}
          />
          {collections.map((collection) => (
            <CollectionRow
              key={collection.id}
              label={collection.name}
              count={collection.meme_count}
              active={activeCollection === collection.id}
              onClick={() => setActiveCollection(collection.id)}
            />
          ))}
        </aside>

        <div className="min-w-0 space-y-4">
          {selectionMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 th-border-accent th-bg-card">
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
                      Đang nén… ({zipProgress.done}/{zipProgress.total})
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Tải ảnh ({selectedDownloadable.length})
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={exitSelectionMode} aria-label="Thoát chọn">
                  <X size={14} />
                </Button>
              </div>
            </div>
          )}

          {isZipping && (
            <div className="h-1.5 w-full overflow-hidden rounded-full th-bg-tertiary" role="progressbar" aria-valuemin={0} aria-valuemax={zipProgress.total} aria-valuenow={zipProgress.done}>
              <div
                className="h-full rounded-full transition-all duration-300 th-bg-accent"
                style={{ width: `${zipProgress.total > 0 ? (zipProgress.done / zipProgress.total) * 100 : 0}%` }}
              />
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : memes.length === 0 ? (
            videoOutputs.length === 0 ? (
              <EmptyState
                icon={ImageIcon}
                title="Thư viện còn trống"
                hint="Meme, video, phim bạn làm sẽ nằm ở đây."
                action={
                  <Link href={`/projects/${projectId}`} className={buttonClasses("primary", "sm")}>
                    Làm bài đầu tiên
                  </Link>
                }
              />
            ) : (
              // Kênh chỉ có phim vẫn là kênh có bài; đừng nói "chưa có gì".
              <EmptyState icon={ImageIcon} title="Chưa có ảnh nào" hint="Video và phim của bạn nằm ở phần phía trên." />
            )
          ) : visibleMemes.length === 0 ? (
            <EmptyState icon={SearchX} title="Không có ảnh nào khớp bộ lọc" hint="Bỏ bớt bộ lọc hoặc chọn album khác nhé." />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
                    className={`group relative overflow-hidden ${selectionMode && isSelected ? "ring-2 th-ring-accent" : ""}`}
                  >
                    {selectionMode && (
                      <div className="absolute left-2 top-2 z-10">
                        {isSelected ? (
                          <div className="flex h-6 w-6 items-center justify-center rounded-md th-bg-accent th-text-on-primary">
                            <CheckCircle size={16} />
                          </div>
                        ) : (
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-md border-2 th-border th-bg-card ${hasImage ? "" : "cursor-not-allowed opacity-40"}`}
                            title={hasImage ? undefined : "Không có ảnh để tải"}
                          >
                            <Square size={12} className="th-text-muted" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative flex aspect-square items-center justify-center overflow-hidden th-bg-tertiary">
                      {meme.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={meme.image_url} alt={content?.headline || meme.original_idea} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="p-4 text-center">
                          <ImageIcon size={20} className="mx-auto mb-2 th-text-muted" />
                          <p className="line-clamp-3 text-xs th-text-tertiary">
                            {content?.headline || meme.original_idea}
                          </p>
                        </div>
                      )}
                      {!selectionMode && (
                        <div
                          // Chỉ hiện khi rê chuột nghĩa là thiết bị cảm ứng không
                          // bao giờ chạm tới được: người dùng điện thoại không tạo
                          // lại hay tải nổi một ảnh lẻ. Dưới lg thì luôn hiện, và
                          // focus bàn phím cũng mở được.
                          className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                        >
                          <OverlayButton label="Làm bản khác" onClick={() => goRegenerate(meme.id)}>
                            <Sparkles size={16} />
                          </OverlayButton>
                          <OverlayButton label="Ghép chữ (miễn phí)" onClick={() => goEditText(meme.id)}>
                            <Type size={16} />
                          </OverlayButton>
                          <OverlayButton label="Dùng lại ý tưởng" onClick={() => goReuseIdea(meme.id)}>
                            <Wand2 size={16} />
                          </OverlayButton>
                          <OverlayButton label="Tải ảnh" onClick={() => handleDownload(meme.image_url, meme.id)}>
                            <Download size={16} />
                          </OverlayButton>
                          <OverlayButton label="Xoá meme" danger onClick={() => setDeleteTarget(meme.id)}>
                            <Trash2 size={16} />
                          </OverlayButton>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-xs font-medium th-text-primary">
                        {content?.headline || meme.original_idea}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs th-text-muted">
                          <Calendar size={12} />
                          {formatDate(meme.created_at)}
                        </span>
                        <span className="rounded px-1.5 py-0.5 text-xs th-bg-tertiary th-text-tertiary">
                          {meme.format}
                        </span>
                        {meme.source_meme_id && (
                          <span className="rounded px-1.5 py-0.5 text-xs th-bg-accent-light th-text-accent">
                            Bản khác
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Cùng mẫu offset + "Xem thêm" mà màn phim ngắn đang dùng. */}
          {!loading && hasMore && visibleMemes.length > 0 && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" loading={loadingMore} onClick={loadMore}>
                Xem thêm ảnh cũ hơn
              </Button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!selected} onClose={closeDetail} title="Chi tiết meme" size="xl">
        {selected &&
          (() => {
            const content = selected.generated_content as MemeContent;
            return (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl th-bg-tertiary">
                  {selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.image_url} alt={content?.headline || selected.original_idea} className="h-auto w-full" />
                  ) : (
                    <div className="p-8 text-center">
                      <ImageIcon size={20} className="mx-auto mb-2 th-text-muted" />
                      <p className="text-sm th-text-tertiary">{content?.headline}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs th-text-muted">Ý tưởng</p>
                    <p className="mt-1 text-sm th-text-secondary">{selected.original_idea}</p>
                  </div>
                  {content?.headline && (
                    <div>
                      <p className="text-xs th-text-muted">Chữ trên ảnh</p>
                      <p className="mt-1 text-lg font-bold th-text-primary">{content.headline}</p>
                    </div>
                  )}
                  {content?.caption && (
                    <div>
                      <p className="text-xs th-text-muted">Nội dung bài đăng</p>
                      <p className="mt-1 text-sm th-text-secondary">{content.caption}</p>
                      {/* Sao chép cả nội dung bài đăng lẫn hashtag, đúng khối chữ
                          dán thẳng được vào Facebook. */}
                      <SharePost
                        className="mt-2"
                        caption={content.caption || ""}
                        hashtags={postHashtags}
                        label="Sao chép bài đăng"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs th-text-tertiary">
                    <Calendar size={12} />
                    {formatDateTime(selected.created_at)}
                    <span className="rounded px-1.5 py-0.5 th-bg-tertiary">{selected.format}</span>
                    {selected.source_meme_id && (
                      <span className="rounded px-1.5 py-0.5 th-bg-accent-light th-text-accent">Làm từ meme cũ</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" onClick={() => handleDownload(selected.image_url, selected.id)} disabled={!selected.image_url}>
                      <Download size={14} /> Tải ảnh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => goRegenerate(selected.id)}>
                      <Sparkles size={14} /> Làm bản khác
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => goEditText(selected.id)}>
                      <Type size={14} /> Ghép chữ
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => goReuseIdea(selected.id)}>
                      <Wand2 size={14} /> Dùng lại ý tưởng
                    </Button>
                    <Button variant="outline" size="sm" loading={duplicating} onClick={() => handleDuplicate(selected)}>
                      <CopyPlus size={14} /> Sao chép
                    </Button>
                    {collections.length > 0 && (
                      <div className="w-40">
                        <Select
                          aria-label="Thêm vào album"
                          defaultValue=""
                          className="py-1.5 text-sm"
                          onChange={async (event) => {
                            const collectionId = event.target.value;
                            event.target.value = "";
                            if (!collectionId) return;
                            const already = (membership[collectionId] ?? []).includes(selected.id);
                            try {
                              if (already) {
                                await removeMeme(collectionId, selected.id);
                                toast.success("Đã bỏ khỏi album");
                              } else {
                                await addMeme(collectionId, selected.id);
                                toast.success("Đã thêm vào album");
                              }
                            } catch {
                              toast.error("Chưa cập nhật được album. Bạn thử lại nhé.");
                            }
                          }}
                        >
                          <option value="">Album…</option>
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {(membership[collection.id] ?? []).includes(selected.id) ? "✓ " : ""}
                              {collection.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                    <Button variant="danger" size="sm" onClick={() => setDeleteTarget(selected.id)}>
                      <Trash2 size={14} /> Xoá
                    </Button>
                  </div>

                  {exportHistory.length > 0 && (
                    <div className="pt-2">
                      <p className="mb-1.5 text-xs th-text-muted">Lịch sử tải</p>
                      <ul className="space-y-1">
                        {exportHistory.slice(0, 6).map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-center justify-between gap-2 text-xs th-text-tertiary"
                          >
                            <span>{formatDateTime(entry.created_at)}</span>
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

      <PromptModal
        isOpen={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onSubmit={async (name) => {
          setNewCollectionOpen(false);
          try {
            await createCollection(name);
            toast.success("Đã tạo album");
          } catch {
            toast.error("Chưa tạo được album. Bạn thử lại nhé.");
          }
        }}
        title="Tạo album"
        label="Tên album"
        placeholder="Ví dụ: Bài đăng tháng 10"
        confirmText="Tạo"
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Xoá meme này?"
        message="Meme này sẽ mất hẳn, không lấy lại được."
        confirmText="Xoá"
        variant="danger"
      />
    </PageContainer>
  );
}

function VideoCard({
  output,
  highlighted,
  hashtags,
  onReview,
}: {
  output: ContentOutput;
  highlighted: boolean;
  hashtags: string[];
  onReview: (id: string, status: "approved" | "rejected") => void;
}) {
  const finished = FINISHED_VIDEO.includes(output.status);
  const ratio = ["16:9", "9:16", "1:1", "4:5"].includes(output.format) ? output.format.replace(":", "/") : "16/9";
  const statusLabel = finished
    ? output.status === "approved" ? "Đã duyệt" : output.status === "rejected" ? "Cần sửa" : "Xong"
    : VIDEO_STATUS_LABELS[output.status] || "Đang làm";
  return (
    <div id={`item-${output.id}`} className="scroll-mt-24">
      <Card className={`overflow-hidden p-0 ${highlighted ? "ring-2 th-ring-accent" : ""}`}>
        {finished ? (
          <video
            controls
            preload="none"
            poster={output.poster_url ? `/api/content-outputs/${output.id}/media?artifact=poster` : undefined}
            className="w-full bg-black object-contain"
            style={{ aspectRatio: ratio }}
            src={`/api/content-outputs/${output.id}/media`}
          />
        ) : (
          <div className="flex aspect-[9/16] items-center justify-center p-5 text-center text-sm th-text-tertiary">
            {output.status === "failed" ? "Video chưa làm được. Làm lại để xem giá mới." : "Đang làm video, lát quay lại nhé."}
          </div>
        )}
        <div className="p-3">
          <p className="line-clamp-2 text-sm th-text-secondary">{output.caption || output.script || "Video"}</p>
          <p className="mt-1 text-xs th-text-muted">
            {output.duration_seconds ? `${output.duration_seconds} giây · ` : ""}{statusLabel}
          </p>
          {finished && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a className={buttonClasses("outline", "sm")} href={`/api/content-outputs/${output.id}/media?download=1`}>
                <Download size={14} /> Tải video
              </a>
              <SharePost caption={output.caption || output.script || ""} hashtags={hashtags} />
              {output.status === "completed" && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onReview(output.id, "approved")}>Duyệt</Button>
                  <Button variant="ghost" size="sm" onClick={() => onReview(output.id, "rejected")}>Cần sửa</Button>
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function OverlayButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`rounded-xl p-2 transition-transform th-bg-card th-shadow-sm hover:scale-105 ${danger ? "th-text-danger" : "th-text-primary"}`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs th-text-tertiary">{label}</p>
      <p className="mt-0.5 truncate text-xl font-bold th-text-primary">{value}</p>
      <p className="truncate text-xs th-text-tertiary">{hint}</p>
    </Card>
  );
}

function CollectionRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors lg:min-h-8 ${
        active ? "th-bg-accent-light th-text-accent" : "th-text-secondary th-bg-hover"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums th-text-tertiary">{count}</span>
    </button>
  );
}
