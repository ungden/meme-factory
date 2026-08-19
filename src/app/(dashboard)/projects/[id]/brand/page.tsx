"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Check, Trash2, Upload } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Input from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ControlRow, SegmentedControl, Slider } from "@/components/editor/control-primitives";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/lib/use-store";
import { FORMAT_DIMENSIONS, type MemeFormat, type WatermarkPosition } from "@/types/database";

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "↖" },
  { value: "center", label: "•" },
  { value: "top-right", label: "↗" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-right", label: "↘" },
];

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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setHandle(project.creator_handle ?? "");
    setWatermarkUrl(project.watermark_url);
    setPosition(project.watermark_position ?? "bottom-right");
    setOpacity(typeof project.watermark_opacity === "number" ? project.watermark_opacity : 0.8);
    setDefaultFormat(project.default_format ?? "1:1");
  }, [project]);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Phiên đăng nhập đã hết hạn");

      // First path segment is the user id so the bucket's delete policy matches.
      const extension = file.name.split(".").pop() || "png";
      const path = `${userData.user.id}/${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("watermarks").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from("watermarks").getPublicUrl(path);
      setWatermarkUrl(data.publicUrl);
      toast.success("Đã tải logo lên, nhớ bấm Lưu");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tải logo thất bại");
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
      });
      toast.success("Đã lưu cài đặt thương hiệu");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex">
      <Sidebar projectId={projectRef} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold th-text-primary">Thương hiệu</h1>
          <p className="th-text-tertiary mt-1">
            Watermark và khổ ảnh mặc định cho mọi meme mới của dự án này.
          </p>
        </div>

        {loading ? (
          <p className="th-text-tertiary">Đang tải…</p>
        ) : (
          <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <span className="text-sm font-semibold th-text-primary">Watermark mặc định</span>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadLogo(file);
                    event.target.value = "";
                  }}
                />

                {watermarkUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border th-border-secondary p-3">
                    <div className="relative h-12 w-12 shrink-0 th-bg-tertiary">
                      <Image src={watermarkUrl} alt="Watermark" fill className="object-contain" unoptimized />
                    </div>
                    <span className="flex-1 truncate text-xs th-text-tertiary">Logo đã lưu</span>
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
                    <span className="text-xs">{uploading ? "Đang tải…" : "Tải logo PNG / JPG / SVG"}</span>
                  </button>
                )}

                <ControlRow label="Vị trí">
                  <SegmentedControl
                    ariaLabel="Vị trí watermark"
                    value={position}
                    onChange={setPosition}
                    options={POSITIONS.map((entry) => ({ value: entry.value, label: entry.label, title: entry.value }))}
                  />
                </ControlRow>

                <ControlRow label="Độ mờ" value={`${Math.round(opacity * 100)}%`}>
                  <Slider
                    ariaLabel="Độ mờ watermark"
                    min={10}
                    max={100}
                    value={opacity * 100}
                    onChange={(value) => setOpacity(value / 100)}
                  />
                </ControlRow>

                <p className="text-xs th-text-tertiary">
                  Không có logo thì editor dùng handle bên cạnh làm watermark chữ.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <span className="text-sm font-semibold th-text-primary">Handle nhà sáng tạo</span>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    value={handle}
                    maxLength={40}
                    placeholder="@toilanguoisaigon"
                    onChange={(event) => setHandle(event.target.value)}
                  />
                  <p className="text-xs th-text-tertiary">
                    Dùng làm watermark chữ mặc định khi dự án chưa có logo.
                  </p>
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
                          active ? "border-blue-600 bg-blue-600/10" : "th-border-secondary"
                        }`}
                      >
                        <span className="th-text-primary">{FORMAT_LABELS[format]}</span>
                        <span className="flex items-center gap-2 text-xs th-text-tertiary">
                          {dimensions.width}×{dimensions.height}
                          {active && <Check size={14} className="text-blue-600" />}
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
          <Button onClick={save} loading={saving} disabled={loading}>
            Lưu cài đặt
          </Button>
        </div>
      </main>
    </div>
  );
}
