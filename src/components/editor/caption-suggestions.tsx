"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { PenLine, Shuffle, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import Input from "@/components/ui/input";
import type { MemeContent } from "@/types/database";

interface Suggestion {
  text: string;
  emotion?: string;
}

export interface MatchedImage {
  id: string;
  image_url: string;
  label: string;
}

interface CaptionSuggestionsProps {
  projectId: string;
  seed: string;
  recommendedChars?: number;
  onPick: (text: string) => void;
  /** Mẫu meme hợp với biểu cảm của câu, nếu kênh có. */
  matchImage?: (emotion: string | undefined, index: number) => MatchedImage | null;
  onPickImage?: (baseImageId: string) => void;
  selectedImageId?: string | null;
}

const TONES = ["Hài hước", "Châm biếm", "Tự nhạo", "Tình cảm"];
const SITUATIONS = [
  "Khách nói sửa nhẹ thôi",
  "Việc gấp nhưng khách đổi ý",
  "Gửi file lúc 11 giờ 59 đêm",
  "Sếp bảo họp nhanh 5 phút",
  "Em tưởng đã chốt rồi",
];
const FALLBACK_LINES = ["Ủa em?", "Làm lại nha", "Khách nói sửa nhẹ", "Họp nhanh 5 phút", "Em tưởng chốt rồi"];

/**
 * Gợi ý câu cho Ghép chữ. Gộp trang "gợi ý 6 câu" cũ vào đây, vì câu nào
 * cũng chỉ để dán lên một mẫu meme. Gợi ý dùng /api/ai/generate-content nên
 * không tốn điểm (POINT_COSTS.content là 0).
 */
export default function CaptionSuggestions({
  projectId,
  seed,
  recommendedChars,
  onPick,
  matchImage,
  onPickImage,
  selectedImageId,
}: CaptionSuggestionsProps) {
  const [lines, setLines] = useState<Suggestion[]>(FALLBACK_LINES.map((text) => ({ text })));
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState<number | null>(null);
  const [situation, setSituation] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [error, setError] = useState("");

  const ask = useCallback(
    async (idea: string, count: number) => {
      const response = await fetch("/api/ai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, idea, tone, num_variations: count, noCharacters: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Chưa gợi ý được. Bạn thử lại nhé.");
      return ((data?.variations ?? []) as {
        content?: MemeContent;
        headline?: string;
        suggested_characters?: { suggested_emotion?: string }[];
      }[])
        .map((variation) => ({
          text: variation.content?.headline || variation.headline || "",
          emotion: variation.suggested_characters?.[0]?.suggested_emotion,
        }))
        .filter((line) => line.text);
    },
    [projectId, tone],
  );

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const next = await ask(situation.trim() || seed.trim() || "tình huống công sở hài hước", 6);
      if (next.length > 0) {
        // Câu vừa khung chữ của ảnh này lên trước.
        const target = recommendedChars ?? 46;
        next.sort((a, b) => Math.abs(a.text.length - target) - Math.abs(b.text.length - target));
        setLines(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa gợi ý được. Bạn thử lại nhé.");
    } finally {
      setLoading(false);
    }
  }, [projectId, ask, situation, seed, recommendedChars]);

  const rewrite = useCallback(
    async (index: number) => {
      const current = lines[index];
      if (!current) return;
      setRewriting(index);
      setError("");
      try {
        const fresh = (await ask(`${situation.trim() || seed.trim()}. Viết lại câu "${current.text}" theo cách khác hẳn, giữ nguyên ý.`, 2))
          .find((line) => line.text !== current.text);
        if (fresh) setLines((rows) => rows.map((row, i) => (i === index ? { ...fresh, emotion: fresh.emotion ?? row.emotion } : row)));
        else setError("Câu mới trùng câu cũ. Bạn thử lại nhé.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Chưa viết lại được. Bạn thử lại nhé.");
      } finally {
        setRewriting(null);
      }
    },
    [ask, lines, situation, seed],
  );

  return (
    <div className="space-y-3">
      <Input
        value={situation}
        onChange={(event) => setSituation(event.target.value)}
        maxLength={300}
        aria-label="Chuyện gì vừa xảy ra?"
        placeholder="Chuyện gì vừa xảy ra? Ví dụ: khách nói sửa nhẹ thôi…"
        className="text-sm"
      />
      <div role="radiogroup" aria-label="Giọng" className="flex flex-wrap gap-1.5">
        {TONES.map((option) => (
          <Chip key={option} role="radio" selected={tone === option} onClick={() => setTone(option)}>
            {option}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={refresh} loading={loading} disabled={!projectId}>
          <Sparkles size={14} aria-hidden /> Gợi ý 6 ý
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSituation(SITUATIONS[Math.floor(Math.random() * SITUATIONS.length)])}
        >
          <Shuffle size={14} aria-hidden /> Gợi ý tình huống
        </Button>
      </div>
      {error && <p className="text-xs th-text-danger" role="alert">{error}</p>}
      <ul className="space-y-1.5">
        {lines.map((line, index) => {
          const match = matchImage?.(line.emotion, index) ?? null;
          return (
            <li key={`${line.text}-${index}`} className="flex items-center gap-2 rounded-xl border p-1.5 th-border">
              {match && onPickImage && (
                <button
                  type="button"
                  onClick={() => onPickImage(match.id)}
                  aria-label={`Dùng ảnh ${match.label}`}
                  title={`Dùng ảnh ${match.label}`}
                  className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border-2 ${
                    selectedImageId === match.id ? "th-border-accent" : "border-transparent"
                  }`}
                >
                  <Image src={match.image_url} alt="" fill sizes="40px" className="object-cover" unoptimized />
                </button>
              )}
              <button
                type="button"
                onClick={() => onPick(line.text)}
                className="min-h-9 flex-1 rounded-lg px-2 text-left text-sm th-text-primary th-bg-hover"
              >
                {line.text}
              </button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Viết lại câu này"
                title="Viết lại câu này"
                loading={rewriting === index}
                onClick={() => rewrite(index)}
                disabled={!projectId}
              >
                {rewriting === index ? null : <PenLine size={14} aria-hidden />}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs th-text-tertiary">Bấm một câu để đặt lên ảnh. Gợi ý câu không tốn điểm.</p>
    </div>
  );
}
