"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { RotateCcw } from "lucide-react";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { FALLBACK_SAFE_ZONES, parseSafeZones } from "@/lib/meme-layout-presets";
import type { Rect, SafeZoneMap } from "@/lib/meme-doc/types";
import type { MascotBaseImage } from "@/types/database";
import ZoneCanvas, { ZoneToggles, type ZoneKey } from "./zone-canvas";

interface SafeZoneEditorProps {
  open: boolean;
  onClose: () => void;
  baseImage: MascotBaseImage | null;
  onSave: (safeZones: SafeZoneMap) => Promise<void>;
}

export default function SafeZoneEditor({ open, onClose, baseImage, onSave }: SafeZoneEditorProps) {
  const toast = useToast();

  const initial = useMemo(
    () => (baseImage ? parseSafeZones(baseImage.safe_zones, baseImage.aspect_ratio) : null),
    [baseImage]
  );

  const [zones, setZones] = useState<Partial<Record<ZoneKey, Rect>>>(() => initial?.zones ?? {});
  const [saving, setSaving] = useState(false);
  const [syncedId, setSyncedId] = useState(baseImage?.id ?? null);

  // Sync from props during render; an effect here would cascade an extra render.
  if (baseImage && syncedId !== baseImage.id) {
    setSyncedId(baseImage.id);
    setZones(initial?.zones ?? {});
  }

  if (!baseImage) return null;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ zones, avoid: initial?.avoid, watermark: initial?.watermark });
      toast.success("Đã lưu vùng chữ cho ảnh này");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Chỉnh vùng chữ" size="lg">
      <div className="space-y-4">
        <p className="text-sm th-text-tertiary">
          Kéo khung để đổi chỗ, kéo góc dưới bên phải để đổi kích thước. Toạ độ lưu theo tỉ lệ nên vẫn
          đúng ở mọi độ phân giải.
        </p>

        <div className="mx-auto w-full max-w-md">
          <ZoneCanvas
            aspectRatio={baseImage.aspect_ratio}
            zones={zones}
            avoid={initial?.avoid}
            onChange={setZones}
          >
            <Image src={baseImage.image_url} alt="Ảnh nền" fill className="object-cover" unoptimized />
          </ZoneCanvas>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ZoneToggles zones={zones} onChange={setZones} />
          <span className="ml-auto flex items-center gap-1 text-[11px] th-text-tertiary">
            <span className="inline-block h-2 w-2 rounded-full bg-pink-400" /> vùng không được che
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setZones(FALLBACK_SAFE_ZONES[baseImage.aspect_ratio].zones)}>
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
