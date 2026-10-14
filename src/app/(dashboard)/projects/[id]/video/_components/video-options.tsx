"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Volume2 } from "lucide-react";
import Chip from "@/components/ui/chip";
import Select from "@/components/ui/select";
import Textarea from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/page";
import { SEEDANCE_VARIANTS, seedanceMaxDuration } from "@/lib/video-models";
import {
  ASPECTS,
  ASPECT_LABEL,
  DURATIONS,
  RESOLUTIONS,
  fitDuration,
  optionsSummary,
  type DraftFields,
} from "./video-flow";

type Candidate = { id: string; label: string; url: string; memeId: string | null };

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium th-text-primary">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {children}
      </div>
    </fieldset>
  );
}

/**
 * "Tuỳ chọn thêm" của trang Video: mặc định đóng, vì mọi thứ trong này đã có
 * giá trị hợp lý. Người dùng chỉ mở khi muốn đổi.
 */
export default function VideoOptions({
  open,
  onToggle,
  fields,
  onChange,
  candidates,
  candidatesLoading,
  characters,
  speakers,
  charactersHref,
}: {
  open: boolean;
  onToggle: () => void;
  fields: DraftFields;
  onChange: (patch: Partial<DraftFields>) => void;
  candidates: Candidate[];
  candidatesLoading: boolean;
  characters: { id: string; name: string }[];
  speakers: Set<string>;
  charactersHref: string;
}) {
  const mode = fields.opening ? "image" : "text";
  const voiced = characters.filter((character) => speakers.has(character.id));
  return (
    <div className="rounded-2xl border th-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium th-text-primary">Tuỳ chọn thêm</span>
          <span className="block truncate text-xs th-text-tertiary">{optionsSummary({ ...fields, mode })}</span>
        </span>
        <ChevronDown size={16} aria-hidden className={`shrink-0 th-text-tertiary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-5 border-t th-border px-4 py-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium th-text-primary">Mở đầu bằng ảnh</legend>
            <p className="text-xs th-text-tertiary">
              Video bắt đầu đúng từ ảnh này và cùng khổ với ảnh. Bỏ trống thì AIDA vẽ cảnh mới theo nhân vật và ảnh mẫu.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {candidatesLoading && !candidates.length
                ? [1, 2, 3].map((item) => <Skeleton key={item} className="aspect-square rounded-xl" />)
                : candidates.slice(0, 10).map((item) => {
                    const selected = fields.opening?.url === item.url;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange({ opening: selected ? null : { url: item.url, memeId: item.memeId } })}
                        className={`relative aspect-square overflow-hidden rounded-xl border th-bg-tertiary ${selected ? "th-border-accent ring-2 th-ring-accent" : "th-border"}`}
                      >
                        <Image src={item.url} alt={item.label} fill sizes="120px" className="object-cover" />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-left text-xs text-white">{item.label}</span>
                      </button>
                    );
                  })}
            </div>
            {!candidatesLoading && !candidates.length && (
              <p className="text-xs th-text-tertiary">Kênh chưa có ảnh nào. Làm một meme trước rồi quay lại đây nhé.</p>
            )}
          </fieldset>

          <Group legend="Chất lượng">
            {SEEDANCE_VARIANTS.map((item) => (
              <Chip
                key={item.id}
                role="radio"
                selected={fields.model === item.id}
                title={item.customerNote}
                onClick={() => onChange({ model: item.id, duration: fitDuration(fields.duration, item.id) })}
              >
                {item.customerLabel}
              </Chip>
            ))}
          </Group>
          <p className="-mt-3 text-xs th-text-tertiary">
            {SEEDANCE_VARIANTS.find((item) => item.id === fields.model)?.customerNote}
          </p>

          <Group legend="Thời lượng">
            {DURATIONS.filter((value) => value <= seedanceMaxDuration(fields.model)).map((value) => (
              <Chip key={value} role="radio" selected={fields.duration === value} onClick={() => onChange({ duration: value })}>
                {value} giây
              </Chip>
            ))}
          </Group>

          {mode === "text" && (
            <Group legend="Khổ video">
              {ASPECTS.map((value) => (
                <Chip key={value} role="radio" selected={fields.aspect === value} onClick={() => onChange({ aspect: value })}>
                  {ASPECT_LABEL[value]}
                </Chip>
              ))}
            </Group>
          )}

          <Group legend="Độ nét">
            {RESOLUTIONS.map((value) => (
              <Chip key={value} role="radio" selected={fields.resolution === value} onClick={() => onChange({ resolution: value })}>
                {value}
              </Chip>
            ))}
          </Group>

          <div className="flex flex-col gap-2">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium th-text-primary">
              <input
                type="checkbox"
                checked={fields.audio}
                disabled={!voiced.length}
                onChange={(event) =>
                  onChange({
                    audio: event.target.checked,
                    speaker: fields.speaker && speakers.has(fields.speaker) ? fields.speaker : voiced[0]?.id || "",
                  })
                }
                className="h-4 w-4 th-accent-control"
              />
              <Volume2 size={16} aria-hidden /> Lồng tiếng
            </label>
            {!voiced.length ? (
              <p className="text-xs th-text-tertiary">
                Chưa nhân vật nào có giọng nói.{" "}
                <Link href={charactersHref} className="th-text-accent hover:underline">
                  Chọn giọng cho nhân vật
                </Link>{" "}
                rồi quay lại nhé.
              </p>
            ) : (
              fields.audio && (
                <div className="flex flex-col gap-3">
                  <Select
                    id="video-speaker"
                    label="Ai nói?"
                    value={fields.speaker}
                    onChange={(event) => onChange({ speaker: event.target.value })}
                  >
                    {voiced.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    id="video-dialogue"
                    label="Lời nói"
                    rows={3}
                    className="min-h-20"
                    placeholder="Lời nói tiếng Việt…"
                    value={fields.dialogue}
                    onChange={(event) => onChange({ dialogue: event.target.value })}
                  />
                  <p className="text-xs th-text-tertiary">
                    Video chỉ có một người nói. Cần nhiều người đối đáp thì làm Phim ngắn. Miệng có thể không khớp lời.
                  </p>
                </div>
              )
            )}
          </div>

          <Textarea
            id="video-caption"
            label="Nội dung bài đăng (không hiện trong video)"
            rows={3}
            className="min-h-20"
            placeholder="Bấm “Gợi ý kịch bản” để có sẵn nội dung bài đăng."
            value={fields.caption}
            onChange={(event) => onChange({ caption: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export type { Candidate };
