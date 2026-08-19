"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { RotateCcw } from "lucide-react";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { FALLBACK_SAFE_ZONES, parseSafeZones } from "@/lib/meme-layout-presets";
import type { Rect, SafeZoneMap } from "@/lib/meme-doc/types";
import type { MascotBaseImage } from "@/types/database";

type ZoneKey = "top" | "center" | "bottom" | "side";

const ZONE_LABELS: Record<ZoneKey, string> = {
  top: "Trên",
  center: "Giữa",
  bottom: "Dưới",
  side: "Bên cạnh",
};

const MIN_SIZE = 0.06;

type DragState =
  | { kind: "move"; zone: ZoneKey; startX: number; startY: number; origin: Rect }
  | { kind: "resize"; zone: ZoneKey; startX: number; startY: number; origin: Rect }
  | null;

interface SafeZoneEditorProps {
  open: boolean;
  onClose: () => void;
  baseImage: MascotBaseImage | null;
  onSave: (safeZones: SafeZoneMap) => Promise<void>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function SafeZoneEditor({ open, onClose, baseImage, onSave }: SafeZoneEditorProps) {
  const toast = useToast();
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);

  const initial = useMemo(
    () => (baseImage ? parseSafeZones(baseImage.safe_zones, baseImage.aspect_ratio) : null),
    [baseImage]
  );

  const [zones, setZones] = useState<Partial<Record<ZoneKey, Rect>>>(() => initial?.zones ?? {});
  const [active, setActive] = useState<ZoneKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirtyKey, setDirtyKey] = useState(baseImage?.id ?? null);

  // Reset when the modal is opened on a different image.
  if (baseImage && dirtyKey !== baseImage.id) {
    setDirtyKey(baseImage.id);
    setZones(initial?.zones ?? {});
    setActive(null);
  }

  const toNormalized = useCallback((clientX: number, clientY: number) => {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame || frame.width === 0 || frame.height === 0) return { x: 0, y: 0 };
    return { x: (clientX - frame.left) / frame.width, y: (clientY - frame.top) / frame.height };
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent, zone: ZoneKey, kind: "move" | "resize") => {
      event.preventDefault();
      event.stopPropagation();
      const rect = zones[zone];
      if (!rect) return;
      const point = toNormalized(event.clientX, event.clientY);
      dragRef.current = { kind, zone, startX: point.x, startY: point.y, origin: { ...rect } };
      setActive(zone);
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [zones, toNormalized]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = toNormalized(event.clientX, event.clientY);
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;

      setZones((current) => {
        const next = { ...current };
        if (drag.kind === "move") {
          next[drag.zone] = {
            ...drag.origin,
            x: clamp(drag.origin.x + dx, 0, 1 - drag.origin.w),
            y: clamp(drag.origin.y + dy, 0, 1 - drag.origin.h),
          };
        } else {
          next[drag.zone] = {
            ...drag.origin,
            w: clamp(drag.origin.w + dx, MIN_SIZE, 1 - drag.origin.x),
            h: clamp(drag.origin.h + dy, MIN_SIZE, 1 - drag.origin.y),
          };
        }
        return next;
      });
    },
    [toNormalized]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const resetToDefaults = () => {
    if (!baseImage) return;
    setZones(FALLBACK_SAFE_ZONES[baseImage.aspect_ratio].zones);
  };

  const save = async () => {
    if (!baseImage) return;
    setSaving(true);
    try {
      await onSave({
        zones,
        avoid: initial?.avoid,
        watermark: initial?.watermark,
      });
      toast.success("Đã lưu vùng chữ cho ảnh này");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  if (!baseImage) return null;

  const [ratioW, ratioH] = baseImage.aspect_ratio.split(":").map(Number);

  return (
    <Modal isOpen={open} onClose={onClose} title="Chỉnh vùng chữ" size="lg">
      <div className="space-y-4">
        <p className="text-sm th-text-tertiary">
          Kéo khung để đổi chỗ, kéo góc dưới bên phải để đổi kích thước. Toạ độ lưu theo tỉ lệ nên vẫn đúng ở
          mọi độ phân giải.
        </p>

        <div
          ref={frameRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative mx-auto w-full max-w-md touch-none overflow-hidden rounded-xl th-bg-tertiary"
          style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
        >
          <Image src={baseImage.image_url} alt="Ảnh nền" fill className="object-cover" unoptimized />

          {(initial?.avoid ?? []).map((rect, index) => (
            <div
              key={`avoid-${index}`}
              className="pointer-events-none absolute border-2 border-dashed border-pink-400/70"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            />
          ))}

          {(Object.keys(ZONE_LABELS) as ZoneKey[]).map((zone) => {
            const rect = zones[zone];
            if (!rect) return null;
            return (
              <div
                key={zone}
                onPointerDown={(event) => onPointerDown(event, zone, "move")}
                className={`absolute cursor-move border-2 ${
                  active === zone ? "border-blue-500 bg-blue-500/20" : "border-sky-400/80 bg-sky-400/10"
                }`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              >
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  {ZONE_LABELS[zone]}
                </span>
                <span
                  onPointerDown={(event) => onPointerDown(event, zone, "resize")}
                  className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-full border-2 border-white bg-blue-600"
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(ZONE_LABELS) as ZoneKey[]).map((zone) => {
            const present = Boolean(zones[zone]);
            return (
              <button
                key={zone}
                type="button"
                onClick={() =>
                  setZones((current) => {
                    const next = { ...current };
                    if (present) delete next[zone];
                    else next[zone] = { x: 0.05, y: zone === "bottom" ? 0.75 : 0.05, w: 0.9, h: 0.2 };
                    return next;
                  })
                }
                className={`rounded-full border px-3 py-1 text-xs ${
                  present ? "border-blue-600 text-blue-600 bg-blue-600/10" : "th-border-secondary th-text-tertiary"
                }`}
              >
                {present ? "− " : "+ "}
                {ZONE_LABELS[zone]}
              </button>
            );
          })}
          <span className="ml-auto flex items-center gap-1 text-[11px] th-text-tertiary">
            <span className="inline-block h-2 w-2 rounded-full bg-pink-400" /> vùng không được che
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={resetToDefaults}>
            <RotateCcw size={14} /> Về mặc định
          </Button>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={save} loading={saving} disabled={Object.keys(zones).length === 0}>
            Lưu vùng chữ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
