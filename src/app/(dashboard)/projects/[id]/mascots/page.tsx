"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  Dna,
  Palette,
  Plus,
  Search,
  Smile,
  Sparkles,
  Star,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent } from "@/components/ui/card";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import BasePackWizard from "@/components/templates/base-pack-wizard";
import { compressImageToBase64 } from "@/lib/image-utils";
import { LAYOUT_PRESET_LABELS } from "@/lib/meme-layout-presets";
import { resolveMascotCover } from "@/lib/mascot-cover";
import { useBaseImages, useExpressionTags } from "@/lib/use-templates";
import { useCharacters, useMemes, useProject } from "@/lib/use-store";
import type { ExpressionTag, LayoutPresetId } from "@/types/database";

type Sort = "popular" | "recent" | "name";
type VibeGroup = ExpressionTag["vibe_group"];

const VIBE_LABELS: Record<VibeGroup, string> = {
  positive: "Tích cực",
  negative: "Tiêu cực",
  neutral: "Trung tính",
  intense: "Mạnh",
  playful: "Tưng tửng",
};

const SORT_LABELS: Record<Sort, string> = {
  popular: "Dùng nhiều nhất",
  recent: "Mới cập nhật",
  name: "Tên A → Z",
};

const BUILD_STEPS = [
  { icon: UploadCloud, title: "Tải phác thảo", detail: "Hoặc logo, ảnh tham khảo" },
  { icon: Smile, title: "Mô tả tính cách", detail: "Ngoại hình và chất riêng" },
  { icon: Sparkles, title: "Sinh biểu cảm", detail: "Cả bộ, chừa sẵn chỗ cho chữ" },
  { icon: Dna, title: "Duyệt Character DNA", detail: "Chốt đặc điểm phải giữ" },
];

interface MascotStats {
  ready: number;
  draft: number;
  layouts: Set<LayoutPresetId>;
  vibes: Set<VibeGroup>;
  memes: number;
}

