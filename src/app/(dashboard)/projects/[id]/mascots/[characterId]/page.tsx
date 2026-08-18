"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Archive, Check, ChevronLeft, Dna, Grid2x2, Images, Sparkles, Type } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import BasePackWizard from "@/components/templates/base-pack-wizard";
import { LAYOUT_PRESET_LABELS } from "@/lib/meme-layout-presets";
import { useBaseImages, useCharacterDna, useExpressionTags } from "@/lib/use-templates";
import { useCharacters, useMemes, useProject } from "@/lib/use-store";
import type { BaseImageStatus, LayoutPresetId } from "@/types/database";

type Tab = "reactions" | "layouts" | "memes" | "dna";

const TABS: { id: Tab; label: string; icon: typeof Grid2x2 }[] = [
  { id: "reactions", label: "Biểu cảm", icon: Grid2x2 },
  { id: "layouts", label: "Bố cục", icon: Images },
  { id: "memes", label: "Meme đã làm", icon: Type },
  { id: "dna", label: "Character DNA", icon: Dna },
];

export default function MascotDetailPage() {
  const params = useParams<{ id: string; characterId: string }>();
  const projectRef = params.id;
  const characterId = params.characterId;
  const toast = useToast();

  const { project } = useProject(projectRef);
  const { characters, reload: reloadCharacters } = useCharacters(projectRef);
  const { baseImages, reload, updateBaseImage } = useBaseImages(projectRef, "all");
  const { memes } = useMemes(projectRef);
  const expressionTags = useExpressionTags();
  const { dna, save: saveDna } = useCharacterDna(characterId);

  const [tab, setTab] = useState<Tab>("reactions");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [dnaDraft, setDnaDraft] = useState<string | null>(null);
  const [savingDna, setSavingDna] = useState(false);

  const character = characters.find((entry) => entry.id === characterId);
  const images = useMemo(
    () => baseImages.filter((image) => image.character_id === characterId),
    [baseImages, characterId]
  );
  const relatedMemes = useMemo(() => {
    const ids = new Set(images.map((image) => image.id));
    return memes.filter((meme) => meme.base_image_id && ids.has(meme.base_image_id));
  }, [memes, images]);

  const labelBySlug = useMemo(
    () => new Map(expressionTags.map((tag) => [tag.slug, tag.label_vi])),
    [expressionTags]
  );

  const byLayout = useMemo(() => {
    const groups = new Map<LayoutPresetId, typeof images>();
    for (const image of images) {
      groups.set(image.layout_preset_id, [...(groups.get(image.layout_preset_id) ?? []), image]);
    }
    return groups;
  }, [images]);

  const setStatus = async (id: string, status: BaseImageStatus) => {
    try {
      await updateBaseImage(id, { status });
      toast.success(status === "ready" ? "Đã duyệt làm template" : "Đã lưu trữ ảnh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được");
    }
  };

  const readyCount = images.filter((image) => image.status === "ready").length;

  if (!character) {
    return (
      <div className="flex">
        <Sidebar projectId={projectRef} projectName={project?.name} />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <p className="th-text-tertiary">Đang tải mascot…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar projectId={projectRef} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <Link href={`/projects/${projectRef}/mascots`} className="mb-4 inline-flex items-center gap-1 text-sm th-text-tertiary hover:th-text-primary">
          <ChevronLeft size={15} /> Tất cả mascot
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl th-bg-tertiary">
              {character.avatar_url ? (
                <Image src={character.avatar_url} alt={character.name} fill sizes="80px" className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl th-text-tertiary">
                  {character.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold th-text-primary">{character.name}</h1>
              <p className="th-text-tertiary mt-0.5 text-sm">
                {readyCount} template sẵn sàng · {images.length} ảnh nền · {relatedMemes.length} meme đã làm
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setWizardOpen(true)}>
              <Sparkles size={16} /> Tạo bộ biểu cảm
            </Button>
            <Link href={`/projects/${projectRef}/editor`}>
              <Button variant="outline">
                <Type size={16} /> Ghép chữ
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-5 flex gap-1 border-b th-border-secondary">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                tab === entry.id ? "border-blue-600 text-blue-600" : "border-transparent th-text-tertiary"
              }`}
            >
              <entry.icon size={15} />
              {entry.label}
            </button>
          ))}
        </div>

        {tab === "reactions" && (
          images.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center th-text-tertiary">
                Mascot này chưa có ảnh nền nào. Bấm “Tạo bộ biểu cảm” để sinh một lượt.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((image) => (
                <Card key={image.id}>
                  <div className="relative aspect-square overflow-hidden rounded-t-2xl th-bg-tertiary">
                    <Image src={image.image_url} alt={image.expression_slug} fill sizes="180px" className="object-cover" unoptimized />
                    {image.status !== "ready" && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {image.status === "draft" ? "Nháp" : "Lưu trữ"}
                      </span>
                    )}
                  </div>
                  <CardContent className="space-y-1.5 py-2">
                    <p className="truncate text-xs font-medium th-text-primary">
                      {image.expression_label || labelBySlug.get(image.expression_slug) || image.expression_slug}
                    </p>
                    <p className="truncate text-[10px] th-text-tertiary">
                      {LAYOUT_PRESET_LABELS[image.layout_preset_id] ?? image.layout_preset_id} · {image.aspect_ratio}
                    </p>
                    <div className="flex gap-1">
                      {image.status !== "ready" ? (
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(image.id, "ready")}>
                          <Check size={12} /> Duyệt
                        </Button>
                      ) : (
                        <Link href={`/projects/${projectRef}/editor?base=${image.id}`} className="flex-1">
                          <Button size="sm" variant="outline" className="w-full">
                            <Type size={12} /> Ghép chữ
                          </Button>
                        </Link>
                      )}
                      {image.status !== "archived" && (
                        <Button size="sm" variant="ghost" aria-label="Lưu trữ" onClick={() => setStatus(image.id, "archived")}>
                          <Archive size={12} />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}

        {tab === "layouts" && (
          <div className="space-y-5">
            {[...byLayout.entries()].map(([layout, group]) => (
              <Card key={layout}>
                <CardHeader className="flex items-center justify-between">
                  <span className="text-sm font-semibold th-text-primary">
                    {LAYOUT_PRESET_LABELS[layout] ?? layout}
                  </span>
                  <span className="text-xs th-text-tertiary">{group.length} ảnh</span>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {group.map((image) => (
                      <div key={image.id} className="relative aspect-square overflow-hidden rounded-lg th-bg-tertiary">
                        <Image src={image.image_url} alt={image.expression_slug} fill sizes="100px" className="object-cover" unoptimized />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {byLayout.size === 0 && (
              <Card>
                <CardContent className="py-10 text-center th-text-tertiary">Chưa có bố cục nào.</CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === "memes" && (
          relatedMemes.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center th-text-tertiary">
                Chưa có meme nào được ghép từ mascot này.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {relatedMemes.map((meme) => (
                <Link key={meme.id} href={`/projects/${projectRef}/editor?meme=${meme.id}`}>
                  <div className="relative aspect-square overflow-hidden rounded-xl th-bg-tertiary">
                    {meme.image_url && (
                      <Image src={meme.image_url} alt={meme.original_idea} fill sizes="180px" className="object-cover" unoptimized />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {tab === "dna" && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold th-text-primary">Character DNA</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs th-text-tertiary">
                Ghi lại những đặc điểm phải giữ nguyên qua mọi ảnh. Nội dung này đi kèm mô tả nhân vật khi tạo bộ
                biểu cảm mới.
              </p>
              <Textarea
                rows={6}
                value={dnaDraft ?? dna?.summary ?? ""}
                placeholder="Ví dụ: bò vàng, sừng cong ngắn, mắt to tròn, luôn mặc áo hoodie xanh cobalt…"
                onChange={(event) => setDnaDraft(event.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  loading={savingDna}
                  onClick={async () => {
                    setSavingDna(true);
                    try {
                      await saveDna({ summary: dnaDraft ?? dna?.summary ?? "" });
                      toast.success("Đã lưu Character DNA");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
                    } finally {
                      setSavingDna(false);
                    }
                  }}
                >
                  Lưu
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {project && (
          <BasePackWizard
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            projectId={project.id}
            character={{
              id: character.id,
              name: character.name,
              description: [character.description, dna?.summary].filter(Boolean).join(". "),
              personality: character.personality,
            }}
            projectStyle={project.style_prompt}
            onSaved={() => {
              reload();
              reloadCharacters();
            }}
          />
        )}
      </main>
    </div>
  );
}
