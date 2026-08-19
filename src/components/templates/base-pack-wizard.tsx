"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Check, Coins, Loader2, X } from "lucide-react";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { BASE_PACK_RECIPES, DEFAULT_PACK_RECIPE_IDS, estimatePackCost, type BasePackRecipe } from "@/lib/base-pack";
import { LAYOUT_PRESET_LABELS } from "@/lib/meme-layout-presets";
import { ART_DIRECTION_LIST, DEFAULT_ART_DIRECTION, type ArtDirectionId } from "@/lib/mascot-art-direction";
import { generateImage } from "@/lib/use-store";
import { saveGeneratedBaseImage, useLayoutPresets } from "@/lib/use-templates";
import { POINT_COSTS } from "@/lib/point-pricing";
import type { LayoutPresetId, MemeFormat } from "@/types/database";

type Step = "pick" | "anchor" | "batch" | "review";

interface GeneratedItem {
  recipe: BasePackRecipe;
  image?: string;
  jobId?: string | null;
  error?: string;
  accepted: boolean;
}

interface BasePackWizardProps {
  open: boolean;
  onClose: () => void;
  /** Real project UUID: the generate route bills the project wallet and 403s without it. */
  projectId: string;
  character: { id: string; name: string; description: string; personality: string };
  projectStyle?: string | null;
  /** Art direction the mascot was built in, so a later batch matches. */
  initialArtDirection?: ArtDirectionId | null;
  onArtDirectionChange?: (direction: ArtDirectionId) => void;
  /** Sketch or logo the mascot should be drawn from, used only for the anchor image. */
  sketchImage?: { base64: string; mimeType: string } | null;
  onSaved?: () => void;
}

