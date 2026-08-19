"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { Rect, SafeZoneMap } from "@/lib/meme-doc/types";

export type ZoneKey = "top" | "center" | "bottom" | "side";

export const ZONE_LABELS: Record<ZoneKey, string> = {
  top: "Trên",
  center: "Giữa",
  bottom: "Dưới",
  side: "Bên cạnh",
};

export const ZONE_KEYS = Object.keys(ZONE_LABELS) as ZoneKey[];
const MIN_SIZE = 0.06;

type DragState =
  | { kind: "move" | "resize"; zone: ZoneKey; startX: number; startY: number; origin: Rect }
  | null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function defaultZoneRect(zone: ZoneKey): Rect {
  switch (zone) {
    case "top":
      return { x: 0.05, y: 0.05, w: 0.9, h: 0.22 };
    case "bottom":
      return { x: 0.05, y: 0.73, w: 0.9, h: 0.22 };
    case "side":
      return { x: 0.5, y: 0.15, w: 0.45, h: 0.55 };
    case "center":
    default:
      return { x: 0.08, y: 0.38, w: 0.84, h: 0.24 };
  }
}

/**
 * The draggable caption-zone surface, shared by the safe-zone editor and the
 * upload wizard so both behave identically. Rendered over whatever preview the
 * caller supplies as children; every rect is normalized 0..1.
 */
export default function ZoneCanvas({
  aspectRatio,
  zones,
  avoid,
  onChange,
  children,
}: {
  aspectRatio: string;
  zones: Partial<Record<ZoneKey, Rect>>;
  avoid?: Rect[];
  onChange: (zones: Partial<Record<ZoneKey, Rect>>) => void;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const [active, setActive] = useState<ZoneKey | null>(null);

  const [ratioW, ratioH] = aspectRatio.split(":").map(Number);

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

      const next = { ...zones };
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
      onChange(next);
    },
    [zones, toNormalized, onChange]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={frameRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative w-full touch-none overflow-hidden rounded-xl th-bg-tertiary"
      style={{ aspectRatio: `${ratioW || 1} / ${ratioH || 1}` }}
    >
      {children}

      {(avoid ?? []).map((rect, index) => (
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

      {ZONE_KEYS.map((zone) => {
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
  );
}

export function ZoneToggles({
  zones,
  onChange,
}: {
  zones: Partial<Record<ZoneKey, Rect>>;
  onChange: (zones: Partial<Record<ZoneKey, Rect>>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ZONE_KEYS.map((zone) => {
        const present = Boolean(zones[zone]);
        return (
          <button
            key={zone}
            type="button"
            onClick={() => {
              const next = { ...zones };
              if (present) delete next[zone];
              else next[zone] = defaultZoneRect(zone);
              onChange(next);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              present ? "border-blue-600 text-blue-600 bg-blue-600/10" : "th-border-secondary th-text-tertiary"
            }`}
          >
            {present ? "− " : "+ "}
            {ZONE_LABELS[zone]}
          </button>
        );
      })}
    </div>
  );
}

export function zonesToSafeZoneMap(
  zones: Partial<Record<ZoneKey, Rect>>,
  extras?: Pick<SafeZoneMap, "avoid" | "watermark">
): SafeZoneMap {
  return { zones, avoid: extras?.avoid, watermark: extras?.watermark };
}
