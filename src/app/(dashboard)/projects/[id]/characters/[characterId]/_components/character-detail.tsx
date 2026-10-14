"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { Archive, Check, Crop, Pencil, RefreshCw, Smile, Sparkles, Trash2, Type } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import ConfirmModal from "@/components/ui/confirm-modal";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { PageContainer, PageHeader, PageSkeleton, Skeleton } from "@/components/ui/page";
import PriceLine from "@/components/ui/price-line";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import BasePackWizard from "@/components/templates/base-pack-wizard";
import SafeZoneEditor from "@/components/templates/safe-zone-editor";
import TemplateUploadDialog from "@/components/templates/template-upload-dialog";
import CharacterDnaPanel from "@/components/templates/character-dna-panel";
import CharacterPackCard from "@/components/characters/character-pack-card";
import CharacterImages from "@/components/characters/character-images";
import { useCharacterPack } from "@/components/characters/use-character-pack";
import { layoutLabel } from "@/lib/meme-layout-presets";
import { useBaseImages, useCharacterDna, useExpressionTags } from "@/lib/use-templates";
import { fetchPoseAsFile } from "@/lib/template-create";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import { BASE_PACK_RECIPES, estimatePackCost } from "@/lib/base-pack";
import { useCharacters, useMemes, useProject } from "@/lib/use-store";
import { formatDate } from "@/lib/format";
import type { BaseImageStatus } from "@/types/database";

type Tab = "expressions" | "images" | "traits" | "memes";

/**
 * Một nhân vật: bộ ảnh chuẩn, biểu cảm để ghép chữ, ảnh khác, đặc điểm cần giữ.
 * Thay cho trang /mascots/[id] cũ, nơi cùng một nhân vật nằm ở hai trang và năm
 * thẻ tiếng Anh.
 */
