"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Plus, Search, Sparkles } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent } from "@/components/ui/card";
import { LAYOUT_PRESET_LABELS } from "@/lib/meme-layout-presets";
import { useBaseImages } from "@/lib/use-templates";
import { useCharacters, useProject } from "@/lib/use-store";
import type { LayoutPresetId } from "@/types/database";

type Filter = "all" | "ready" | "draft";

export default function MascotsPage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;

  const { project } = useProject(projectRef);
  const { characters, loading } = useCharacters(projectRef);
  const { baseImages } = useBaseImages(projectRef, "all");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const statsByCharacter = useMemo(() => {
    const stats = new Map<string, { ready: number; draft: number; layouts: Set<LayoutPresetId>; cover?: string }>();
    for (const image of baseImages) {
      const entry = stats.get(image.character_id) ?? { ready: 0, draft: 0, layouts: new Set<LayoutPresetId>() };
      if (image.status === "ready") entry.ready += 1;
      if (image.status === "draft") entry.draft += 1;
      entry.layouts.add(image.layout_preset_id);
      if (!entry.cover) entry.cover = image.image_url;
      stats.set(image.character_id, entry);
    }
    return stats;
  }, [baseImages]);

  const visible = characters.filter((character) => {
    if (!character.name.toLowerCase().includes(search.toLowerCase())) return false;
    const stats = statsByCharacter.get(character.id);
    if (filter === "ready") return (stats?.ready ?? 0) > 0;
    if (filter === "draft") return (stats?.draft ?? 0) > 0;
    return true;
  });

  return (
    <div className="flex">
      <Sidebar projectId={projectRef} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Mascot</h1>
            <p className="th-text-tertiary mt-1">
              Thư viện nhân vật của dự án và bộ biểu cảm dùng để ghép chữ.
            </p>
          </div>
          <Link href={`/projects/${projectRef}/characters`}>
            <Button>
              <Plus size={16} />
              Thêm mascot
            </Button>
          </Link>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-tertiary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm mascot…"
              className="w-full rounded-xl border th-border-secondary th-bg-tertiary py-2 pl-9 pr-3 text-sm th-text-primary outline-none"
            />
          </div>
          {([
            { value: "all", label: "Tất cả" },
            { value: "ready", label: "Có template" },
            { value: "draft", label: "Còn nháp" },
          ] as { value: Filter; label: string }[]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                filter === option.value
                  ? "border-blue-600 text-blue-600 bg-blue-600/10"
                  : "th-border-secondary th-text-tertiary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="th-text-tertiary">Đang tải…</p>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="th-text-tertiary">
                Chưa có mascot nào khớp. Tạo mascot ở mục Tài nguyên rồi quay lại đây tạo bộ biểu cảm.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((character) => {
              const stats = statsByCharacter.get(character.id);
              const cover = character.avatar_url || stats?.cover;
              return (
                <Link key={character.id} href={`/projects/${projectRef}/mascots/${character.id}`}>
                  <Card className="h-full transition-transform hover:-translate-y-0.5">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl th-bg-tertiary">
                      {cover ? (
                        <Image src={cover} alt={character.name} fill sizes="320px" className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl th-text-tertiary">
                          {character.name[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <CardContent className="space-y-2 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="truncate font-semibold th-text-primary">{character.name}</h2>
                        <span className="shrink-0 text-xs th-text-tertiary">{stats?.ready ?? 0} template</span>
                      </div>
                      <p className="line-clamp-2 text-xs th-text-tertiary">
                        {character.description || "Chưa có mô tả ngoại hình."}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {[...(stats?.layouts ?? [])].map((layout) => (
                          <span key={layout} className="rounded-full th-bg-tertiary px-2 py-0.5 text-[10px] th-text-tertiary">
                            {LAYOUT_PRESET_LABELS[layout] ?? layout}
                          </span>
                        ))}
                        {(stats?.draft ?? 0) > 0 && (
                          <span className="rounded-full th-bg-tertiary px-2 py-0.5 text-[10px] th-text-tertiary">
                            {stats?.draft} nháp
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-6 flex items-center gap-1.5 text-xs th-text-tertiary">
          <Sparkles size={13} />
          Mỗi mascot chỉ tốn điểm một lần khi tạo bộ biểu cảm; ghép chữ sau đó luôn miễn phí.
        </p>
      </main>
    </div>
  );
}