export default function BasePackWizard({
  open,
  onClose,
  projectId,
  character,
  projectStyle,
  initialArtDirection,
  onArtDirectionChange,
  sketchImage,
  onSaved,
}: BasePackWizardProps) {
  const toast = useToast();
  const layoutPresets = useLayoutPresets();

  const [step, setStep] = useState<Step>("pick");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(DEFAULT_PACK_RECIPE_IDS));
  const [aspectRatio, setAspectRatio] = useState<MemeFormat>("1:1");
  const [artDirection, setArtDirection] = useState<ArtDirectionId>(initialArtDirection ?? DEFAULT_ART_DIRECTION);
  const [anchor, setAnchor] = useState<GeneratedItem | null>(null);
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const selectedRecipes = useMemo(
    () => BASE_PACK_RECIPES.filter((recipe) => selectedIds.has(recipe.id)),
    [selectedIds]
  );
  const anchorRecipe = selectedRecipes[0] ?? BASE_PACK_RECIPES[0];
  const totalCost = estimatePackCost(selectedRecipes.length);

  const presetFor = useCallback(
    (id: LayoutPresetId) => layoutPresets.find((preset) => preset.id === id) ?? null,
    [layoutPresets]
  );

  const describe = useCallback(
    () => [character.description, character.personality].filter(Boolean).join(". "),
    [character]
  );

  const generateOne = useCallback(
    async (recipe: BasePackRecipe, reference?: string): Promise<GeneratedItem> => {
      // The anchor follows the uploaded sketch; every later image follows the
      // approved anchor, so identity is pinned to one picture the user has seen.
      const references = reference
        ? [{ base64: reference, mimeType: "image/png" }]
        : sketchImage
          ? [sketchImage]
          : undefined;

      const result = await generateImage({
        project_id: projectId,
        type: "character",
        character_id: character.id,
        characterName: character.name,
        characterDescription: describe(),
        emotion: recipe.poseBrief,
        artDirection,
        style: projectStyle || undefined,
        layoutGroup: recipe.layoutGroup,
        subjectSide: recipe.subjectSide,
        aspectRatio,
        existingPoseImages: references,
      });

      if (result.error || !result.image) {
        return { recipe, error: result.error || "Không nhận được ảnh", accepted: false };
      }
      return { recipe, image: result.image, jobId: result.generation_job_id ?? null, accepted: true };
    },
    [character, describe, projectStyle, aspectRatio, projectId, sketchImage, artDirection]
  );

  const runAnchor = useCallback(async () => {
    setBusy(true);
    setStep("anchor");
    const result = await generateOne(anchorRecipe);
    setAnchor(result);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }, [anchorRecipe, generateOne, toast]);

  const runBatch = useCallback(async () => {
    if (!anchor?.image) return;
    setBusy(true);
    setStep("batch");
    setProgress(0);

    const rest = selectedRecipes.filter((recipe) => recipe.id !== anchorRecipe.id);
    const done: GeneratedItem[] = [];
    for (const recipe of rest) {
      // Sequential on purpose: each call bills points, and a mid-batch failure
      // should stop at a known point rather than fan out.
      const result = await generateOne(recipe, anchor.image);
      done.push(result);
      setProgress(done.length);
      setItems([...done]);
    }

    setBusy(false);
    setStep("review");
  }, [anchor, selectedRecipes, anchorRecipe, generateOne]);

  const saveAccepted = useCallback(async () => {
    const all = [anchor, ...items].filter((item): item is GeneratedItem => Boolean(item?.image && item.accepted));
    if (all.length === 0) {
      toast.error("Chưa có ảnh nào được giữ lại");
      return;
    }

    setSaving(true);
    let saved = 0;
    for (const item of all) {
      try {
        await saveGeneratedBaseImage({
          characterId: character.id,
          expressionSlug: item.recipe.expressionSlug,
          expressionLabel: item.recipe.label,
          layoutPresetId: item.recipe.layoutGroup,
          aspectRatio,
          imageBase64: item.image!,
          generationJobId: item.jobId,
          preset: presetFor(item.recipe.layoutGroup),
        });
        saved += 1;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Lưu ảnh thất bại");
      }
    }

    setSaving(false);
    if (saved > 0) {
      toast.success(`Đã lưu ${saved} ảnh nền vào thư viện mascot`);
      onSaved?.();
      onClose();
      setStep("pick");
      setAnchor(null);
      setItems([]);
    }
  }, [anchor, items, character.id, aspectRatio, presetFor, toast, onSaved, onClose]);

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={`Tạo bộ biểu cảm cho ${character.name}`} size="lg">
      {step === "pick" && (
        <div className="space-y-4">
          <p className="text-sm th-text-tertiary">
            Mỗi ảnh được vẽ sẵn chỗ trống cho chữ, nên sau này bạn ghép chữ không tốn thêm điểm nào.
          </p>

          {sketchImage && (
            <div className="flex items-center gap-3 rounded-xl border th-border-secondary p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg th-bg-tertiary">
                <Image
                  src={`data:${sketchImage.mimeType};base64,${sketchImage.base64}`}
                  alt="Phác thảo"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <p className="text-xs th-text-tertiary">
                Ảnh mẫu sẽ được vẽ bám theo phác thảo này. Duyệt xong, các ảnh còn lại bám theo ảnh mẫu.
              </p>
            </div>
          )}

          <div>
            <span className="mb-2 block text-xs font-medium th-text-tertiary">Phong cách dựng hình</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ART_DIRECTION_LIST.map((direction) => (
                <button
                  key={direction.id}
                  type="button"
                  onClick={() => {
                    setArtDirection(direction.id);
                    onArtDirectionChange?.(direction.id);
                  }}
                  className={`rounded-xl border p-2.5 text-left ${
                    artDirection === direction.id
                      ? "border-blue-600 bg-blue-600/10"
                      : "th-border-secondary th-bg-hover"
                  }`}
                >
                  <p className="text-xs font-medium th-text-primary">{direction.label}</p>
                  <p className="text-[11px] th-text-tertiary">{direction.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium th-text-tertiary">Khổ ảnh</span>
            <div className="flex gap-1">
              {(["1:1", "4:5", "9:16", "16:9"] as MemeFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setAspectRatio(format)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    aspectRatio === format
                      ? "border-blue-600 text-blue-600 bg-blue-600/10"
                      : "th-border-secondary th-text-tertiary"
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {BASE_PACK_RECIPES.map((recipe) => (
              <label
                key={recipe.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border th-border-secondary px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(recipe.id)}
                  onChange={() => toggle(recipe.id)}
                  className="accent-blue-600"
                />
                <span className="flex-1 text-sm th-text-primary">{recipe.label}</span>
                <span className="text-xs th-text-tertiary">{LAYOUT_PRESET_LABELS[recipe.layoutGroup]}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border th-border-secondary p-3">
            <div className="flex items-center gap-2 text-sm th-text-primary">
              <Coins size={16} className="th-text-accent" />
              {selectedRecipes.length} ảnh × {POINT_COSTS.character} điểm ={" "}
              <strong>{totalCost} điểm</strong>
            </div>
            <Button onClick={runAnchor} disabled={selectedRecipes.length === 0}>
              Tạo ảnh mẫu trước ({POINT_COSTS.character} điểm)
            </Button>
          </div>
          <p className="text-xs th-text-tertiary">
            Bước tiếp theo chỉ tạo <strong>một</strong> ảnh để bạn duyệt. Nếu nhân vật ra sai, bạn chỉ mất{" "}
            {POINT_COSTS.character} điểm thay vì {totalCost}.
          </p>
        </div>
      )}

      {step === "anchor" && (
        <div className="space-y-4">
          {busy ? (
            <div className="flex flex-col items-center gap-2 py-10 th-text-tertiary">
              <Loader2 className="animate-spin" size={22} />
              <span className="text-sm">Đang vẽ ảnh mẫu…</span>
            </div>
          ) : anchor?.image ? (
            <>
              <p className="text-sm th-text-tertiary">
                Nhân vật trong ảnh này sẽ được dùng làm chuẩn cho toàn bộ các ảnh còn lại. Đúng nhân vật chưa?
              </p>
              <div className="relative mx-auto aspect-square w-64 overflow-hidden rounded-xl th-bg-tertiary">
                <Image src={`data:image/png;base64,${anchor.image}`} alt="Ảnh mẫu" fill className="object-cover" unoptimized />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={runAnchor}>
                  Vẽ lại ({POINT_COSTS.character} điểm)
                </Button>
                <Button onClick={runBatch}>
                  Duyệt và tạo {selectedRecipes.length - 1} ảnh còn lại ({estimatePackCost(selectedRecipes.length - 1)} điểm)
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3 py-6 text-center">
              <AlertTriangle className="mx-auto th-text-danger" size={22} />
              <p className="text-sm th-text-danger">{anchor?.error}</p>
              <Button variant="outline" onClick={() => setStep("pick")}>
                Quay lại
              </Button>
            </div>
          )}
        </div>
      )}

      {step === "batch" && (
        <div className="space-y-3 py-8 text-center">
          <Loader2 className="mx-auto animate-spin th-text-accent" size={24} />
          <p className="text-sm th-text-primary">
            Đang tạo {progress} / {selectedRecipes.length - 1} ảnh…
          </p>
          <p className="text-xs th-text-tertiary">Đừng đóng cửa sổ này. Mỗi ảnh xong sẽ hiện ở bước duyệt.</p>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <p className="text-sm th-text-tertiary">
            Bỏ những ảnh vẽ sai nhân vật. Ảnh bị bỏ vẫn đã bị trừ điểm vì AI đã chạy xong.
          </p>
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {[anchor, ...items].filter(Boolean).map((item, index) => {
              const entry = item as GeneratedItem;
              return (
                <div key={`${entry.recipe.id}-${index}`} className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      index === 0
                        ? setAnchor({ ...entry, accepted: !entry.accepted })
                        : setItems((current) =>
                            current.map((row, i) => (i === index - 1 ? { ...row, accepted: !row.accepted } : row))
                          )
                    }
                    className={`relative block w-full overflow-hidden rounded-lg border-2 ${
                      entry.accepted ? "border-blue-600" : "border-transparent opacity-40"
                    }`}
                  >
                    <div className="relative aspect-square th-bg-tertiary">
                      {entry.image ? (
                        <Image
                          src={`data:image/png;base64,${entry.image}`}
                          alt={entry.recipe.label}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center px-1 text-center text-[10px] th-text-danger">
                          {entry.error}
                        </span>
                      )}
                    </div>
                    <span className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white">
                      {entry.accepted ? <Check size={12} /> : <X size={12} />}
                    </span>
                  </button>
                  <p className="truncate text-center text-[10px] th-text-tertiary">{entry.recipe.label}</p>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button onClick={saveAccepted} loading={saving}>
              Lưu ảnh đã giữ
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
