"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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
    // A template need not belong to a mascot; those group under "Không gắn mascot".
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
        Dự án chưa có ảnh mascot nào. Vào Tài nguyên để thêm pose hoặc tạo bộ biểu cảm trước.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {characters.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCharacterId("all")}
            className={`rounded-full border px-3 py-1 text-xs ${
              characterId === "all" ? "border-blue-600 text-blue-600 bg-blue-600/10" : "th-border-secondary th-text-tertiary"
            }`}
          >
            Tất cả
          </button>
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => setCharacterId(character.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                characterId === character.id
                  ? "border-blue-600 text-blue-600 bg-blue-600/10"
                  : "th-border-secondary th-text-tertiary"
              }`}
            >
              {character.name}
            </button>
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
                selectedId === image.id ? "border-blue-600" : "th-border-secondary hover:border-blue-400"
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
              <span className="block truncate px-1.5 py-1 text-[10px] th-text-tertiary">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
