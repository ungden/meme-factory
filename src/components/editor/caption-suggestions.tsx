"use client";

import { useCallback, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import type { MemeContent } from "@/types/database";

interface CaptionSuggestionsProps {
  projectId: string;
  seed: string;
  recommendedChars?: number;
  onPick: (text: string) => void;
}

const FALLBACK_LINES = [
  "Đổi brief?",
  "Ủa em?",
  "Làm lại nha",
  "Khách nói sửa nhẹ",
  "Họp nhanh 5 phút",
  "Em tưởng chốt rồi",
];

/**
 * Caption ideas come from /api/ai/generate-content, which is text-only and costs
 * nothing (POINT_COSTS.content is 0). No image is generated here.
 */
export default function CaptionSuggestions({
  projectId,
  seed,
  recommendedChars,
  onPick,
}: CaptionSuggestionsProps) {
  const [lines, setLines] = useState<string[]>(FALLBACK_LINES);
  const [loading, setLoading] = useState(false);
  const [situation, setSituation] = useState("");

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          idea: situation.trim() || seed.trim() || "tình huống công sở hài hước",
          num_variations: 6,
          noCharacters: true,
        }),
      });
      const data = await response.json();
      const variations = (data?.variations ?? []) as { content?: MemeContent; headline?: string }[];
      const next = variations
        .map((variation) => variation.content?.headline || variation.headline || "")
        .filter(Boolean);

      if (next.length > 0) {
        // Lines closest to what fits this artwork come first.
        const target = recommendedChars ?? 46;
        next.sort((a, b) => Math.abs(a.length - target) - Math.abs(b.length - target));
        setLines(next);
      }
    } catch {
      // Keep whatever is on screen; suggestions are a convenience, not a dependency.
    } finally {
      setLoading(false);
    }
  }, [projectId, situation, seed, recommendedChars]);

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input
          value={situation}
          onChange={(event) => setSituation(event.target.value)}
          placeholder="Chuyện gì vừa xảy ra?"
          className="flex-1 rounded-lg border th-border-secondary th-bg-tertiary px-3 py-2 text-sm th-text-primary outline-none"
        />
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading || !projectId}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Gợi ý
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {lines.map((line) => (
          <button
            key={line}
            type="button"
            onClick={() => onPick(line)}
            className="rounded-full border th-border-secondary px-3 py-1 text-xs th-text-secondary th-bg-hover"
          >
            {line}
          </button>
        ))}
      </div>
      <p className="flex items-center gap-1 text-[11px] th-text-tertiary">
        <Sparkles size={11} /> Gợi ý câu chỉ dùng AI văn bản — miễn phí.
      </p>
    </div>
  );
}
