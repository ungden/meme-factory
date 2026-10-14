"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Crop, ImagePlus, Trash2, Type, Upload } from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/button";
import Card, { CardContent } from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import Select from "@/components/ui/select";
import EmptyState from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/page";
import { PageContainer } from "@/components/ui/page";
import MemeAreaHeader from "@/components/meme/meme-area-header";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import SafeZoneEditor from "@/components/templates/safe-zone-editor";
import TemplateUploadDialog from "@/components/templates/template-upload-dialog";
import { layoutLabel } from "@/lib/meme-layout-presets";
import { useBaseImages, useExpressionTags } from "@/lib/use-templates";
import { useProject } from "@/lib/use-store";
import type { BaseImageStatus, MemeFormat } from "@/types/database";

const STATUS_LABELS: Record<BaseImageStatus, string> = {
  ready: "Dùng được",
  draft: "Nháp",
  archived: "Đã ẩn",
};

export default function MemeTemplatesPage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;
  const toast = useToast();

  const { project } = useProject(projectRef);
  const { baseImages, loading, reload, updateBaseImage, deleteBaseImage } = useBaseImages(projectRef, "all");
  const expressionTags = useExpressionTags();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [zoneTarget, setZoneTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BaseImageStatus>("ready");
  const [ratioFilter, setRatioFilter] = useState<MemeFormat | "all">("all");
  const [expressionFilter, setExpressionFilter] = useState<string | "all">("all");

  const labelBySlug = useMemo(
    () => new Map(expressionTags.map((tag) => [tag.slug, tag.label_vi])),
    [expressionTags]
  );

  const counts = useMemo(() => {
    const map: Record<BaseImageStatus, number> = { ready: 0, draft: 0, archived: 0 };
    for (const image of baseImages) map[image.status] += 1;
    return map;
  }, [baseImages]);

  const visible = baseImages.filter((image) => {
    if (image.status !== statusFilter) return false;
    if (ratioFilter !== "all" && image.aspect_ratio !== ratioFilter) return false;
    if (expressionFilter !== "all" && image.expression_slug !== expressionFilter) return false;
    return true;
  });

  const usedExpressions = useMemo(
    () => [...new Set(baseImages.map((image) => image.expression_slug))],
    [baseImages]
  );

  return (
    <PageContainer>
      <MemeAreaHeader
        projectRef={projectRef}
        mode="templates"
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <ImagePlus size={16} aria-hidden />
            Thêm mẫu
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div role="radiogroup" aria-label="Trạng thái" className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_LABELS) as BaseImageStatus[]).map((status) => (
            <Chip key={status} role="radio" selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {STATUS_LABELS[status]} ({counts[status]})
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:w-80">
          <Select
            aria-label="Lọc theo khổ ảnh"
            value={ratioFilter}
            onChange={(event) => setRatioFilter(event.target.value as MemeFormat | "all")}
            className="py-2 text-sm"
          >
            <option value="all">Mọi khổ ảnh</option>
            {["1:1", "4:5", "9:16", "16:9"].map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Lọc theo biểu cảm"
            value={expressionFilter}
            onChange={(event) => setExpressionFilter(event.target.value)}
            className="py-2 text-sm"
          >
            <option value="all">Mọi biểu cảm</option>
            {usedExpressions.map((slug) => (
              <option key={slug} value={slug}>
                {labelBySlug.get(slug) ?? slug}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div role="status" aria-label="Đang tải" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          title={statusFilter === "ready" ? "Chưa có mẫu nào dùng được" : "Không có mẫu nào ở trạng thái này"}
          hint={statusFilter === "ready" ? "Thêm ảnh rồi khoanh vùng chữ là xong. Hoặc vẽ bộ biểu cảm ở trang Nhân vật." : undefined}
          action={
            statusFilter === "ready" ? (
              <Button variant="outline" onClick={() => setUploadOpen(true)}>
                <Upload size={16} aria-hidden /> Thêm mẫu đầu tiên
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((image) => (
            <Card key={image.id} className="flex flex-col overflow-hidden">
              <div className="relative aspect-square th-bg-tertiary">
                <Image
                  src={image.image_url}
                  alt={image.title ?? image.expression_slug}
                  fill
                  sizes="200px"
                  className="object-cover"
                  unoptimized
                />
                {image.status !== "ready" && (
                  <span className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-xs th-bg-card th-text-secondary">
                    {STATUS_LABELS[image.status]}
                  </span>
                )}
              </div>
              <CardContent className="flex flex-1 flex-col gap-1 p-2.5">
                <p className="truncate text-xs font-medium th-text-primary">
                  {image.title || labelBySlug.get(image.expression_slug) || image.expression_slug}
                </p>
                <p className="truncate text-xs th-text-tertiary">
                  {image.aspect_ratio} · {layoutLabel(image.layout_preset_id)}
                  {image.character_id && image.character_name ? ` · ${image.character_name}` : ""}
                </p>
                <div className="mt-auto flex gap-1 pt-1">
                  {image.status === "ready" ? (
                    <Link
                      href={`/projects/${projectRef}/editor?base=${image.id}`}
                      className={buttonClasses("outline", "sm", "flex-1 px-2")}
                    >
                      <Type size={14} aria-hidden /> Ghép chữ
                    </Link>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1 px-2" onClick={() => setZoneTarget(image.id)}>
                      <Crop size={14} aria-hidden /> Khoanh chữ
                    </Button>
                  )}
                  {image.status === "ready" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2"
                      aria-label="Chỉnh vùng chữ"
                      title="Chỉnh vùng chữ"
                      onClick={() => setZoneTarget(image.id)}
                    >
                      <Crop size={14} aria-hidden />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="Xoá mẫu"
                    title="Xoá mẫu"
                    onClick={() => setDeleteTarget(image.id)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

        {project && (
          <TemplateUploadDialog
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            projectId={project.id}
            expressionTags={expressionTags}
            onSaved={reload}
          />
        )}

        <SafeZoneEditor
          open={Boolean(zoneTarget)}
          onClose={() => setZoneTarget(null)}
          baseImage={baseImages.find((image) => image.id === zoneTarget) ?? null}
          onSave={async (safeZones) => {
            if (!zoneTarget) return;
            const target = baseImages.find((image) => image.id === zoneTarget);
            await updateBaseImage(zoneTarget, {
              safe_zones: safeZones as unknown as Record<string, unknown>,
              safe_zones_source: "authored",
              safe_zones_updated_at: new Date().toISOString(),
              // Drawing the caption area is exactly what makes a template usable.
              ...(target && target.status === "draft" && target.width && target.height
                ? { status: "ready" as const }
                : {}),
            });
          }}
        />

        <ConfirmModal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (!deleteTarget) return;
            try {
              await deleteBaseImage(deleteTarget);
              toast.success("Đã xoá mẫu");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Chưa xoá được. Bạn thử lại nhé.");
            }
            setDeleteTarget(null);
          }}
          title="Xoá mẫu meme?"
          message="Mẫu này sẽ mất hẳn, không lấy lại được. Meme đã làm từ nó vẫn giữ nguyên."
          confirmText="Xoá mẫu"
          variant="danger"
        />
    </PageContainer>
  );
}