export default function CharacterDetail() {
  const { id: ref, characterId } = useParams<{ id: string; characterId: string }>();
  const router = useRouter();
  const toast = useToast();

  const { project } = useProject(ref);
  const characterStore = useCharacters(ref);
  const { characters, loading } = characterStore;
  const { baseImages, loading: imagesLoading, reload: reloadImages, updateBaseImage } = useBaseImages(ref, "all");
  const { memes } = useMemes(ref);
  const expressionTags = useExpressionTags();
  const { dna, save: saveDna } = useCharacterDna(characterId);
  const pack = useCharacterPack(ref);
  const { reload: reloadPack } = pack;

  const [tab, setTab] = useState<Tab>("expressions");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [zoneTarget, setZoneTarget] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [poseFiles, setPoseFiles] = useState<File[]>([]);
  const [savingTraits, setSavingTraits] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", personality: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void reloadPack();
  }, [reloadPack]);

  const character = characters.find((entry) => entry.id === characterId);
  const packCharacter = pack.status?.characters.find((entry) => entry.id === characterId);
  const images = useMemo(() => baseImages.filter((image) => image.character_id === characterId), [baseImages, characterId]);
  const relatedMemes = useMemo(() => {
    const ids = new Set(images.map((image) => image.id));
    return memes.filter((meme) => meme.base_image_id && ids.has(meme.base_image_id));
  }, [memes, images]);
  const labelBySlug = useMemo(() => new Map(expressionTags.map((tag) => [tag.slug, tag.label_vi])), [expressionTags]);

  // Đang xoá thì danh sách tải lại trước khi chuyển trang: đừng hiện trang không tìm thấy.
  if (!loading && !character && !deleting) notFound();
  if (!character) return <PageSkeleton blocks={3} />;

  const listHref = `/projects/${ref}/characters`;
  const ownedSlugs = [...new Set(images.filter((image) => image.status !== "archived").map((image) => image.expression_slug))];
  const missing = Math.max(0, BASE_PACK_RECIPES.length - ownedSlugs.length);
  // Ảnh thêm từ ứng dụng điện thoại, hoặc từ trước khi ảnh tự thành mẫu meme, chưa có ở đây.
  const mirrored = new Set(images.map((image) => image.source_pose_id).filter(Boolean));
  const unsynced = character.poses.filter((pose) => !mirrored.has(pose.id));
  const firstReady = images.find((image) => image.status === "ready");

  const setStatus = async (id: string, status: BaseImageStatus) => {
    try {
      await updateBaseImage(id, { status });
      toast.success(status === "ready" ? "Đã duyệt, dùng được để ghép chữ" : "Đã cất biểu cảm này đi");
    } catch {
      toast.error("Chưa lưu được. Bạn thử lại nhé.");
    }
  };

  const openImport = async () => {
    setImporting(true);
    try {
      setPoseFiles(await Promise.all(unsynced.map((pose) => fetchPoseAsFile(pose.image_url, pose.name || "anh"))));
      setImportOpen(true);
    } catch {
      toast.error("Chưa mở được ảnh. Bạn thử lại nhé.");
    } finally {
      setImporting(false);
    }
  };

  const openEdit = () => {
    setEditForm({ name: character.name, description: character.description, personality: character.personality });
    setEditOpen(true);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEditSaving(true);
    try {
      await characterStore.updateCharacter(character.id, editForm);
      toast.success(`Đã lưu ${editForm.name}`);
      setEditOpen(false);
      void reloadPack();
    } catch {
      toast.error("Chưa lưu được nhân vật. Bạn thử lại nhé.");
    } finally {
      setEditSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "expressions", label: `Biểu cảm (${images.length})` },
    { id: "images", label: `Ảnh khác (${character.poses.length})` },
    { id: "traits", label: "Đặc điểm cần giữ" },
    { id: "memes", label: `Meme đã làm (${relatedMemes.length})` },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={character.name}
        description={character.description || "Chưa có mô tả ngoại hình."}
        back={{ href: listHref, label: "Nhân vật" }}
        actions={
          <>
            <Link href={`/projects/${ref}/generate?character=${encodeURIComponent(character.name)}`} className={buttonClasses("primary", "sm")}>
              <Sparkles size={14} aria-hidden /> Làm meme
            </Link>
            {firstReady && (
              <Link href={`/projects/${ref}/editor?base=${firstReady.id}`} className={buttonClasses("outline", "sm")}>
                <Type size={14} aria-hidden /> Ghép chữ
              </Link>
            )}
            <Button size="sm" variant="outline" onClick={openEdit}>
              <Pencil size={14} aria-hidden /> Sửa
            </Button>
            <Button size="sm" variant="ghost" aria-label="Xoá nhân vật" title="Xoá nhân vật" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} aria-hidden className="th-text-danger" />
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <section aria-labelledby="pack-title" className="flex flex-col gap-2">
          <h2 id="pack-title" className="text-lg font-semibold th-text-primary">
            Bộ ảnh nhân vật
          </h2>
          {packCharacter && pack.status ? (
            <CharacterPackCard
              character={packCharacter}
              owner={pack.status.owner}
              busy={Boolean(pack.work)}
              working={pack.work?.id === character.id ? pack.work.message : ""}
              failure={pack.failure?.id === character.id ? pack.failure.message : ""}
              pointsPerImage={pack.status.pointsPerImage}
              available={pack.points}
              onDraw={(mode) => void pack.draw(packCharacter, mode)}
              onApprove={() => void pack.approve(packCharacter)}
              onUpload={(file) => void pack.upload(packCharacter, file)}
            />
          ) : pack.loadError ? (
            <Alert
              action={
                <Button size="sm" variant="outline" onClick={() => void reloadPack()}>
                  Thử lại
                </Button>
              }
            >
              {pack.loadError}
            </Alert>
          ) : (
            <Skeleton className="h-48" />
          )}
          <p className="text-xs th-text-tertiary">
            Tạo ngày {formatDate(character.created_at)} · sửa lần cuối {formatDate(character.updated_at)}
          </p>
        </section>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Phần của nhân vật">
          {tabs.map((entry) => (
            <Chip key={entry.id} role="tab" aria-selected={tab === entry.id} aria-pressed={undefined} selected={tab === entry.id} onClick={() => setTab(entry.id)}>
              {entry.label}
            </Chip>
          ))}
        </div>

        {tab === "expressions" && (
          <section className="flex flex-col gap-4" aria-label="Biểu cảm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm th-text-secondary">Mỗi biểu cảm đã chừa sẵn chỗ cho chữ. Duyệt xong là ghép chữ thành meme được.</p>
              {missing > 0 && (
                <div className="flex flex-col gap-1.5 sm:items-end">
                  <PriceLine points={{ min: estimatePackCost(1), max: estimatePackCost(missing) }} available={pack.points} note="bạn chọn số biểu cảm" />
                  <Button size="sm" onClick={() => setWizardOpen(true)} disabled={!project}>
                    <Sparkles size={14} aria-hidden /> {ownedSlugs.length ? `Vẽ tiếp ${missing} biểu cảm` : `Vẽ ${missing} biểu cảm`}
                  </Button>
                </div>
              )}
            </div>

            {unsynced.length > 0 && (
              <Alert
                tone="info"
                action={
                  <Button size="sm" variant="outline" loading={importing} onClick={openImport}>
                    <RefreshCw size={14} aria-hidden /> Đưa vào mẫu meme
                  </Button>
                }
              >
                {unsynced.length} ảnh khác chưa thành mẫu meme. Đưa vào để chọn khung và chỗ đặt chữ.
              </Alert>
            )}

            {imagesLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="aspect-square" />
                ))}
              </div>
            ) : images.length === 0 ? (
              <EmptyState
                icon={Smile}
                title="Chưa có biểu cảm nào"
                hint={`Vẽ bộ biểu cảm cho ${character.name} để ghép chữ thành meme.`}
                action={
                  <Button size="sm" onClick={() => setWizardOpen(true)} disabled={!project}>
                    <Sparkles size={14} aria-hidden /> Vẽ bộ biểu cảm
                  </Button>
                }
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {images.map((image) => {
                  const label = image.expression_label || labelBySlug.get(image.expression_slug) || image.expression_slug;
                  return (
                    <li key={image.id}>
                      <Card className="flex h-full flex-col overflow-hidden">
                        <div className="relative aspect-square th-bg-tertiary">
                          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app */}
                          <img src={image.image_url} alt={label} className="h-full w-full object-cover" />
                          {image.status !== "ready" && (
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                              {image.status === "draft" ? "Chờ duyệt" : "Đã cất"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 p-2">
                          <p className="truncate text-xs font-medium th-text-primary">{label}</p>
                          <p className="truncate text-xs th-text-tertiary">
                            {layoutLabel(image.layout_preset_id)} · {image.aspect_ratio}
                          </p>
                          <div className="mt-auto flex gap-1">
                            {image.status !== "ready" ? (
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(image.id, "ready")}>
                                <Check size={12} aria-hidden /> {image.status === "draft" ? "Duyệt" : "Dùng lại"}
                              </Button>
                            ) : (
                              <Link href={`/projects/${ref}/editor?base=${image.id}`} className={buttonClasses("outline", "sm", "flex-1")}>
                                <Type size={12} aria-hidden /> Ghép chữ
                              </Link>
                            )}
                            <Button size="sm" variant="ghost" aria-label="Chỉnh chỗ đặt chữ" title="Chỉnh chỗ đặt chữ" onClick={() => setZoneTarget(image.id)}>
                              <Crop size={12} aria-hidden />
                            </Button>
                            {image.status !== "archived" && (
                              <Button size="sm" variant="ghost" aria-label="Cất đi" title="Cất đi" onClick={() => setStatus(image.id, "archived")}>
                                <Archive size={12} aria-hidden />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "images" && (
          <CharacterImages
            projectRef={ref}
            character={character}
            pointsPerImage={pack.status?.pointsPerImage ?? null}
            available={pack.points}
            addPose={characterStore.addPose}
            deletePose={characterStore.deletePose}
            setAvatar={characterStore.setCharacterAvatar}
            reload={async () => {
              await characterStore.reload();
              await reloadPack();
            }}
            onSpent={() => void pack.refreshPoints()}
            onOutOfPoints={(needed) => pack.setPointsNeeded(needed)}
          />
        )}

        {tab === "traits" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold th-text-primary">Đặc điểm cần giữ</h2>
              <p className="mt-1 text-sm th-text-secondary">AIDA giữ đúng những điều này mỗi lần vẽ {character.name}.</p>
            </CardHeader>
            <CardContent>
              <CharacterDnaPanel
                dna={dna}
                watermarkPosition={project?.watermark_position ?? "bottom-right"}
                saving={savingTraits}
                onSave={async (patch) => {
                  setSavingTraits(true);
                  try {
                    await saveDna(patch);
                    toast.success("Đã lưu đặc điểm cần giữ");
                  } catch {
                    toast.error("Chưa lưu được. Bạn thử lại nhé.");
                  } finally {
                    setSavingTraits(false);
                  }
                }}
              />
            </CardContent>
          </Card>
        )}

        {tab === "memes" &&
          (relatedMemes.length === 0 ? (
            <EmptyState
              icon={Type}
              title={`Chưa có meme nào ghép từ ${character.name}`}
              hint="Duyệt một biểu cảm rồi bấm Ghép chữ."
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {relatedMemes.map((meme) => (
                <li key={meme.id}>
                  <Link
                    href={`/projects/${ref}/editor?meme=${meme.id}`}
                    className="block aspect-square overflow-hidden rounded-2xl th-bg-tertiary"
                    aria-label={meme.original_idea || "Mở meme"}
                  >
                    {meme.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app
                      <img src={meme.image_url} alt={meme.original_idea || ""} className="h-full w-full object-cover" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Sửa nhân vật">
        <form onSubmit={saveEdit} className="flex flex-col gap-4">
          <Input
            id="character-name"
            label="Tên nhân vật"
            placeholder="Ví dụ: Bò Vàng"
            value={editForm.name}
            maxLength={40}
            onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))}
            required
          />
          <Textarea
            id="character-description"
            label="Ngoại hình"
            placeholder="Tuổi, dáng, tóc, mặt, trang phục quen thuộc…"
            value={editForm.description}
            rows={3}
            onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))}
          />
          <Textarea
            id="character-personality"
            label="Tính cách"
            placeholder="Ví dụ: lạc quan, hay khoe, nói móc nhẹ nhàng"
            value={editForm.personality}
            rows={2}
            onChange={(event) => setEditForm((form) => ({ ...form, personality: event.target.value }))}
          />
          <p className="text-xs th-text-tertiary">Bộ ảnh đã chốt không đổi theo. Muốn gương mặt mới thì vẽ lại bộ ảnh.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" loading={editSaving} disabled={!editForm.name.trim()}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await characterStore.deleteCharacter(character.id);
            toast.success(`Đã xoá ${character.name}`);
            router.push(listHref);
          } catch {
            toast.error("Chưa xoá được nhân vật. Bạn thử lại nhé.");
            setDeleting(false);
          }
        }}
        title={`Xoá ${character.name}?`}
        message="Nhân vật và các ảnh của nhân vật sẽ mất hẳn, không lấy lại được."
        confirmText="Xoá nhân vật"
        variant="danger"
      />

      {project && (
        <TemplateUploadDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          projectId={project.id}
          characterId={character.id}
          expressionTags={expressionTags}
          initialFiles={poseFiles}
          source="imported_pose"
          onSaved={reloadImages}
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
          existingExpressionSlugs={ownedSlugs}
          initialArtDirection={isArtDirectionId(dna?.art_direction) ? dna.art_direction : null}
          onArtDirectionChange={(direction) => {
            void saveDna({ art_direction: direction });
          }}
          onSaved={() => {
            void reloadImages();
            void characterStore.reload();
            void pack.refreshPoints();
          }}
        />
      )}

      <OutOfPointsModal
        open={Boolean(pack.pointsNeeded)}
        onClose={() => pack.setPointsNeeded(null)}
        required={pack.pointsNeeded?.required ?? 0}
        current={pack.pointsNeeded?.current ?? 0}
        action="Vẽ nhân vật"
        onFunded={() => {
          const retry = pack.pointsNeeded?.retry;
          pack.setPointsNeeded(null);
          retry?.();
        }}
      />
    </PageContainer>
  );
}
