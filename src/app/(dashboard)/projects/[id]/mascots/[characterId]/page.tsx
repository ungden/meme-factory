"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Archive, Check, ChevronLeft, Crop, Dna, Grid2x2, Images, RefreshCw, ShieldCheck, Sparkles, Type, Upload } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import BasePackWizard from "@/components/templates/base-pack-wizard";
import SafeZoneEditor from "@/components/templates/safe-zone-editor";
import TemplateUploadDialog from "@/components/templates/template-upload-dialog";
import CharacterDnaPanel from "@/components/templates/character-dna-panel";
import { layoutLabel } from "@/lib/meme-layout-presets";
import { useBaseImages, useCharacterDna, useExpressionTags } from "@/lib/use-templates";
import { fetchPoseAsFile } from "@/lib/template-create";
import { resolveMascotCover } from "@/lib/mascot-cover";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import { BASE_PACK_RECIPES } from "@/lib/base-pack";
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
  const [zoneTarget, setZoneTarget] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [poseFiles, setPoseFiles] = useState<File[]>([]);
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
    // A manually uploaded template has no preset; it groups under "Tuỳ chỉnh".
    const groups = new Map<LayoutPresetId | "custom", typeof images>();
    for (const image of images) {
      const key = image.layout_preset_id ?? "custom";
      groups.set(key, [...(groups.get(key) ?? []), image]);
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

  // Poses uploaded from the mobile app, or before poses were mirrored automatically,
  // exist in the legacy library but not here.
  const mirroredPoseIds = new Set(images.map((image) => image.source_pose_id).filter(Boolean));
  const unsyncedPoses = (character?.poses ?? []).filter((pose) => !mirroredPoseIds.has(pose.id)).length;

  // Pose -> template is now an explicit import: bytes are copied, the image is
  // measured, and the user confirms where the caption goes.
  const openPoseImport = async () => {
    setImporting(true);
    try {
      const mirrored = new Set(images.map((image) => image.source_pose_id).filter(Boolean));
      const pending = (character?.poses ?? []).filter((pose) => !mirrored.has(pose.id));
      const files = await Promise.all(
        pending.map((pose) => fetchPoseAsFile(pose.image_url, pose.name || "pose"))
      );
      setPoseFiles(files);
      setImportOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được ảnh gốc");
    } finally {
      setImporting(false);
    }
  };

  const cover = resolveMascotCover({
    avatarUrl: character?.avatar_url,
    baseImages: images,
    poses: character?.poses,
  });
  const ownedExpressionSlugs = [
    ...new Set(images.filter((image) => image.status !== "archived").map((image) => image.expression_slug)),
  ];
  const missingReactionCount = BASE_PACK_RECIPES.length - ownedExpressionSlugs.length;
  const readyCount = images.filter((image) => image.status === "ready").length;
  const layoutCount = byLayout.size;
  const authoredZoneCount = images.filter((image) => image.safe_zones_source === "authored").length;
  const resolutionLabel = (() => {
    const sized = images.find((image) => image.width && image.height);
    if (sized) return `${sized.width}×${sized.height}`;
    const ratios = new Set(images.map((image) => image.aspect_ratio));
    return ratios.size > 0 ? [...ratios].join(", ") : "—";
  })();

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

        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl th-bg-tertiary">
                  {cover ? (
                    <Image src={cover} alt={character.name} fill sizes="80px" className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl th-text-tertiary">
                      {character.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold th-text-primary">{character.name}</h1>
                  <p className="th-text-tertiary mt-0.5 line-clamp-2 max-w-xl text-sm">
                    {character.description || "Chưa có mô tả ngoại hình."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setWizardOpen(true)}>
                  <Sparkles size={16} />
                  {ownedExpressionSlugs.length === 0
                    ? `Tạo ${BASE_PACK_RECIPES.length} biểu cảm`
                    : missingReactionCount > 0
                      ? `Tạo tiếp ${missingReactionCount} biểu cảm`
                      : "Đủ bộ biểu cảm"}
                </Button>
                <Link href={`/projects/${projectRef}/editor`}>
                  <Button variant="outline">
                    <Type size={16} /> Ghép chữ
                  </Button>
                </Link>
                <Link href={`/projects/${projectRef}/characters/${characterId}`}>
                  <Button variant="outline" title="Tải ảnh gốc, tạo pose lẻ, đặt ảnh đại diện">
                    <Upload size={16} /> Ảnh gốc
                  </Button>
                </Link>
              </div>
            </div>

            <Card>
              <CardContent className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-4">
                <Stat icon={<Grid2x2 size={14} />} value={String(readyCount)} label="Biểu cảm sẵn sàng" />
                <Stat icon={<Images size={14} />} value={String(layoutCount)} label="Bố cục" />
                <Stat icon={<Type size={14} />} value={String(relatedMemes.length)} label="Meme đã làm" />
                <Stat
                  icon={<ShieldCheck size={14} />}
                  value={authoredZoneCount > 0 ? `${authoredZoneCount} chỉnh tay` : "Mặc định"}
                  label="Vùng an toàn"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-2 py-3 text-xs">
              <MetaRow label="Tạo lúc" value={new Date(character.created_at).toLocaleDateString("vi-VN")} />
              <MetaRow label="Cập nhật" value={new Date(character.updated_at).toLocaleDateString("vi-VN")} />
              <MetaRow label="Ảnh nền" value={`${images.length} ảnh`} />
              <MetaRow label="Độ phân giải" value={resolutionLabel} />
              <MetaRow label="Định dạng" value="PNG" />
            </CardContent>
          </Card>
        </div>

        {unsyncedPoses > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            style={{ background: "var(--bg-card)", borderColor: "var(--accent)" }}
          >
            <p className="text-sm th-text-secondary">
              {unsyncedPoses} ảnh gốc chưa thành mẫu meme. Import để chọn khung và khoanh vùng chữ.
            </p>
            <Button size="sm" variant="outline" loading={importing} onClick={openPoseImport}>
              <RefreshCw size={14} /> Đưa vào mẫu meme
            </Button>
          </div>
        )}

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
                      {layoutLabel(image.layout_preset_id)} · {image.aspect_ratio}
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
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Chỉnh vùng chữ"
                        title="Chỉnh vùng chữ"
                        onClick={() => setZoneTarget(image.id)}
                      >
                        <Crop size={12} />
                      </Button>
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
                    {layout === "custom" ? "Tuỳ chỉnh" : layoutLabel(layout)}
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
            <CardContent>
              <CharacterDnaPanel
                dna={dna}
                watermarkPosition={project?.watermark_position ?? "bottom-right"}
                saving={savingDna}
                onSave={async (patch) => {
                  setSavingDna(true);
                  try {
                    await saveDna(patch);
                    toast.success("Đã lưu Character DNA");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Lưu thất bại");
                  } finally {
                    setSavingDna(false);
                  }
                }}
              />
            </CardContent>
          </Card>
        )}

        {project && (
          <TemplateUploadDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            projectId={project.id}
            characterId={characterId}
            expressionTags={expressionTags}
            initialFiles={poseFiles}
            source="imported_pose"
            onSaved={reload}
          />
        )}

        <SafeZoneEditor
          open={Boolean(zoneTarget)}
          onClose={() => setZoneTarget(null)}
          baseImage={images.find((image) => image.id === zoneTarget) ?? null}
          onSave={async (safeZones) => {
            if (!zoneTarget) return;
            await updateBaseImage(zoneTarget, {
              safe_zones: safeZones as unknown as Record<string, unknown>,
              safe_zones_source: "authored",
              safe_zones_updated_at: new Date().toISOString(),
            });
          }}
        />

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
            existingExpressionSlugs={ownedExpressionSlugs}
            initialArtDirection={isArtDirectionId(dna?.art_direction) ? dna.art_direction : null}
            onArtDirectionChange={(direction) => {
              void saveDna({ art_direction: direction });
            }}
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

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="th-text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold th-text-primary">{value}</p>
        <p className="truncate text-[11px] th-text-tertiary">{label}</p>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="th-text-tertiary">{label}</span>
      <span className="truncate th-text-secondary">{value}</span>
    </div>
  );
}