export default function MascotsPage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;
  const toast = useToast();
  const sketchRef = useRef<HTMLInputElement>(null);

  const { project } = useProject(projectRef);
  const { characters, loading, createCharacter, reload } = useCharacters(projectRef);
  const { baseImages, reload: reloadBaseImages } = useBaseImages(projectRef, "all");
  const { memes } = useMemes(projectRef);
  const expressionTags = useExpressionTags();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [vibeFilter, setVibeFilter] = useState<VibeGroup | null>(null);
  const [layoutFilter, setLayoutFilter] = useState<LayoutPresetId | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ready" | "draft" | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", personality: "" });
  const [sketch, setSketch] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [wizardFor, setWizardFor] = useState<
    { id: string; name: string; description: string; personality: string } | null
  >(null);

  const vibeBySlug = useMemo(
    () => new Map(expressionTags.map((tag) => [tag.slug, tag.vibe_group])),
    [expressionTags]
  );

  // Every facet count below is derived from real rows, not an invented taxonomy.
  const statsByCharacter = useMemo(() => {
    const stats = new Map<string, MascotStats>();
    const memeCountByBaseImage = new Map<string, number>();
    for (const meme of memes) {
      if (!meme.base_image_id) continue;
      memeCountByBaseImage.set(meme.base_image_id, (memeCountByBaseImage.get(meme.base_image_id) ?? 0) + 1);
    }

    for (const image of baseImages) {
      const entry =
        stats.get(image.character_id) ??
        ({ ready: 0, draft: 0, layouts: new Set(), vibes: new Set(), memes: 0 } as MascotStats);
      if (image.status === "ready") entry.ready += 1;
      if (image.status === "draft") entry.draft += 1;
      entry.layouts.add(image.layout_preset_id);
      const vibe = vibeBySlug.get(image.expression_slug);
      if (vibe) entry.vibes.add(vibe);
      entry.memes += memeCountByBaseImage.get(image.id) ?? 0;
      stats.set(image.character_id, entry);
    }
    return stats;
  }, [baseImages, memes, vibeBySlug]);

  const facetCounts = useMemo(() => {
    const vibes = new Map<VibeGroup, number>();
    const layouts = new Map<LayoutPresetId, number>();
    let ready = 0;
    let draft = 0;

    for (const character of characters) {
      const stats = statsByCharacter.get(character.id);
      if (!stats) continue;
      for (const vibe of stats.vibes) vibes.set(vibe, (vibes.get(vibe) ?? 0) + 1);
      for (const layout of stats.layouts) layouts.set(layout, (layouts.get(layout) ?? 0) + 1);
      if (stats.ready > 0) ready += 1;
      if (stats.draft > 0) draft += 1;
    }
    return { vibes, layouts, ready, draft };
  }, [characters, statsByCharacter]);

  const visible = useMemo(() => {
    const filtered = characters.filter((character) => {
      if (!character.name.toLowerCase().includes(search.toLowerCase())) return false;
      const stats = statsByCharacter.get(character.id);
      if (vibeFilter && !stats?.vibes.has(vibeFilter)) return false;
      if (layoutFilter && !stats?.layouts.has(layoutFilter)) return false;
      if (statusFilter === "ready" && !(stats?.ready ?? 0)) return false;
      if (statusFilter === "draft" && !(stats?.draft ?? 0)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "vi");
      if (sort === "recent") return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      const aStats = statsByCharacter.get(a.id);
      const bStats = statsByCharacter.get(b.id);
      return (bStats?.memes ?? 0) - (aStats?.memes ?? 0) || (bStats?.ready ?? 0) - (aStats?.ready ?? 0);
    });
  }, [characters, search, vibeFilter, layoutFilter, statusFilter, sort, statsByCharacter]);

  // The mascot that actually earns its place: most memes made, then most templates.
  const featured = useMemo(() => {
    let best: (typeof characters)[number] | null = null;
    let bestScore = -1;
    for (const character of characters) {
      const stats = statsByCharacter.get(character.id);
      const score = (stats?.memes ?? 0) * 10 + (stats?.ready ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = character;
      }
    }
    return bestScore > 0 ? best : null;
  }, [characters, statsByCharacter]);

  const firstReadyBaseImage = (characterId: string) =>
    baseImages.find((image) => image.character_id === characterId && image.status === "ready");

  const coverFor = (character: (typeof characters)[number]) =>
    resolveMascotCover({
      avatarUrl: character.avatar_url,
      baseImages: baseImages.filter((image) => image.character_id === character.id),
      poses: character.poses,
    });

  const resetFilters = () => {
    setVibeFilter(null);
    setLayoutFilter(null);
    setStatusFilter(null);
    setSearch("");
  };

  const pickSketch = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Phác thảo phải là file ảnh");
      return;
    }
    const compressed = await compressImageToBase64(file);
    setSketch({ ...compressed, preview: URL.createObjectURL(file) });
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    setCreating(true);
    try {
      const created = await createCharacter({
        name,
        description: form.description.trim() || `Nhân vật ${name}`,
        personality: form.personality.trim() || "Linh hoạt theo ngữ cảnh meme",
      });
      if (!created) throw new Error("Không tạo được mascot");

      setShowCreate(false);
      setForm({ name: "", description: "", personality: "" });
      // Straight into the pack wizard: a mascot with no expressions is not usable yet.
      setWizardFor({
        id: created.id,
        name: created.name,
        description: created.description,
        personality: created.personality,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tạo được mascot");
    } finally {
      setCreating(false);
    }
  };

  const activeFilterCount = [vibeFilter, layoutFilter, statusFilter].filter(Boolean).length;

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
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Tạo mascot mới
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Filter rail */}
          <aside className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold th-text-primary">Bộ lọc</span>
              {activeFilterCount > 0 && (
                <button type="button" onClick={resetFilters} className="text-xs th-text-accent hover:underline">
                  Xoá lọc
                </button>
              )}
            </div>

            <FacetGroup title="Sắc thái biểu cảm" icon={<Smile size={13} />}>
              {(Object.keys(VIBE_LABELS) as VibeGroup[]).map((vibe) => {
                const count = facetCounts.vibes.get(vibe) ?? 0;
                if (count === 0) return null;
                return (
                  <FacetRow
                    key={vibe}
                    label={VIBE_LABELS[vibe]}
                    count={count}
                    active={vibeFilter === vibe}
                    onClick={() => setVibeFilter(vibeFilter === vibe ? null : vibe)}
                  />
                );
              })}
            </FacetGroup>

            <FacetGroup title="Bố cục" icon={<Palette size={13} />}>
              {(Object.keys(LAYOUT_PRESET_LABELS) as LayoutPresetId[]).map((layout) => {
                const count = facetCounts.layouts.get(layout) ?? 0;
                if (count === 0) return null;
                return (
                  <FacetRow
                    key={layout}
                    label={LAYOUT_PRESET_LABELS[layout]}
                    count={count}
                    active={layoutFilter === layout}
                    onClick={() => setLayoutFilter(layoutFilter === layout ? null : layout)}
                  />
                );
              })}
            </FacetGroup>

            <FacetGroup title="Trạng thái" icon={<Star size={13} />}>
              <FacetRow
                label="Có template"
                count={facetCounts.ready}
                active={statusFilter === "ready"}
                onClick={() => setStatusFilter(statusFilter === "ready" ? null : "ready")}
              />
              <FacetRow
                label="Còn nháp"
                count={facetCounts.draft}
                active={statusFilter === "draft"}
                onClick={() => setStatusFilter(statusFilter === "draft" ? null : "draft")}
              />
            </FacetGroup>

            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-semibold th-text-primary">Mascot của riêng bạn</p>
                <p className="text-xs th-text-tertiary">
                  Từ một bản phác thảo, AI dựng cả bộ biểu cảm đồng nhất.
                </p>
                <Button size="sm" className="w-full" onClick={() => setShowCreate(true)}>
                  Bắt đầu
                </Button>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-tertiary" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm mascot…"
                  className="w-full rounded-xl border th-border-secondary th-bg-tertiary py-2 pl-9 pr-3 text-sm th-text-primary outline-none"
                />
              </div>
              <select
                aria-label="Sắp xếp"
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                className="rounded-xl border th-border-secondary th-bg-tertiary px-3 py-2 text-xs th-text-primary"
              >
                {(Object.keys(SORT_LABELS) as Sort[]).map((option) => (
                  <option key={option} value={option}>
                    {SORT_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>

            {/* Build-a-mascot */}
            <Card>
              <CardContent className="py-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles size={15} className="th-text-accent" />
                  <span className="text-sm font-semibold th-text-primary">Dựng mascot trong 4 bước</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {BUILD_STEPS.map((step, index) => (
                    <div key={step.title} className="flex gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full th-bg-tertiary th-text-accent">
                        <step.icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium th-text-primary">
                          {index + 1}. {step.title}
                        </p>
                        <p className="text-[11px] th-text-tertiary">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Featured */}
            {featured && !search && activeFilterCount === 0 && (
              <Card>
                <CardContent className="flex flex-col gap-4 py-4 sm:flex-row">
                  <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl th-bg-tertiary sm:w-56">
                    {coverFor(featured) && (
                      <Image
                        src={coverFor(featured)!}
                        alt={featured.name}
                        fill
                        sizes="224px"
                        className="object-cover"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="inline-flex items-center gap-1 rounded-full th-bg-tertiary px-2 py-0.5 text-[10px] th-text-accent">
                      <Star size={10} /> Mascot chủ lực
                    </span>
                    <h2 className="text-lg font-bold th-text-primary">{featured.name}</h2>
                    <p className="line-clamp-2 text-sm th-text-tertiary">
                      {featured.description || "Chưa có mô tả ngoại hình."}
                    </p>
                    <p className="text-xs th-text-tertiary">
                      {statsByCharacter.get(featured.id)?.ready ?? 0} template ·{" "}
                      {statsByCharacter.get(featured.id)?.memes ?? 0} meme đã làm
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {firstReadyBaseImage(featured.id) && (
                        <Link href={`/projects/${projectRef}/editor?base=${firstReadyBaseImage(featured.id)!.id}`}>
                          <Button size="sm">Dùng mascot này</Button>
                        </Link>
                      )}
                      <Link href={`/projects/${projectRef}/mascots/${featured.id}`}>
                        <Button size="sm" variant="outline">
                          Xem chi tiết
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <p className="th-text-tertiary">Đang tải…</p>
            ) : visible.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="th-text-tertiary">
                    Không có mascot nào khớp bộ lọc. Thử xoá lọc hoặc tạo mascot mới.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((character) => {
                  const stats = statsByCharacter.get(character.id);
                  const cover = coverFor(character);
                  const ready = firstReadyBaseImage(character.id);
                  return (
                    <Card key={character.id} className="flex h-full flex-col">
                      <Link href={`/projects/${projectRef}/mascots/${character.id}`}>
                        <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl th-bg-tertiary">
                          {cover ? (
                            <Image src={cover} alt={character.name} fill sizes="320px" className="object-cover" unoptimized />
                          ) : (
                            <div className="flex h-full items-center justify-center text-3xl th-text-tertiary">
                              {character.name[0]?.toUpperCase()}
                            </div>
                          )}
                          <span
                            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] text-white"
                            style={{ background: (stats?.ready ?? 0) > 0 ? "rgba(37,99,235,0.85)" : "rgba(0,0,0,0.6)" }}
                          >
                            {(stats?.ready ?? 0) > 0 ? "Sẵn sàng" : "Nháp"}
                          </span>
                        </div>
                      </Link>
                      <CardContent className="flex flex-1 flex-col gap-2 py-3">
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
                          {(stats?.memes ?? 0) > 0 && (
                            <span className="rounded-full th-bg-tertiary px-2 py-0.5 text-[10px] th-text-tertiary">
                              {stats?.memes} meme
                            </span>
                          )}
                        </div>
                        <div className="mt-auto flex gap-1.5 pt-1">
                          <Link href={`/projects/${projectRef}/mascots/${character.id}`} className="flex-1">
                            <Button size="sm" variant="outline" className="w-full">
                              Xem
                            </Button>
                          </Link>
                          {ready ? (
                            <Link href={`/projects/${projectRef}/editor?base=${ready.id}`} className="flex-1">
                              <Button size="sm" className="w-full">
                                Dùng
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() =>
                                setWizardFor({
                                  id: character.id,
                                  name: character.name,
                                  description: character.description,
                                  personality: character.personality,
                                })
                              }
                            >
                              Sinh biểu cảm
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Tạo mascot mới">
          <form onSubmit={submitCreate} className="space-y-4">
            <input
              ref={sketchRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) pickSketch(file);
                event.target.value = "";
              }}
            />

            {sketch ? (
              <div className="flex items-center gap-3 rounded-xl border th-border-secondary p-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg th-bg-tertiary">
                  <Image src={sketch.preview} alt="Phác thảo" fill className="object-contain" unoptimized />
                </div>
                <span className="flex-1 text-xs th-text-tertiary">AI sẽ vẽ mascot bám theo phác thảo này.</span>
                <button
                  type="button"
                  aria-label="Bỏ phác thảo"
                  onClick={() => setSketch(null)}
                  className="th-text-tertiary hover:th-text-primary"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => sketchRef.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed th-border-secondary p-5 th-text-tertiary th-bg-hover"
              >
                <Upload size={18} />
                <span className="text-xs">Tải phác thảo hoặc logo (không bắt buộc)</span>
              </button>
            )}

            <Input
              label="Tên mascot"
              value={form.name}
              maxLength={60}
              placeholder="Bò Vàng"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Textarea
              rows={3}
              value={form.description}
              placeholder="Ngoại hình: bò vàng, sừng cong ngắn, mắt to tròn, mặc hoodie xanh…"
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
            <Textarea
              rows={2}
              value={form.personality}
              placeholder="Tính cách: hay nghĩ nhiều, nói móc nhẹ nhàng…"
              onChange={(event) => setForm((current) => ({ ...current, personality: event.target.value }))}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Huỷ
              </Button>
              <Button type="submit" loading={creating} disabled={!form.name.trim()}>
                Tạo và sinh biểu cảm
              </Button>
            </div>
          </form>
        </Modal>

        {project && wizardFor && (
          <BasePackWizard
            open
            onClose={() => setWizardFor(null)}
            projectId={project.id}
            character={wizardFor}
            projectStyle={project.style_prompt}
            sketchImage={sketch ? { base64: sketch.base64, mimeType: sketch.mimeType } : null}
            onSaved={() => {
              reload();
              reloadBaseImages();
              setSketch(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function FacetGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const hasRows = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!hasRows) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium th-text-tertiary">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FacetRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
        active ? "bg-blue-600/10 text-blue-600" : "th-text-secondary th-bg-hover"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums th-text-tertiary">{count}</span>
    </button>
  );
}
