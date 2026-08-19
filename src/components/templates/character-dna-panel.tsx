"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import type { CharacterDna, WatermarkPosition } from "@/types/database";

/** Reads a jsonb column that may hold an array, {traits}, {notes} or nothing. */
function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["traits", "notes", "items"]) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter((entry): entry is string => typeof entry === "string");
      }
    }
  }
  return [];
}

function toPalette(value: unknown): { hex: string; name?: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { hex: entry };
      if (entry && typeof entry === "object" && typeof (entry as { hex?: unknown }).hex === "string") {
        return { hex: (entry as { hex: string }).hex, name: (entry as { name?: string }).name };
      }
      return null;
    })
    .filter((entry): entry is { hex: string; name?: string } => Boolean(entry));
}

function ChipList({
  label,
  hint,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium th-text-tertiary">{label}</p>
      {hint && <p className="text-[11px] th-text-tertiary">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full th-bg-tertiary px-2.5 py-1 text-xs th-text-secondary"
          >
            {item}
            <button
              type="button"
              aria-label={`Bỏ ${item}`}
              onClick={() => onChange(items.filter((entry) => entry !== item))}
              className="th-text-tertiary hover:th-text-primary"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="flex-1 rounded-lg border th-border-secondary th-bg-tertiary px-2.5 py-1.5 text-xs th-text-primary outline-none"
        />
        <Button size="sm" variant="ghost" aria-label={`Thêm ${label}`} onClick={add}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}

interface CharacterDnaPanelProps {
  dna: CharacterDna | null;
  watermarkPosition: WatermarkPosition;
  saving: boolean;
  onSave: (patch: Partial<CharacterDna>) => Promise<void>;
}

export default function CharacterDnaPanel({
  dna,
  watermarkPosition,
  saving,
  onSave,
}: CharacterDnaPanelProps) {
  const [summary, setSummary] = useState("");
  const [palette, setPalette] = useState<{ hex: string; name?: string }[]>([]);
  const [faceTraits, setFaceTraits] = useState<string[]>([]);
  const [tone, setTone] = useState<string[]>([]);
  const [background, setBackground] = useState<string[]>([]);
  const [mustPreserve, setMustPreserve] = useState<string[]>([]);
  const [mayChange, setMayChange] = useState<string[]>([]);

  // Sync from props during render rather than in an effect: an effect here would
  // cascade a second render on every load and on every save round trip.
  const version = dna ? `${dna.character_id}:${dna.updated_at}` : "empty";
  const [syncedVersion, setSyncedVersion] = useState<string | null>(null);
  if (syncedVersion !== version) {
    setSyncedVersion(version);
    setSummary(dna?.summary ?? "");
    setPalette(toPalette(dna?.palette));
    setFaceTraits(toStringList(dna?.face_traits));
    setTone(toStringList(dna?.tone));
    setBackground(toStringList(dna?.background_style));
    setMustPreserve(toStringList(dna?.must_preserve));
    setMayChange(toStringList(dna?.may_change));
  }

  const save = () =>
    onSave({
      summary,
      palette,
      face_traits: faceTraits,
      tone: { traits: tone } as unknown as CharacterDna["tone"],
      background_style: { notes: background } as unknown as CharacterDna["background_style"],
      must_preserve: mustPreserve,
      may_change: mayChange,
    });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium th-text-tertiary">Tóm tắt nhận dạng</p>
          <Textarea
            rows={4}
            value={summary}
            placeholder="Bò vàng, sừng cong ngắn, mắt to tròn, luôn mặc hoodie xanh cobalt…"
            onChange={(event) => setSummary(event.target.value)}
          />
          <p className="text-[11px] th-text-tertiary">
            Nội dung này được ghép vào mô tả nhân vật mỗi khi sinh bộ biểu cảm mới.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium th-text-tertiary">Bảng màu</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {palette.map((color, index) => (
              <span key={`${color.hex}-${index}`} className="group relative">
                <span
                  className="block h-8 w-8 rounded-full border th-border-secondary"
                  style={{ background: color.hex }}
                  title={color.name || color.hex}
                />
                <button
                  type="button"
                  aria-label={`Bỏ màu ${color.hex}`}
                  onClick={() => setPalette(palette.filter((_, i) => i !== index))}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-black/70 p-0.5 text-white group-hover:block"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
            <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed th-border-secondary th-text-tertiary">
              <Plus size={13} />
              <input
                type="color"
                aria-label="Thêm màu"
                className="sr-only"
                onChange={(event) => setPalette([...palette, { hex: event.target.value }])}
              />
            </label>
          </div>
        </div>

        <ChipList
          label="Đặc điểm khuôn mặt"
          items={faceTraits}
          placeholder="mắt to tròn"
          onChange={setFaceTraits}
        />
        <ChipList label="Chất giọng / thái độ" items={tone} placeholder="dí dỏm, hơi mỉa" onChange={setTone} />
      </div>

      <div className="space-y-4">
        <ChipList
          label="Phong cách nền"
          items={background}
          placeholder="nền kem ấm, tối giản"
          onChange={setBackground}
        />
        <ChipList
          label="Phải giữ nguyên"
          hint="AI không được đổi những thứ này giữa các ảnh."
          items={mustPreserve}
          placeholder="loài, màu lông, sừng"
          onChange={setMustPreserve}
        />
        <ChipList
          label="Được phép đổi"
          items={mayChange}
          placeholder="biểu cảm, tư thế, bối cảnh"
          onChange={setMayChange}
        />

        <div className="space-y-1.5">
          <p className="text-xs font-medium th-text-tertiary">Vùng an toàn watermark</p>
          <div className="grid aspect-square w-32 grid-cols-3 grid-rows-3 gap-px overflow-hidden rounded-lg border th-border-secondary">
            {[
              "top-left", "top-center", "top-right",
              "center-left", "center", "center-right",
              "bottom-left", "bottom-center", "bottom-right",
            ].map((cell) => (
              <span
                key={cell}
                className="th-bg-tertiary"
                style={cell === watermarkPosition ? { background: "var(--accent)" } : undefined}
              />
            ))}
          </div>
          <p className="text-[11px] th-text-tertiary">
            Ô tô đậm là nơi watermark của dự án rơi vào. Tránh đặt chi tiết quan trọng ở đó.
          </p>
        </div>

        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>
            Lưu Character DNA
          </Button>
        </div>
      </div>
    </div>
  );
}
