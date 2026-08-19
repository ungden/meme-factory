"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Check, Loader2, Upload, X } from "lucide-react";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Input from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ControlRow, SegmentedControl, Slider } from "@/components/editor/control-primitives";
import { createTemplateFromFile } from "@/lib/template-create";
import {
  DEFAULT_FRAME,
  checkAcceptable,
  computeDrawRect,
  hasLetterbox,
  lowResolutionWarning,
  measureImage,
  suggestAspect,
  type Frame,
} from "@/lib/template-upload";
import { FALLBACK_SAFE_ZONES } from "@/lib/meme-layout-presets";
import { FORMAT_DIMENSIONS, type ExpressionTag, type MemeFormat } from "@/types/database";
import type { Rect } from "@/lib/meme-doc/types";
import ZoneCanvas, { ZoneToggles, type ZoneKey } from "./zone-canvas";

interface PendingTemplate {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  warning: string | null;
  aspectRatio: MemeFormat;
  cropLoss: number;
  frame: Frame;
  zones: Partial<Record<ZoneKey, Rect>>;
  expressionSlug: string;
  title: string;
  saved?: boolean;
  error?: string;
}

interface TemplateUploadDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  characterId?: string | null;
  expressionTags: ExpressionTag[];
  /** Files handed in by the caller, e.g. legacy poses being imported. */
  initialFiles?: File[] | null;
  /** Tags the resulting rows as imported from the pose library. */
  source?: "upload" | "imported_pose";
  onSaved?: () => void;
}

