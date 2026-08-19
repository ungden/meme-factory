"use client";

import { Crop, Ruler, Type, Stamp } from "lucide-react";
import { canvasSize } from "@/lib/meme-doc/render";
import type { MemeDoc, TextStyle } from "@/lib/meme-doc/types";

const ZONE_LABELS: Record<string, string> = {
  top: "trên",
  center: "giữa",
  bottom: "dưới",
  side: "bên cạnh",
};

function Row({
  icon,
  title,
  value,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 th-text-tertiary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium th-text-primary">{title}</p>
        <p className="text-xs th-text-secondary">{value}</p>
        {hint && <p className="text-[11px] th-text-tertiary">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Surfaces what the artwork itself dictates: where text may go, how long it should
 * be, and which corner the watermark is meant to sit in.
 */
export default function TemplateInfo({ doc, style }: { doc: MemeDoc; style?: TextStyle }) {
  const { width, height } = canvasSize(doc);
  const zones = doc.meta.safeZonesSnapshot;
  const zoneNames = Object.keys(zones?.zones ?? {})
    .map((name) => ZONE_LABELS[name] ?? name)
    .join(", ");

  const minPx = style ? Math.round(style.minFontSize * height) : null;
  const maxPx = style ? Math.round(style.maxFontSize * height) : null;
  const watermarkRect = zones?.watermark;

  return (
    <div className="space-y-3">
      <Row
        icon={<Crop size={14} />}
        title="Vùng an toàn"
        value={zoneNames || "chưa đặt"}
        hint="Giữ chữ trong vùng kẻ chấm khi bật xem trước."
      />
      <Row
        icon={<Ruler size={14} />}
        title="Độ dài nên dùng"
        value={doc.meta.recommendedChars ? `khoảng ${doc.meta.recommendedChars} ký tự` : "chưa có gợi ý"}
        hint="Dài hơn thì chữ tự co lại cho vừa khung."
      />
      <Row
        icon={<Type size={14} />}
        title="Cỡ chữ hợp lý"
        value={minPx && maxPx ? `${minPx}–${maxPx}px` : "—"}
        hint={`Tính trên khung xuất ${width}×${height}px.`}
      />
      <Row
        icon={<Stamp size={14} />}
        title="Vùng watermark"
        value={
          watermarkRect
            ? `${Math.round(watermarkRect.x * 100)}%, ${Math.round(watermarkRect.y * 100)}% · rộng ${Math.round(
                watermarkRect.w * 100
              )}%`
            : "góc dưới bên phải"
        }
        hint="Tránh đặt chi tiết quan trọng vào đây."
      />
    </div>
  );
}
