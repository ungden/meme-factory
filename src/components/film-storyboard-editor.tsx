"use client";
import type { FilmStoryboard, StoryboardBeat } from "@/lib/film-storyboard";

export function FilmStoryboardEditor({
  board,
  characters,
  onChange,
  control,
}: {
  board: FilmStoryboard;
  characters: { id: string; name: string }[];
  onChange: (board: FilmStoryboard) => void;
  control: string;
}) {
  const edit = (index: number, patch: Partial<StoryboardBeat>) =>
    onChange({
      ...board,
      beats: board.beats.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    });
  return (
    <section aria-label="Storyboard 15 giây" className="space-y-3">
      <p className="text-xs th-text-secondary">
        Các nhịp dưới đây được tạo trong cùng một clip 15 giây. Mốc giây là dự
        kiến; phụ đề sẽ lấy từ tiếng thực tế.
      </p>
      {board.beats.map((beat, i) => (
        <div key={i} className="space-y-2 border-l-2 th-border pl-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold th-text-accent">
              {beat.startSeconds.toFixed(1)}–{beat.endSeconds.toFixed(1)}s
            </span>
            <select
              aria-label={`Người nói nhịp ${i + 1}`}
              className={control}
              value={beat.speakerCharacterId || ""}
              onChange={(e) =>
                edit(i, { speakerCharacterId: e.target.value || null })
              }
            >
              <option value="">Không thoại</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            aria-label={`Lời thoại nhịp ${i + 1}`}
            className={`${control} min-h-16`}
            value={beat.dialogue}
            placeholder="Không thoại: để trống"
            onChange={(e) => edit(i, { dialogue: e.target.value })}
          />
          <label className="block text-xs th-text-secondary">
            Hành động
            <textarea
              className={`${control} mt-1`}
              value={beat.action}
              onChange={(e) => edit(i, { action: e.target.value })}
            />
          </label>
          <details className="text-xs th-text-secondary">
            <summary>Góc máy và chuyển động</summary>
            <label className="mt-2 block">
              Góc máy
              <input
                className={control}
                value={beat.camera}
                onChange={(e) => edit(i, { camera: e.target.value })}
              />
            </label>
            <label className="mt-2 block">
              Chuyển động
              <textarea
                className={control}
                value={beat.motion}
                onChange={(e) => edit(i, { motion: e.target.value })}
              />
            </label>
          </details>
        </div>
      ))}
    </section>
  );
}
