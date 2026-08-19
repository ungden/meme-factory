"use client";

import type { WatermarkPosition } from "@/types/database";

/** 3x3 placement grid, ordered the way it reads on screen. */
export const WATERMARK_GRID: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const LABELS: Record<WatermarkPosition, string> = {
  "top-left": "Trên trái",
  "top-center": "Trên giữa",
  "top-right": "Trên phải",
  "center-left": "Giữa trái",
  center: "Chính giữa",
  "center-right": "Giữa phải",
  "bottom-left": "Dưới trái",
  "bottom-center": "Dưới giữa",
  "bottom-right": "Dưới phải",
};

export default function WatermarkGrid({
  value,
  onChange,
}: {
  value: WatermarkPosition;
  onChange: (position: WatermarkPosition) => void;
}) {
  return (
    <div role="group" aria-label="Vị trí watermark" className="grid w-fit grid-cols-3 gap-1">
      {WATERMARK_GRID.map((position) => {
        const active = value === position;
        return (
          <button
            key={position}
            type="button"
            title={LABELS[position]}
            aria-label={LABELS[position]}
            aria-pressed={active}
            onClick={() => onChange(position)}
            className={`flex h-8 w-10 items-center justify-center rounded-lg border transition-colors ${
              active ? "border-blue-600 bg-blue-600/10" : "th-border-secondary th-bg-hover"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${active ? "bg-blue-600" : "th-bg-tertiary"}`}
              style={active ? undefined : { background: "var(--text-muted)" }}
            />
          </button>
        );
      })}
    </div>
  );
}