export default function TemplateUploadDialog({
  open,
  onClose,
  projectId,
  characterId,
  expressionTags,
  initialFiles,
  source = "upload",
  onSaved,
}: TemplateUploadDialogProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PendingTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;


  const addFiles = useCallback(
    async (files: File[]) => {
      setReading(true);
      const accepted: PendingTemplate[] = [];

      for (const file of files) {
        const basicRejection = checkAcceptable({ type: file.type, size: file.size });
        if (basicRejection) {
          toast.error(`${file.name}: ${basicRejection.message}`);
          continue;
        }

        try {
          const measured = await measureImage(file);
          const rejection = checkAcceptable({
            type: file.type,
            size: file.size,
            width: measured.width,
            height: measured.height,
          });
          if (rejection) {
            toast.error(`${file.name}: ${rejection.message}`);
            continue;
          }

          const suggestion = suggestAspect(measured.width, measured.height);
          accepted.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
            width: measured.width,
            height: measured.height,
            hasAlpha: measured.hasAlpha,
            warning: lowResolutionWarning(measured.width, measured.height),
            aspectRatio: suggestion.format,
            cropLoss: suggestion.cropLoss,
            frame: DEFAULT_FRAME,
            zones: { bottom: FALLBACK_SAFE_ZONES[suggestion.format].zones.bottom! },
            expressionSlug: "neutral",
            title: file.name.replace(/\.[^.]+$/, ""),
          });
        } catch {
          toast.error(`${file.name}: không đọc được ảnh`);
        }
      }

      setReading(false);
      if (accepted.length === 0) return;
      setItems((current) => [...current, ...accepted]);
      setActiveId((current) => current ?? accepted[0].id);
    },
    [toast]
  );


  const patchActive = (patch: Partial<PendingTemplate>) => {
    if (!active) return;
    setItems((current) => current.map((item) => (item.id === active.id ? { ...item, ...patch } : item)));
  };

  const applyToSameRatio = () => {
    if (!active) return;
    setItems((current) =>
      current.map((item) =>
        item.aspectRatio === active.aspectRatio && item.id !== active.id
          ? { ...item, frame: active.frame, zones: active.zones }
          : item
      )
    );
    toast.success("Đã áp dụng khung và vùng chữ cho các ảnh cùng tỉ lệ");
  };

  const drawRect = useMemo(() => {
    if (!active) return null;
    const canvas = FORMAT_DIMENSIONS[active.aspectRatio];
    return computeDrawRect({
      sourceWidth: active.width,
      sourceHeight: active.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frame: active.frame,
    });
  }, [active]);

  const letterboxed = useMemo(() => {
    if (!active || !drawRect) return false;
    const canvas = FORMAT_DIMENSIONS[active.aspectRatio];
    return hasLetterbox(drawRect, canvas.width, canvas.height);
  }, [active, drawRect]);

  const saveAll = async () => {
    const pending = items.filter((item) => !item.saved);
    if (pending.length === 0) return;

    setSaving(true);
    let saved = 0;
    for (const item of pending) {
      try {
        await createTemplateFromFile({
          projectId,
          characterId: characterId ?? null,
          file: item.file,
          title: item.title,
          expressionSlug: item.expressionSlug,
          aspectRatio: item.aspectRatio,
          frame: item.frame,
          safeZones: { zones: item.zones },
          publish: Object.keys(item.zones).length > 0,
          source,
        });
        saved += 1;
        setItems((current) =>
          current.map((row) => (row.id === item.id ? { ...row, saved: true, error: undefined } : row))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Lưu thất bại";
        setItems((current) => current.map((row) => (row.id === item.id ? { ...row, error: message } : row)));
        toast.error(`${item.title}: ${message}`);
      }
    }
    setSaving(false);

    if (saved > 0) {
      toast.success(`Đã thêm ${saved} mẫu meme`);
      onSaved?.();
      if (saved === pending.length) {
        setItems([]);
        setActiveId(null);
        onClose();
      }
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Thêm mẫu meme" size="xl">
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) addFiles(files);
            event.target.value = "";
          }}
        />

        {items.length === 0 ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed th-border-secondary p-10 th-text-tertiary th-bg-hover"
            >
              {reading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              <span className="text-sm">Chọn ảnh PNG, JPG hoặc WebP</span>
              <span className="text-xs">Cạnh ngắn từ 400px, tối đa 15MB mỗi ảnh</span>
            </button>

            {(initialFiles?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border th-border-secondary p-3">
                <p className="text-xs th-text-tertiary">
                  Có {initialFiles!.length} ảnh gốc của mascot này chưa thành mẫu.
                </p>
                <Button size="sm" variant="outline" loading={reading} onClick={() => addFiles(initialFiles!)}>
                  Nạp {initialFiles!.length} ảnh gốc
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)_240px]">
            {/* Danh sách ảnh */}
            <div className="space-y-2">
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    className={`relative block w-full overflow-hidden rounded-lg border-2 ${
                      active?.id === item.id ? "border-blue-600" : "th-border-secondary"
                    }`}
                  >
                    <div className="relative aspect-square th-bg-tertiary">
                      <Image src={item.previewUrl} alt={item.title} fill className="object-cover" unoptimized />
                      {item.saved && (
                        <span className="absolute right-1 top-1 rounded-full bg-blue-600 p-0.5 text-white">
                          <Check size={10} />
                        </span>
                      )}
                      {item.error && (
                        <span className="absolute right-1 top-1 rounded-full bg-red-600 p-0.5 text-white">
                          <AlertTriangle size={10} />
                        </span>
                      )}
                    </div>
                    <span className="block truncate px-1 py-0.5 text-[10px] th-text-tertiary">
                      {item.width}×{item.height}
                    </span>
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> Thêm ảnh
              </Button>
            </div>

            {/* Khung + vùng chữ */}
            {active && (
              <div className="space-y-3">
                <ZoneCanvas
                  aspectRatio={active.aspectRatio}
                  zones={active.zones}
                  onChange={(zones) => patchActive({ zones })}
                >
                  <div className="absolute inset-0" style={{ background: letterboxed ? "#FFFFFF" : "transparent" }}>
                    {drawRect && (
                      // Mirrors computeDrawRect so what you position is what gets exported.
                      <div
                        className="absolute"
                        style={{
                          left: `${(drawRect.x / FORMAT_DIMENSIONS[active.aspectRatio].width) * 100}%`,
                          top: `${(drawRect.y / FORMAT_DIMENSIONS[active.aspectRatio].height) * 100}%`,
                          width: `${(drawRect.w / FORMAT_DIMENSIONS[active.aspectRatio].width) * 100}%`,
                          height: `${(drawRect.h / FORMAT_DIMENSIONS[active.aspectRatio].height) * 100}%`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={active.previewUrl} alt={active.title} className="h-full w-full object-fill" />
                      </div>
                    )}
                  </div>
                </ZoneCanvas>

                <ZoneToggles zones={active.zones} onChange={(zones) => patchActive({ zones })} />

                {Object.keys(active.zones).length === 0 && (
                  <p className="text-xs th-text-danger">
                    Chưa khoanh vùng chữ nên mẫu sẽ lưu ở dạng nháp, chưa dùng để ghép chữ được.
                  </p>
                )}
                {active.warning && <p className="text-xs th-text-tertiary">{active.warning}</p>}
              </div>
            )}

            {/* Thuộc tính */}
            {active && (
              <div className="space-y-3">
                <Input
                  label="Tên mẫu"
                  value={active.title}
                  maxLength={80}
                  onChange={(event) => patchActive({ title: event.target.value })}
                />

                <ControlRow label="Khổ ảnh" value={`cắt ${Math.round(active.cropLoss * 100)}%`}>
                  <div className="grid grid-cols-4 gap-1">
                    {(Object.keys(FORMAT_DIMENSIONS) as MemeFormat[]).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => {
                          const suggestion = suggestAspect(active.width, active.height);
                          patchActive({
                            aspectRatio: format,
                            cropLoss: format === suggestion.format ? suggestion.cropLoss : active.cropLoss,
                            zones: { bottom: FALLBACK_SAFE_ZONES[format].zones.bottom! },
                          });
                        }}
                        className={`rounded-lg border px-1.5 py-1 text-[11px] ${
                          active.aspectRatio === format
                            ? "border-blue-600 text-blue-600 bg-blue-600/10"
                            : "th-border-secondary th-text-tertiary"
                        }`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </ControlRow>

                <ControlRow label="Cách đặt ảnh">
                  <SegmentedControl
                    ariaLabel="Cách đặt ảnh"
                    value={active.frame.fit}
                    onChange={(fit) => patchActive({ frame: { ...active.frame, fit } })}
                    options={[
                      { value: "cover" as const, label: "Lấp đầy" },
                      { value: "contain" as const, label: "Vừa khung" },
                    ]}
                  />
                </ControlRow>

                <ControlRow label="Phóng to" value={`${Math.round(active.frame.scale * 100)}%`}>
                  <Slider
                    ariaLabel="Phóng to"
                    min={50}
                    max={250}
                    value={active.frame.scale * 100}
                    onChange={(value) => patchActive({ frame: { ...active.frame, scale: value / 100 } })}
                  />
                </ControlRow>

                <ControlRow label="Dịch ngang" value={`${Math.round(active.frame.offset.x * 100)}%`}>
                  <Slider
                    ariaLabel="Dịch ngang"
                    min={-50}
                    max={50}
                    value={active.frame.offset.x * 100}
                    onChange={(value) =>
                      patchActive({ frame: { ...active.frame, offset: { ...active.frame.offset, x: value / 100 } } })
                    }
                  />
                </ControlRow>

                <ControlRow label="Dịch dọc" value={`${Math.round(active.frame.offset.y * 100)}%`}>
                  <Slider
                    ariaLabel="Dịch dọc"
                    min={-50}
                    max={50}
                    value={active.frame.offset.y * 100}
                    onChange={(value) =>
                      patchActive({ frame: { ...active.frame, offset: { ...active.frame.offset, y: value / 100 } } })
                    }
                  />
                </ControlRow>

                <ControlRow label="Biểu cảm">
                  <select
                    aria-label="Biểu cảm"
                    value={active.expressionSlug}
                    onChange={(event) => patchActive({ expressionSlug: event.target.value })}
                    className="w-full rounded-lg border th-border-secondary th-bg-tertiary px-2 py-1.5 text-xs th-text-primary"
                  >
                    {expressionTags.map((tag) => (
                      <option key={tag.slug} value={tag.slug}>
                        {tag.label_vi}
                      </option>
                    ))}
                  </select>
                </ControlRow>

                {items.length > 1 && (
                  <Button size="sm" variant="ghost" className="w-full" onClick={applyToSameRatio}>
                    Áp dụng cho ảnh cùng tỉ lệ
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setActiveId(null);
              }}
              className="mr-auto flex items-center gap-1 text-xs th-text-tertiary hover:th-text-primary"
            >
              <X size={12} /> Bỏ hết
            </button>
          )}
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={saveAll} loading={saving} disabled={items.length === 0}>
            Lưu {items.filter((item) => !item.saved).length} mẫu
          </Button>
        </div>
      </div>
    </Modal>
  );
}
