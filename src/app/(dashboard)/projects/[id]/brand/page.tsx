"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { notFound, useParams } from "next/navigation";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { PageContainer, Skeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { ControlRow, Slider } from "@/components/editor/control-primitives";
import WatermarkAi from "@/components/brand/watermark-ai";
import WatermarkGrid from "@/components/editor/watermark-grid";
import { useProject } from "@/lib/use-store";
import {
  PROFILE_FIELD_LABEL,
  PROFILE_FIELD_LIMIT,
  PROFILE_FIELD_PLACEHOLDER,
} from "@/lib/short-film/channel-profile-fields";
import { FORMAT_DIMENSIONS, type MemeFormat, type WatermarkPosition } from "@/types/database";
import ChannelSettingsHeader from "@/components/layout/channel-settings-tabs";

const FORMAT_LABELS: Record<MemeFormat, string> = {
  "1:1": "Bài đăng vuông",
  "4:5": "Bài đăng dọc",
  "9:16": "Story / Reels",
  "16:9": "Ảnh ngang",
};

const cardTitle = "text-sm font-semibold th-text-primary";

export default function BrandSettingsPage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { project, loading, update } = useProject(projectRef);

  const [handle, setHandle] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [position, setPosition] = useState<WatermarkPosition>("bottom-right");
  const [opacity, setOpacity] = useState(0.8);
  const [defaultFormat, setDefaultFormat] = useState<MemeFormat>("1:1");
  // Ba ý của hồ sơ kênh: cùng các cột mà bước tạo kênh ghi và phim, meme đọc.
  // Sửa ở đây là phim mới cũng đổi theo (xem migration one_channel_profile).
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const [positioning, setPositioning] = useState("");
  const [contentGuidelines, setContentGuidelines] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setHandle(project.creator_handle ?? "");
    setLogoUrl(project.watermark_url);
    setPosition(project.watermark_position ?? "bottom-right");
    setOpacity(typeof project.watermark_opacity === "number" ? project.watermark_opacity : 0.8);
    setDefaultFormat(project.default_format ?? "1:1");
    setTone(project.brand_voice ?? "");
    setAudience(project.audience ?? "");
    setPositioning(project.description ?? "");
    setContentGuidelines(project.content_guidelines ?? "");
  }, [project]);

  if (!loading && !project) notFound();

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      if (!project) throw new Error("Kênh chưa tải xong. Chờ một chút nhé.");
      if (!["image/png", "image/webp"].includes(file.type))
        throw new Error("Chọn ảnh PNG hoặc WebP có nền trong suốt nhé. Không nhận JPG hoặc SVG.");
      if (file.size > 3 * 1024 * 1024) throw new Error("Logo tối đa 3 MB.");
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceVersion", String(project.workspace_version ?? 1));
      const response = await fetch(`/api/projects/${project.id}/watermark`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chưa thêm được logo. Bạn thử lại nhé.");
      setLogoUrl(result.url);
      toast.success("Đã thêm logo, nhớ bấm Lưu nhé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chưa thêm được logo. Bạn thử lại nhé.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await update({
        creator_handle: handle.trim() || null,
        watermark_url: logoUrl,
        watermark_position: position,
        watermark_opacity: opacity,
        default_format: defaultFormat,
        brand_voice: tone.trim() || null,
        audience: audience.trim() || null,
        description: positioning.trim() || null,
        content_guidelines: contentGuidelines.trim() || null,
      });
      toast.success("Đã lưu");
    } catch {
      toast.error("Chưa lưu được. Bạn thử lại nhé.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer width="form">
      <ChannelSettingsHeader description="Hồ sơ để bài mới đúng chất kênh, và logo đóng lên bài." />

      {loading ? (
        <div role="status" aria-label="Đang tải" className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <span className={cardTitle}>Hồ sơ kênh</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                id="profile-audience"
                label={PROFILE_FIELD_LABEL.audience}
                value={audience}
                maxLength={PROFILE_FIELD_LIMIT.audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder={PROFILE_FIELD_PLACEHOLDER.audience}
                rows={2}
              />
              <Textarea
                id="profile-tone"
                label={PROFILE_FIELD_LABEL.tone}
                value={tone}
                maxLength={PROFILE_FIELD_LIMIT.tone}
                onChange={(event) => setTone(event.target.value)}
                placeholder={PROFILE_FIELD_PLACEHOLDER.tone}
                rows={2}
              />
              <Textarea
                id="profile-positioning"
                label={PROFILE_FIELD_LABEL.positioning}
                value={positioning}
                maxLength={PROFILE_FIELD_LIMIT.positioning}
                onChange={(event) => setPositioning(event.target.value)}
                placeholder={PROFILE_FIELD_PLACEHOLDER.positioning}
                rows={3}
              />
              <Textarea
                id="profile-avoid"
                label="Điều nên tránh"
                value={contentGuidelines}
                onChange={(event) => setContentGuidelines(event.target.value)}
                placeholder="Ví dụ: không hứa quá đà; cuối bài rủ người xem bình luận"
                rows={3}
              />
              <p className="text-xs th-text-tertiary">Meme và phim làm sau sẽ theo phần này. Bài đã làm giữ nguyên.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className={cardTitle}>Logo</span>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadLogo(file);
                  event.target.value = "";
                }}
              />

              {logoUrl ? (
                <div className="flex items-center gap-3 rounded-xl border th-border-secondary p-3">
                  <div className="relative h-16 w-36 shrink-0 rounded-xl th-bg-tertiary">
                    <Image src={logoUrl} alt="Logo" fill className="object-contain" unoptimized />
                  </div>
                  <span className="flex-1 truncate text-xs th-text-tertiary">Logo đang dùng</span>
                  <Button size="sm" variant="ghost" aria-label="Bỏ logo" onClick={() => setLogoUrl(null)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed th-border-secondary p-5 th-text-tertiary th-bg-hover"
                >
                  <ImagePlus size={20} />
                  <span className="text-xs">{uploading ? "Đang thêm…" : "Thêm logo nền trong suốt (PNG, WebP)"}</span>
                </button>
              )}

              {logoUrl && (
                <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={14} /> Đổi logo
                </Button>
              )}
              <p className="text-xs th-text-tertiary">
                Ảnh PNG hoặc WebP nền trong suốt, tối đa 3 MB. Logo có nền trắng sẽ không dùng được.
              </p>
              {project && (
                <WatermarkAi
                  key={`${project.id}:${project.workspace_version}`}
                  projectId={project.id}
                  ownerId={project.user_id}
                  workspaceVersion={project.workspace_version ?? 1}
                  projectName={project.name}
                  onApply={setLogoUrl}
                />
              )}
              <div aria-label="Xem trước logo trên video" className="relative aspect-video overflow-hidden rounded-xl th-bg-tertiary">
                <span className="absolute left-3 top-3 text-xs th-text-tertiary">Xem trước 16:9</span>
                {logoUrl && (
                  <div
                    className="absolute"
                    style={{
                      width: "24%",
                      height: "16%",
                      opacity,
                      left: position.includes("left") ? "2%" : !position.includes("right") ? "50%" : undefined,
                      right: position.includes("right") ? "2%" : undefined,
                      top: position.includes("top") ? "3%" : !position.includes("bottom") ? "50%" : undefined,
                      bottom: position.includes("bottom") ? "3%" : undefined,
                      transform: `translate(${!position.includes("left") && !position.includes("right") ? "-50%" : "0"}, ${!position.includes("top") && !position.includes("bottom") ? "-50%" : "0"})`,
                    }}
                  >
                    <Image src={logoUrl} alt="Logo xem trước" width={400} height={200} className="h-full w-full object-contain" unoptimized />
                  </div>
                )}
              </div>
              <ControlRow label="Vị trí">
                <WatermarkGrid value={position} onChange={setPosition} />
              </ControlRow>

              <ControlRow label="Độ mờ" value={`${Math.round(opacity * 100)}%`}>
                <Slider
                  ariaLabel="Độ mờ của logo"
                  min={10}
                  max={100}
                  value={opacity * 100}
                  onChange={(value) => setOpacity(value / 100)}
                />
              </ControlRow>

              <p className="text-xs th-text-tertiary">Lưu xong, bài làm sau sẽ dùng logo mới. Bài cũ giữ nguyên.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className={cardTitle}>Chữ ký kênh</span>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                aria-label="Chữ ký kênh"
                value={handle}
                maxLength={40}
                placeholder="Ví dụ: @toilanguoisaigon"
                onChange={(event) => setHandle(event.target.value)}
              />
              <p className="text-xs th-text-tertiary">Chưa có logo thì đóng chữ này lên ảnh.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className={cardTitle}>Khổ ảnh mặc định</span>
            </CardHeader>
            <CardContent className="space-y-2">
              <div role="radiogroup" aria-label="Khổ ảnh mặc định" className="space-y-2">
              {(Object.keys(FORMAT_DIMENSIONS) as MemeFormat[]).map((format) => {
                const dimensions = FORMAT_DIMENSIONS[format];
                const active = defaultFormat === format;
                return (
                  <button
                    key={format}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDefaultFormat(format)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                      active ? "th-border-accent th-bg-accent-light" : "th-border-secondary th-bg-hover"
                    }`}
                  >
                    <span className="th-text-primary">{FORMAT_LABELS[format]}</span>
                    <span className="flex items-center gap-2 text-xs th-text-tertiary">
                      {dimensions.width}×{dimensions.height}
                      {active && <Check size={14} className="th-text-accent" />}
                    </span>
                  </button>
                );
              })}
              </div>
            </CardContent>
          </Card>

          <Button onClick={save} loading={saving} disabled={uploading || !project}>
            Lưu
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
