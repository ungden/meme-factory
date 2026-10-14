"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Check, Trash2, Upload } from "lucide-react";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ControlRow, Slider } from "@/components/editor/control-primitives";
import WatermarkAi from "@/components/brand/watermark-ai";
import WatermarkGrid from "@/components/editor/watermark-grid";
import { useProject } from "@/lib/use-store";
import { FORMAT_DIMENSIONS, type MemeFormat, type WatermarkPosition } from "@/types/database";
import ChannelSettingsHeader from "@/components/layout/channel-settings-tabs";

const FORMAT_LABELS: Record<MemeFormat, string> = {
  "1:1": "Bài đăng vuông",
  "4:5": "Bài đăng dọc",
  "9:16": "Story / Reels",
  "16:9": "Ảnh ngang",
};

export default function BrandSettingsPage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { project, loading, update } = useProject(projectRef);

  const [handle, setHandle] = useState("");
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [position, setPosition] = useState<WatermarkPosition>("bottom-right");
  const [opacity, setOpacity] = useState(0.8);
  const [defaultFormat, setDefaultFormat] = useState<MemeFormat>("1:1");
  const [brandVoice, setBrandVoice] = useState("");
  const [audience, setAudience] = useState("");
  const [contentGuidelines, setContentGuidelines] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setHandle(project.creator_handle ?? "");
    setWatermarkUrl(project.watermark_url);
    setPosition(project.watermark_position ?? "bottom-right");
    setOpacity(typeof project.watermark_opacity === "number" ? project.watermark_opacity : 0.8);
    setDefaultFormat(project.default_format ?? "1:1");
    setBrandVoice(project.brand_voice ?? "");
    setAudience(project.audience ?? "");
    setContentGuidelines(project.content_guidelines ?? "");
  }, [project]);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      if (!project) throw new Error("Kênh chưa tải xong");
      if (!["image/png", "image/webp"].includes(file.type))
        throw new Error("Chọn PNG hoặc WebP có nền trong suốt. Không nhận JPG hoặc SVG.");
      if (file.size > 3 * 1024 * 1024) throw new Error("Logo tối đa 3 MB.");
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceVersion", String(project.workspace_version ?? 1));
      const response = await fetch(`/api/projects/${project.id}/watermark`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chưa tải được logo");
      setWatermarkUrl(result.url);
      toast.success("Đã tải logo lên, nhớ bấm Lưu");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chưa tải được logo. Bạn thử lại nhé.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await update({
        creator_handle: handle.trim() || null,
        watermark_url: watermarkUrl,
        watermark_position: position,
        watermark_opacity: opacity,
        default_format: defaultFormat,
        brand_voice: brandVoice.trim() || null,
        audience: audience.trim() || null,
        content_guidelines: contentGuidelines.trim() || null,
      });
      toast.success("Đã lưu");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chưa lưu được. Bạn thử lại nhé.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex">
      <main className="min-w-0 flex-1 p-4 pt-16 md:p-8">
        <ChannelSettingsHeader description="Logo đóng lên bài và hồ sơ để bài mới đúng chất kênh." />

        {loading ? (
          <p className="th-text-tertiary">Đang tải…</p>
        ) : (
          <div className="grid min-w-0 max-w-4xl grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <span className="text-sm font-semibold th-text-primary">Logo của kênh</span>
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

                {watermarkUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border th-border-secondary p-3">
                    <div className="relative h-16 w-36 shrink-0 rounded-lg bg-slate-700">
                      <Image src={watermarkUrl} alt="Logo" fill className="object-contain" unoptimized />
                    </div>
                    <span className="flex-1 truncate text-xs th-text-tertiary">Logo đang dùng</span>
                    <Button size="sm" variant="ghost" aria-label="Bỏ logo" onClick={() => setWatermarkUrl(null)}>
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
                    <Upload size={18} />
                    <span className="text-xs">{uploading ? "Đang tải…" : "Tải logo nền trong suốt (PNG, WebP)"}</span>
                  </button>
                )}

                {watermarkUrl && (
                  <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
                    <Upload size={14} /> Đổi logo
                  </Button>
                )}
                <p className="text-xs th-text-tertiary">
                  Ảnh PNG hoặc WebP nền trong suốt, tối đa 3 MB. Logo có nền trắng sẽ không dùng được.
                </p>
                {project && <WatermarkAi key={`${project.id}:${project.workspace_version}`} projectId={project.id} ownerId={project.user_id} workspaceVersion={project.workspace_version ?? 1} projectName={project.name} onApply={setWatermarkUrl} />}
                <div aria-label="Xem trước logo trên video" className="relative aspect-video overflow-hidden rounded-lg bg-slate-800">
                  <span className="absolute left-3 top-3 text-xs text-slate-300">Xem trước 16:9</span>
                  {watermarkUrl && <div className="absolute" style={{
                    width: "24%", height: "16%", opacity,
                    left: position.includes("left") ? "2%" : !position.includes("right") ? "50%" : undefined,
                    right: position.includes("right") ? "2%" : undefined,
                    top: position.includes("top") ? "3%" : !position.includes("bottom") ? "50%" : undefined,
                    bottom: position.includes("bottom") ? "3%" : undefined,
                    transform: `translate(${!position.includes("left") && !position.includes("right") ? "-50%" : "0"}, ${!position.includes("top") && !position.includes("bottom") ? "-50%" : "0"})`,
                  }}><Image src={watermarkUrl} alt="Logo xem trước" width={400} height={200} className="h-full w-full object-contain" unoptimized /></div>}
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

                <p className="text-xs th-text-tertiary">
                  Lưu xong, bài làm sau sẽ dùng logo mới. Bài cũ giữ nguyên.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <span className="text-sm font-semibold th-text-primary">Chữ ký kênh (ví dụ @tenkenh)</span>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    value={handle}
                    maxLength={40}
                    placeholder="@toilanguoisaigon"
                    onChange={(event) => setHandle(event.target.value)}
                  />
                  <p className="text-xs th-text-tertiary">
                    Chưa có logo thì đóng chữ này lên ảnh.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><span className="text-sm font-semibold th-text-primary">Hồ sơ kênh</span></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea label="Giọng kể" value={brandVoice} onChange={(event) => setBrandVoice(event.target.value)} placeholder="Ví dụ: gần gũi, vui nhưng không sáo rỗng" rows={2} />
                  <Textarea label="Người xem" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ví dụ: dân văn phòng 25–35 tuổi tại Hà Nội" rows={2} />
                  <Textarea label="Điều nên tránh" value={contentGuidelines} onChange={(event) => setContentGuidelines(event.target.value)} placeholder="Ví dụ: không hứa quá đà; cuối bài rủ người xem bình luận" rows={3} />
                  <p className="text-xs th-text-tertiary">Bài mới của kênh sẽ theo phần này.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <span className="text-sm font-semibold th-text-primary">Khổ ảnh mặc định</span>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(Object.keys(FORMAT_DIMENSIONS) as MemeFormat[]).map((format) => {
                    const dimensions = FORMAT_DIMENSIONS[format];
                    const active = defaultFormat === format;
                    return (
                      <button
                        key={format}
                        type="button"
                        onClick={() => setDefaultFormat(format)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                          active ? "th-border-accent th-bg-accent-light" : "th-border-secondary"
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
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="mt-5 max-w-4xl">
          <Button onClick={save} loading={saving} disabled={loading || uploading || !project}>
            Lưu
          </Button>
        </div>
      </main>
    </div>
  );
}
