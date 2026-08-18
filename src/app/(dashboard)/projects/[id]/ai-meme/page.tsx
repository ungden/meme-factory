"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, RefreshCw, Shuffle, Sparkles, Type } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useBaseImages, type BaseImageWithCharacter } from "@/lib/use-templates";
import { useProject } from "@/lib/use-store";
import type { MemeContent } from "@/types/database";

interface Suggestion {
  headline: string;
  caption?: string;
  tone?: string;
  emotion?: string;
  baseImage: BaseImageWithCharacter | null;
}

const TONES = ["Hài hước", "Châm biếm", "Tự nhạo", "Tình cảm"];
const SURPRISE_PROMPTS = [
  "Khách nói sửa nhẹ thôi",
  "Deadline gấp nhưng khách đổi ý",
  "Gửi file lúc 11:59 PM",
  "Sếp bảo họp nhanh 5 phút",
  "Em tưởng đã chốt rồi",
];

/**
 * Text-only AI. Every card reuses an already-generated base image, so a batch of
 * six suggestions costs zero points.
 */
export default function AiMemePage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;
  const toast = useToast();

  const { project } = useProject(projectRef);
  const { baseImages } = useBaseImages(projectRef, "ready");

  const [situation, setSituation] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const byExpression = useMemo(() => {
    const map = new Map<string, BaseImageWithCharacter[]>();
    for (const image of baseImages) {
      map.set(image.expression_slug, [...(map.get(image.expression_slug) ?? []), image]);
    }
    return map;
  }, [baseImages]);

  /** Auto Reaction: the emotion the text model suggested picks the artwork. */
  const pickBaseImage = useCallback(
    (emotion: string | undefined, index: number): BaseImageWithCharacter | null => {
      if (baseImages.length === 0) return null;
      const matches = emotion ? byExpression.get(emotion) : undefined;
      if (matches && matches.length > 0) return matches[index % matches.length];
      return baseImages[index % baseImages.length];
    },
    [baseImages, byExpression]
  );

  const generate = useCallback(async () => {
    if (!project?.id) return;
    const idea = situation.trim();
    if (!idea) {
      toast.error("Kể một tình huống trước đã");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/ai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          idea: `${idea} (Tone: ${tone})`,
          num_variations: 6,
          noCharacters: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Không tạo được gợi ý");

      const variations = (data?.variations ?? []) as {
        content?: MemeContent;
        headline?: string;
        tone?: string;
        suggested_characters?: { suggested_emotion?: string }[];
      }[];

      setSuggestions(
        variations.map((variation, index) => {
          const emotion = variation.suggested_characters?.[0]?.suggested_emotion;
          return {
            headline: variation.content?.headline || variation.headline || "",
            caption: variation.content?.caption,
            tone: variation.content?.tone || variation.tone,
            emotion,
            baseImage: pickBaseImage(emotion, index),
          };
        })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tạo được gợi ý");
    } finally {
      setLoading(false);
    }
  }, [project?.id, situation, tone, pickBaseImage, toast]);

  const swapMascot = (index: number) => {
    setSuggestions((current) =>
      current.map((suggestion, i) => {
        if (i !== index || baseImages.length === 0) return suggestion;
        const currentIndex = baseImages.findIndex((image) => image.id === suggestion.baseImage?.id);
        return { ...suggestion, baseImage: baseImages[(currentIndex + 1) % baseImages.length] };
      })
    );
  };

  return (
    <div className="flex">
      <Sidebar projectId={projectRef} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold th-text-primary">AI Meme</h1>
          <p className="th-text-tertiary mt-1">
            Kể một tình huống, nhận sáu câu kèm biểu cảm phù hợp. Chỉ dùng AI văn bản nên không tốn điểm.
          </p>
        </div>

        <Card className="mb-5">
          <CardContent className="space-y-3 py-4">
            <Textarea
              rows={3}
              maxLength={300}
              value={situation}
              placeholder="Chuyện gì vừa xảy ra? Ví dụ: khách nói sửa nhẹ thôi…"
              onChange={(event) => setSituation(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              {TONES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTone(option)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    tone === option
                      ? "border-blue-600 text-blue-600 bg-blue-600/10"
                      : "th-border-secondary th-text-tertiary"
                  }`}
                >
                  {option}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSituation(SURPRISE_PROMPTS[Math.floor(Math.random() * SURPRISE_PROMPTS.length)])}
                >
                  <Shuffle size={16} /> Gợi ý tình huống
                </Button>
                <Button onClick={generate} loading={loading}>
                  <Sparkles size={16} /> Tạo 6 gợi ý
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {baseImages.length === 0 && (
          <Card className="mb-5">
            <CardContent className="py-6 text-center th-text-tertiary">
              Chưa có ảnh nền nào được duyệt, nên gợi ý sẽ không kèm hình. Vào Mascot để tạo bộ biểu cảm trước.
            </CardContent>
          </Card>
        )}

        {loading && suggestions.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin th-text-accent" size={24} />
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((suggestion, index) => (
              <Card key={`${suggestion.headline}-${index}`}>
                <CardHeader className="flex items-center justify-between">
                  <span className="text-xs th-text-tertiary">Gợi ý {index + 1}</span>
                  {suggestion.tone && (
                    <span className="rounded-full th-bg-tertiary px-2 py-0.5 text-[10px] th-text-tertiary">
                      {suggestion.tone}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl th-bg-tertiary">
                      {suggestion.baseImage ? (
                        <Image
                          src={suggestion.baseImage.image_url}
                          alt={suggestion.headline}
                          fill
                          sizes="80px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] th-text-tertiary">
                          chưa có ảnh
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold th-text-primary">{suggestion.headline}</p>
                      {suggestion.caption && (
                        <p className="mt-1 line-clamp-3 text-xs th-text-tertiary">{suggestion.caption}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Link
                      href={`/projects/${projectRef}/editor?${new URLSearchParams({
                        ...(suggestion.baseImage ? { base: suggestion.baseImage.id } : {}),
                        text: suggestion.headline,
                      }).toString()}`}
                      className="flex-1"
                    >
                      <Button size="sm" className="w-full">
                        <Type size={14} /> Mở trong editor
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" onClick={() => swapMascot(index)} disabled={baseImages.length < 2}>
                      <RefreshCw size={14} /> Đổi mascot
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
