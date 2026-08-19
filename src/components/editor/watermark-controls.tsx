"use client";

import { useRef } from "react";
import { Upload, X } from "lucide-react";
import type { WatermarkLayer } from "@/lib/meme-doc/types";
import { ControlRow, SegmentedControl, Slider, Toggle } from "./control-primitives";
import WatermarkGrid from "./watermark-grid";

interface WatermarkControlsProps {
  watermark: WatermarkLayer;
  projectWatermarkUrl: string | null;
  projectName: string;
  onChange: (patch: Partial<WatermarkLayer>) => void;
  onUpload: (file: File) => void;
}

export default function WatermarkControls({
  watermark,
  projectWatermarkUrl,
  projectName,
  onChange,
  onUpload,
}: WatermarkControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const setMode = (source: WatermarkLayer["source"] | "off") => {
    if (source === "off") {
      onChange({ enabled: false });
      return;
    }
    if (source === "project") {
      onChange({ enabled: true, source: "project", imageUrl: projectWatermarkUrl, text: null });
      return;
    }
    if (source === "text") {
      onChange({ enabled: true, source: "text", imageUrl: null, text: watermark.text || projectName });
      return;
    }
    onChange({ enabled: true, source: "custom" });
  };

  const mode: WatermarkLayer["source"] | "off" = watermark.enabled ? watermark.source : "off";

  return (
    <div className="space-y-4">
      <Toggle label="Bật watermark" checked={watermark.enabled} onChange={(enabled) => onChange({ enabled })} />

      <ControlRow label="Kiểu watermark">
        <SegmentedControl
          ariaLabel="Kiểu watermark"
          value={mode}
          onChange={setMode}
          options={[
            { value: "project", label: "Logo dự án", title: projectWatermarkUrl ? "Dùng logo đã lưu của dự án" : "Dự án chưa có logo" },
            { value: "text", label: "Chữ" },
            { value: "custom", label: "Tải lên" },
            { value: "off", label: "Tắt" },
          ]}
        />
      </ControlRow>

      {watermark.enabled && watermark.source === "text" && (
        <ControlRow label="Chữ watermark">
          <input
            type="text"
            value={watermark.text ?? ""}
            maxLength={40}
            placeholder={projectName}
            onChange={(event) => onChange({ text: event.target.value })}
            className="w-full rounded-lg border th-border-secondary th-bg-tertiary px-3 py-2 text-sm th-text-primary outline-none"
          />
        </ControlRow>
      )}

      {watermark.enabled && watermark.source === "custom" && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
          {watermark.imageUrl ? (
            <div className="flex items-center gap-2 rounded-lg border th-border-secondary p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={watermark.imageUrl} alt="Watermark" className="h-8 w-8 object-contain" />
              <span className="flex-1 truncate text-xs th-text-tertiary">Logo đã tải lên</span>
              <button
                type="button"
                aria-label="Bỏ logo"
                onClick={() => onChange({ imageUrl: null })}
                className="th-text-tertiary hover:th-text-primary"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed th-border-secondary p-4 th-text-tertiary th-bg-hover"
            >
              <Upload size={16} />
              <span className="text-xs">Tải logo PNG / JPG / SVG</span>
            </button>
          )}
        </div>
      )}

      {watermark.enabled && (
        <>
          <ControlRow label="Độ mờ" value={`${Math.round(watermark.opacity * 100)}%`}>
            <Slider
              ariaLabel="Độ mờ watermark"
              min={10}
              max={100}
              value={watermark.opacity * 100}
              onChange={(value) => onChange({ opacity: value / 100 })}
            />
          </ControlRow>

          <ControlRow label="Kích thước" value={`${Math.round(watermark.scale * 100)}%`}>
            <Slider
              ariaLabel="Kích thước watermark"
              min={5}
              max={40}
              value={watermark.scale * 100}
              onChange={(value) => onChange({ scale: value / 100 })}
            />
          </ControlRow>

          <ControlRow label="Vị trí">
            <WatermarkGrid value={watermark.position} onChange={(position) => onChange({ position })} />
          </ControlRow>
        </>
      )}
    </div>
  );
}
