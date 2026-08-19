"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Crop, ImagePlus, Trash2, Type, Upload } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent } from "@/components/ui/card";
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
    <div className="flex">
      <Sidebar projectId={projectRef} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Mẫu meme</h1>
            <p className="th-text-tertiary mt-1">
              Ảnh dùng để ghép chữ. Tải ảnh của bạn lên là dùng được ngay, không cần tạo mascot.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <ImagePlus size={16} />
            Thêm mẫu
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS_LABELS) as BaseImageStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full border px-3 py-1 text-xs ${
                statusFilter === status
                  ? "border-blue-600 text-blue-600 bg-blue-600/10"
                  : "th-border-secondary th-text-tertiary"
              }`}
            >
              {STATUS_LABELS[status]} ({counts[status]})
            </button>
          ))}

          <select
            aria-label="Lọc theo khổ ảnh"
            value={ratioFilter}
            onChange={(event) => setRatioFilter(event.target.value as MemeFormat | "all")}
            className="ml-auto rounded-xl border th-border-secondary th-bg-tertiary px-3 py-1.5 text-xs th-text-primary"
          >
            <option value="all">Mọi khổ ảnh</option>
            {["1:1", "4:5", "9:16", "16:9"].map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo biểu cảm"
            value={expressionFilter}
            onChange={(event) => setExpressionFilter(event.target.value)}
            className="rounded-xl border th-border-secondary th-bg-tertiary px-3 py-1.5 text-xs th-text-primary"
          >
            <option value="all">Mọi biểu cảm</option>
            {usedExpressions.map((slug) => (
              <option key={slug} value={slug}>
                {labelBySlug.get(slug) ?? slug}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="th-text-tertiary">Đang tải…</p>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-12 text-center">
              <p className="th-text-tertiary">
                {statusFilter === "ready"
                  ? "Chưa có mẫu nào dùng được. Tải ảnh lên và khoanh vùng chữ là xong."
                  : "Không có mẫu nào ở trạng thái này."}
              </p>
              {statusFilter === "ready" && (
                <Button variant="outline" onClick={() => setUploadOpen(true)}>
                  <Upload size={15} /> Thêm mẫu đầu tiên
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((image) => (
              <Card key={image.id} className="flex flex-col">
                <div className="relative aspect-square overflow-hidden rounded-t-2xl th-bg-tertiary">
                  <Image
                    src={image.image_url}
                    alt={image.title ?? image.expression_slug}
                    fill
                    sizes="200px"
                    className="object-cover"
                    unoptimized
                  />
                  {image.status !== "ready" && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {STATUS_LABELS[image.status]}
                    </span>
                  )}
                </div>
                <CardContent className="flex flex-1 flex-col gap-1.5 py-2">
                  <p className="truncate text-xs font-medium th-text-primary">
                    {image.title || labelBySlug.get(image.expression_slug) || image.expression_slug}
                  </p>
                  <p className="truncate text-[10px] th-text-tertiary">
                    {image.aspect_ratio} · {layoutLabel(image.layout_preset_id)}
                    {image.character_name !== "Không gắn mascot" ? ` · ${image.character_name}` : ""}
                  </p>
                  <div className="mt-auto flex gap-1 pt-1">
                    {image.status === "ready" ? (
                      <Link href={`/projects/${projectRef}/editor?base=${image.id}`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full">
                          <Type size={12} /> Ghép chữ
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setZoneTarget(image.id)}
                      >
                        <Crop size={12} /> Khoanh chữ
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Chỉnh vùng chữ"
                      onClick={() => setZoneTarget(image.id)}
                    >
                      <Crop size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Xoá mẫu"
                      onClick={() => setDeleteTarget(image.id)}
                    >
                      <Trash2 size={12} />
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
              toast.error(error instanceof Error ? error.message : "Xoá thất bại");
            }
            setDeleteTarget(null);
          }}
          title="Xoá mẫu meme?"
          message="Mẫu này sẽ bị xoá khỏi thư viện. Meme đã tạo từ nó vẫn giữ nguyên."
          confirmText="Xoá mẫu"
          variant="danger"
        />
      </main>
    </div>
  );
}
