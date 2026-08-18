"use client";

import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import Textarea from "@/components/ui/textarea";
import type { TextLayer, TextStyle } from "@/lib/meme-doc/types";
import { ColorField, ControlRow, SegmentedControl, Slider, Toggle } from "./control-primitives";

const MAX_TEXT_LENGTH = 200;

interface TextControlsProps {
  layer: TextLayer;
  recommendedChars?: number;
  overflowing?: boolean;
  onChange: (patch: Partial<TextLayer>) => void;
  onStyleChange: (patch: Partial<TextStyle>) => void;
}

export default function TextControls({
  layer,
  recommendedChars,
  overflowing,
  onChange,
  onStyleChange,
}: TextControlsProps) {
  const centerX = Math.round((layer.box.x + layer.box.w / 2) * 100);
  const centerY = Math.round((layer.box.y + layer.box.h / 2) * 100);

  const moveTo = (axis: "x" | "y", percent: number) => {
    const size = axis === "x" ? layer.box.w : layer.box.h;
    const next = Math.min(1 - size, Math.max(0, percent / 100 - size / 2));
    onChange({ box: { ...layer.box, [axis]: next } });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium th-text-tertiary">Nội dung text</span>
          <span className={`text-xs tabular-nums ${overflowing ? "th-text-danger" : "th-text-tertiary"}`}>
            {layer.text.length} / {MAX_TEXT_LENGTH}
          </span>
        </div>
        <Textarea
          value={layer.text}
          maxLength={MAX_TEXT_LENGTH}
          rows={3}
          placeholder="Gõ câu thoại cho meme…"
          onChange={(event) => onChange({ text: event.target.value })}
        />
        {overflowing ? (
          <p className="text-xs th-text-danger">
            Chữ đã chạm cỡ nhỏ nhất mà vẫn tràn khung. Rút ngắn câu hoặc kéo rộng vùng chữ.
          </p>
        ) : recommendedChars ? (
          <p className="text-xs th-text-tertiary">Ảnh này đẹp nhất ở khoảng {recommendedChars} ký tự.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ControlRow label="Cỡ chữ" value={layer.style.autoFit ? "auto" : Math.round(layer.style.fontSize * 1000) / 10}>
          <Slider
            ariaLabel="Cỡ chữ"
            min={2}
            max={16}
            step={0.1}
            value={layer.style.fontSize * 100}
            onChange={(value) => onStyleChange({ fontSize: value / 100, autoFit: false })}
          />
        </ControlRow>
        <ControlRow label="Giãn dòng" value={layer.style.lineHeight.toFixed(2)}>
          <Slider
            ariaLabel="Giãn dòng"
            min={0.9}
            max={2}
            step={0.05}
            value={layer.style.lineHeight}
            onChange={(value) => onStyleChange({ lineHeight: value })}
          />
        </ControlRow>
        <ControlRow label="Vị trí ngang" value={`${centerX}%`}>
          <Slider ariaLabel="Vị trí ngang" min={0} max={100} value={centerX} onChange={(value) => moveTo("x", value)} />
        </ControlRow>
        <ControlRow label="Vị trí dọc" value={`${centerY}%`}>
          <Slider ariaLabel="Vị trí dọc" min={0} max={100} value={centerY} onChange={(value) => moveTo("y", value)} />
        </ControlRow>
        <ControlRow label="Độ dày viền" value={Math.round(layer.style.strokeWidth * 100)}>
          <Slider
            ariaLabel="Độ dày viền"
            min={0}
            max={30}
            value={layer.style.strokeWidth * 100}
            onChange={(value) => onStyleChange({ strokeWidth: value / 100 })}
          />
        </ControlRow>
        <ControlRow label="Bề rộng vùng chữ" value={`${Math.round(layer.box.w * 100)}%`}>
          <Slider
            ariaLabel="Bề rộng vùng chữ"
            min={20}
            max={100}
            value={layer.box.w * 100}
            onChange={(value) => {
              const w = value / 100;
              const x = Math.min(1 - w, Math.max(0, layer.box.x + (layer.box.w - w) / 2));
              onChange({ box: { ...layer.box, w, x } });
            }}
          />
        </ControlRow>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Màu chữ" value={layer.style.color} onChange={(color) => onStyleChange({ color })} />
        <ColorField label="Màu viền" value={layer.style.strokeColor} onChange={(strokeColor) => onStyleChange({ strokeColor })} />
      </div>

      <ControlRow label="Canh lề">
        <SegmentedControl
          ariaLabel="Canh lề"
          value={layer.style.align}
          onChange={(align) => onStyleChange({ align })}
          options={[
            { value: "left", label: <AlignLeft size={14} />, title: "Canh trái" },
            { value: "center", label: <AlignCenter size={14} />, title: "Canh giữa" },
            { value: "right", label: <AlignRight size={14} />, title: "Canh phải" },
          ]}
        />
      </ControlRow>

      <div className="space-y-2.5">
        <Toggle label="VIẾT HOA" checked={layer.style.uppercase} onChange={(uppercase) => onStyleChange({ uppercase })} />
        <Toggle
          label="Tự canh cỡ chữ"
          checked={layer.style.autoFit}
          onChange={(autoFit) => onStyleChange({ autoFit })}
        />
      </div>
    </div>
  );
}
