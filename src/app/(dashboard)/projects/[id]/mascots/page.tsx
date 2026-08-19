"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Plus, Search, Sparkles, Upload, X } from "lucide-react";
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
import { useBaseImages } from "@/lib/use-templates";
import { useCharacters, useProject } from "@/lib/use-store";
import type { LayoutPresetId } from "@/types/database";

type Filter = "all" | "ready" | "draft";

export default function MascotsPage() {
  const params = useParams<{ id: string }>();
  const projectRef = params.id;

  const toast = useToast();
  const sketchRef = useRef<HTMLInputElement>(null);

  const { project } = useProject(projectRef);
  const { characters, loading, createCharacter, reload } = useCharacters(projectRef);
  const { baseImages, reload: reloadBaseImages } = useBaseImages(projectRef, "all");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Build-a-mascot: name + traits + an optional sketch the artwork should follow.
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", personality: "" });
  const [sketch, setSketch] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [wizardFor, setWizardFor] = useState<
    { id: string; name: string; description: string; personality: string } | null
  >(null);

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
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Tạo mascot mới
          </Button>
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
                <span className="flex-1 text-xs th-text-tertiary">
                  AI sẽ vẽ mascot bám theo phác thảo này.
                </span>
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

        <p className="mt-6 flex items-center gap-1.5 text-xs th-text-tertiary">
          <Sparkles size={13} />
          Mỗi mascot chỉ tốn điểm một lần khi tạo bộ biểu cảm; ghép chữ sau đó luôn miễn phí.
        </p>
      </main>
    </div>
  );
}
