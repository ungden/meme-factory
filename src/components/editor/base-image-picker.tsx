"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Chip from "@/components/ui/chip";
import type { BaseImageWithCharacter } from "@/lib/use-templates";
import type { ExpressionTag } from "@/types/database";

interface BaseImagePickerProps {
  baseImages: BaseImageWithCharacter[];
  expressionTags: ExpressionTag[];
  selectedId: string | null;
  onSelect: (baseImage: BaseImageWithCharacter) => void;
}

const UNASSIGNED = "__unassigned__";

export default function BaseImagePicker({
  baseImages,
  expressionTags,
  selectedId,
  onSelect,
}: BaseImagePickerProps) {
  const [characterId, setCharacterId] = useState<string | "all">("all");

  const characters = useMemo(() => {
    const seen = new Map<string, string>();
    // A template need not belong to a mascot; those group under "Không gắn nhân vật".
    for (const image of baseImages) {
      seen.set(image.character_id ?? UNASSIGNED, image.character_name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [baseImages]);

  const labelBySlug = useMemo(
    () => new Map(expressionTags.map((tag) => [tag.slug, tag.label_vi])),
    [expressionTags]
  );

  const visible =
    characterId === "all"
      ? baseImages
      : baseImages.filter((image) => (image.character_id ?? UNASSIGNED) === characterId);

  if (baseImages.length === 0) {
    return (
      <p className="text-sm th-text-tertiary">
        Kênh chưa có mẫu meme nào. Thêm ảnh ở trang Mẫu meme, hoặc vẽ bộ biểu cảm cho một nhân vật.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {characters.length > 1 && (
        <div role="radiogroup" aria-label="Nhân vật" className="flex flex-wrap gap-1.5">
          <Chip role="radio" selected={characterId === "all"} onClick={() => setCharacterId("all")}>
            Tất cả
          </Chip>
          {characters.map((character) => (
            <Chip key={character.id} role="radio" selected={characterId === character.id} onClick={() => setCharacterId(character.id)}>
              {character.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {visible.map((image) => {
          const label = image.expression_label || labelBySlug.get(image.expression_slug) || image.expression_slug;
          return (
            <button
              key={image.id}
              type="button"
              title={label}
              onClick={() => onSelect(image)}
              className={`group overflow-hidden rounded-xl border-2 transition-colors ${
                selectedId === image.id ? "th-border-accent" : "th-border-secondary th-border-accent-hover"
              }`}
            >
              <div className="relative aspect-square th-bg-tertiary">
                <Image
                  src={image.image_url}
                  alt={label}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <span className="block truncate px-1.5 py-1 text-xs th-text-tertiary">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
