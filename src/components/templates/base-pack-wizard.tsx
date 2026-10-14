"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Button from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import Modal from "@/components/ui/modal";
import PriceLine from "@/components/ui/price-line";
import JobStatus from "@/components/ui/job-status";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import {
  ANCHOR_RECIPE_ID,
  BASE_PACK_RECIPES,
  estimatePackCost,
  missingRecipes,
  recipeById,
  type BasePackRecipe,
} from "@/lib/base-pack";
import { LAYOUT_PRESET_LABELS } from "@/lib/meme-layout-presets";
import { ART_DIRECTION_LIST, DEFAULT_ART_DIRECTION, type ArtDirectionId } from "@/lib/mascot-art-direction";
import { POINT_COSTS } from "@/lib/point-pricing";
import { formatNumber } from "@/lib/format";
import type { MemeFormat } from "@/types/database";

type Step = "pick" | "anchor" | "batch" | "review";

interface DrawnItem {
  recipe: BasePackRecipe;
  baseImage?: { id: string; image_url: string };
  error?: string;
}

type DrawResult =
  | { ok: true; baseImage: { id: string; image_url: string } }
  | { ok: false; error: string; shortfall?: { required: number; current: number } };

interface BasePackWizardProps {
  open: boolean;
  onClose: () => void;
  /** Kênh để trừ điểm: id hoặc đường dẫn ngắn. */
  projectId: string;
  character: { id: string; name: string; description: string; personality: string };
  /** Không còn dùng: máy chủ tự đọc kiểu ảnh của kênh. */
  projectStyle?: string | null;
  /** Kiểu vẽ nhân vật đã dùng, để loạt sau khớp loạt trước. */
  initialArtDirection?: ArtDirectionId | null;
  onArtDirectionChange?: (direction: ArtDirectionId) => void;
  /** Biểu cảm đã có, để lần chạy dừng giữa chừng làm tiếp thay vì vẽ lại. */
  existingExpressionSlugs?: string[];
  /** Phác thảo hoặc logo để vẽ ảnh đầu theo. */
  sketchImage?: { base64: string; mimeType: string } | null;
  onSaved?: () => void;
}

async function drawExpression(body: Record<string, unknown>): Promise<DrawResult> {
  try {
    const response = await fetch("/api/meme/base-pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.baseImage?.id) return { ok: true, baseImage: data.baseImage };
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "Chưa vẽ được. Bạn thử lại nhé.",
      shortfall:
        data.code === "INSUFFICIENT_POINTS" && typeof data.required === "number"
          ? { required: data.required, current: Number(data.current) || 0 }
          : undefined,
    };
  } catch {
    return { ok: false, error: "Mất kết nối. Ảnh nào đã vẽ xong vẫn nằm trong Mẫu meme. Bạn thử lại nhé." };
  }
}

/**
 * Vẽ bộ biểu cảm để ghép chữ cho một nhân vật: vẽ một ảnh đầu để duyệt, rồi
 * vẽ các ảnh còn lại bám theo nó. Mỗi ảnh được máy chủ lưu thành mẫu meme ngay
 * khi vẽ xong, nên đóng cửa sổ giữa chừng không mất ảnh đã trả điểm.
 */
export default function BasePackWizard({
  open,
  onClose,
  projectId,
  character,
  initialArtDirection,
  onArtDirectionChange,
  existingExpressionSlugs,
  sketchImage,
  onSaved,
}: BasePackWizardProps) {
  const [step, setStep] = useState<Step>("pick");
  const pending = useMemo(() => missingRecipes(existingExpressionSlugs ?? []), [existingExpressionSlugs]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(pending.map((recipe) => recipe.id)));
  const [stopRequested, setStopRequested] = useState(false);
  const stopRef = useRef(false);
  const [aspectRatio, setAspectRatio] = useState<MemeFormat>("1:1");
  const [artDirection, setArtDirection] = useState<ArtDirectionId>(initialArtDirection ?? DEFAULT_ART_DIRECTION);
  const [anchor, setAnchor] = useState<DrawnItem | null>(null);
  const [items, setItems] = useState<DrawnItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [shortfall, setShortfall] = useState<{ required: number; current: number; resume: "anchor" | "batch" } | null>(null);

  const selectedRecipes = useMemo(
    () => BASE_PACK_RECIPES.filter((recipe) => selectedIds.has(recipe.id)),
    [selectedIds],
  );
  // Ảnh đầu luôn là dáng bình thường nhìn thẳng: dễ nhận ra nhân vật nhất, và
  // mọi ảnh sau bám theo nó.
  const anchorRecipe = recipeById(ANCHOR_RECIPE_ID) ?? selectedRecipes[0] ?? BASE_PACK_RECIPES[0];
  const rest = selectedRecipes.filter((recipe) => recipe.id !== anchorRecipe.id);
  const remaining = rest.filter((recipe) => !items.some((item) => item.recipe.id === recipe.id && item.baseImage));
  const totalCost = estimatePackCost(selectedRecipes.length);

  const baseBody = useMemo(
    () => ({ projectRef: projectId, characterId: character.id, aspectRatio, artDirection }),
    [projectId, character.id, aspectRatio, artDirection],
  );

  const runAnchor = async () => {
    setBusy(true);
    setStep("anchor");
    const replaces = anchor?.baseImage?.id;
    const result = await drawExpression({
      ...baseBody,
      recipeId: anchorRecipe.id,
      sketch: sketchImage ?? undefined,
      replacesBaseImageId: replaces,
    });
    if (result.ok) {
      setAnchor({ recipe: anchorRecipe, baseImage: result.baseImage });
      onSaved?.();
    } else {
      setAnchor({ recipe: anchorRecipe, error: result.error, baseImage: anchor?.baseImage });
      if (result.shortfall) setShortfall({ ...result.shortfall, resume: "anchor" });
    }
    setBusy(false);
  };

  const runBatch = async () => {
    const anchorId = anchor?.baseImage?.id;
    if (!anchorId) return;
    setBusy(true);
    setStep("batch");
    setStopRequested(false);
    stopRef.current = false;

    let drawn = items.filter((item) => item.baseImage);
    for (const recipe of remaining) {
      if (stopRef.current) break;
      // Lần lượt từng ảnh: mỗi lần gọi tính điểm, và ảnh nào xong là đã nằm trong kho.
      const result = await drawExpression({ ...baseBody, recipeId: recipe.id, anchorBaseImageId: anchorId });
      if (!result.ok && result.shortfall) {
        setShortfall({ ...result.shortfall, resume: "batch" });
        break;
      }
      drawn = [...drawn.filter((item) => item.recipe.id !== recipe.id), result.ok ? { recipe, baseImage: result.baseImage } : { recipe, error: result.error }];
      setItems(drawn);
    }

    setBusy(false);
    setStep("review");
    onSaved?.();
  };

  const requestStop = () => {
    stopRef.current = true;
    setStopRequested(true);
  };

  const finish = () => {
    onSaved?.();
    onClose();
    setStep("pick");
    setAnchor(null);
    setItems([]);
  };

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const drawnCount = items.filter((item) => item.baseImage).length + (anchor?.baseImage ? 1 : 0);

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title={`Vẽ bộ biểu cảm cho ${character.name}`} size="lg">
        {step === "pick" && (
          <div className="space-y-4">
            <p className="text-sm th-text-tertiary">
              Vẽ một lần cả bộ biểu cảm, dùng mãi về sau. Mỗi ảnh chừa sẵn chỗ cho chữ nên ghép chữ sau này không tốn
              thêm điểm.
            </p>

            {(existingExpressionSlugs?.length ?? 0) > 0 && (
              <div className="rounded-xl border p-3 text-xs th-border th-text-tertiary">
                Nhân vật này đã có {existingExpressionSlugs!.length} biểu cảm. Danh sách dưới chỉ còn {pending.length} biểu
                cảm chưa vẽ, không tính điểm lại phần đã có.
              </div>
            )}

            {sketchImage && (
              <div className="flex items-center gap-3 rounded-xl border p-3 th-border">
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
                  Ảnh đầu sẽ vẽ theo phác thảo này. Duyệt xong, các ảnh còn lại vẽ theo ảnh đầu.
                </p>
              </div>
            )}

            <div>
              <span className="mb-2 block text-xs font-medium th-text-tertiary">Kiểu vẽ</span>
              <div role="radiogroup" aria-label="Kiểu vẽ" className="grid gap-1.5 sm:grid-cols-2">
                {ART_DIRECTION_LIST.map((direction) => (
                  <button
                    key={direction.id}
                    type="button"
                    role="radio"
                    aria-checked={artDirection === direction.id}
                    onClick={() => {
                      setArtDirection(direction.id);
                      onArtDirectionChange?.(direction.id);
                    }}
                    className={`rounded-xl border p-2.5 text-left ${
                      artDirection === direction.id ? "th-border-accent th-bg-accent-light" : "th-border th-bg-hover"
                    }`}
                  >
                    <p className="text-xs font-medium th-text-primary">{direction.label}</p>
                    <p className="text-xs th-text-tertiary">{direction.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs font-medium th-text-tertiary">Khổ ảnh</span>
              <div role="radiogroup" aria-label="Khổ ảnh" className="flex flex-wrap gap-1.5">
                {(["1:1", "4:5", "9:16", "16:9"] as MemeFormat[]).map((format) => (
                  <Chip key={format} role="radio" selected={aspectRatio === format} onClick={() => setAspectRatio(format)}>
                    {format}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {pending.map((recipe) => (
                <label key={recipe.id} className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 th-border">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(recipe.id)}
                    onChange={() => toggle(recipe.id)}
                    className="th-accent-control"
                  />
                  <span className="flex-1 text-sm th-text-primary">{recipe.label}</span>
                  <span className="text-xs th-text-tertiary">{LAYOUT_PRESET_LABELS[recipe.layoutGroup]}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 th-border">
              <p className="text-sm th-text-primary">
                {selectedRecipes.length} ảnh, tổng <strong>~{formatNumber(totalCost)} điểm</strong>
              </p>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(selectedRecipes.length === pending.length ? new Set() : new Set(pending.map((recipe) => recipe.id)))
                }
                className="text-xs font-medium th-text-accent hover:underline"
              >
                {selectedRecipes.length === pending.length ? "Bỏ chọn hết" : "Chọn hết"}
              </button>
            </div>
            <p className="text-xs th-text-tertiary">
              Bước tiếp theo chỉ vẽ <strong>một</strong> ảnh để bạn duyệt. Nếu nhân vật ra sai, bạn chỉ mất một ảnh thay vì cả bộ.
            </p>
            <div className="flex flex-col items-end gap-2">
              <PriceLine points={POINT_COSTS.character} />
              <Button onClick={runAnchor} disabled={selectedRecipes.length === 0}>
                Vẽ ảnh đầu để duyệt
              </Button>
            </div>
          </div>
        )}

        {step === "anchor" && (
          <div className="space-y-4">
            {busy ? (
              <JobStatus state="working" title="Đang vẽ ảnh đầu" detail="Xong là tự lưu vào Mẫu meme." leaveHint={null} />
            ) : anchor?.baseImage && !anchor.error ? (
              <>
                <p className="text-sm th-text-tertiary">
                  Mọi ảnh còn lại sẽ vẽ theo nhân vật trong ảnh này. Đúng nhân vật chưa?
                </p>
                <div className="relative mx-auto aspect-square w-64 max-w-full overflow-hidden rounded-xl th-bg-tertiary">
                  <Image src={anchor.baseImage.image_url} alt="Ảnh đầu" fill className="object-cover" unoptimized />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <PriceLine points={estimatePackCost(rest.length)} note={`${rest.length} ảnh còn lại`} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={runAnchor}>
                      Vẽ lại ảnh đầu
                    </Button>
                    <Button onClick={runBatch} disabled={rest.length === 0}>
                      Duyệt và vẽ {rest.length} ảnh còn lại
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <JobStatus state="failed" title="Chưa vẽ được ảnh đầu" detail={anchor?.error} onRetry={runAnchor}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PriceLine points={POINT_COSTS.character} />
                  <Button size="sm" variant="ghost" onClick={() => setStep("pick")}>
                    Quay lại
                  </Button>
                </div>
              </JobStatus>
            )}
          </div>
        )}

        {step === "batch" && (
          <div className="space-y-4">
            <JobStatus
              state="working"
              title={`Đã lưu ${drawnCount} / ${selectedRecipes.length} biểu cảm`}
              detail="Ảnh nào xong là đã nằm trong Mẫu meme. Đóng cửa sổ giữa chừng không mất ảnh đã vẽ, mở lại là vẽ tiếp phần còn thiếu."
              leaveHint={null}
            />

            {items.length > 0 && (
              <div className="grid max-h-40 grid-cols-5 gap-1.5 overflow-y-auto sm:grid-cols-8">
                {items.filter((item) => item.baseImage).map((item) => (
                  <div key={item.recipe.id} className="relative aspect-square overflow-hidden rounded-lg th-bg-tertiary">
                    <Image src={item.baseImage!.image_url} alt={item.recipe.label} fill className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-center">
              <Button variant="outline" onClick={requestStop} disabled={stopRequested}>
                {stopRequested ? "Đang dừng sau ảnh này…" : "Dừng lại"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <p className="text-sm th-text-tertiary">
              Đã lưu {drawnCount} biểu cảm vào Mẫu meme. Ảnh nào vẽ sai nhân vật thì ẩn nó ở trang Mẫu meme; ảnh đã vẽ
              đều đã tính điểm.
            </p>
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {items.map((entry) => (
                <div key={entry.recipe.id} className="space-y-1">
                  <div className="relative aspect-square overflow-hidden rounded-lg th-bg-tertiary">
                    {entry.baseImage ? (
                      <Image src={entry.baseImage.image_url} alt={entry.recipe.label} fill className="object-cover" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center px-1 text-center text-xs th-text-danger">
                        {entry.error}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-center text-xs th-text-tertiary">{entry.recipe.label}</p>
                </div>
              ))}
            </div>
            {remaining.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 th-border">
                <PriceLine points={estimatePackCost(remaining.length)} note={`còn ${remaining.length} ảnh`} />
                <Button size="sm" variant="outline" onClick={runBatch}>
                  Vẽ tiếp phần còn thiếu
                </Button>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={finish}>Xong</Button>
            </div>
          </div>
        )}
      </Modal>

      <OutOfPointsModal
        open={Boolean(shortfall)}
        onClose={() => setShortfall(null)}
        required={shortfall?.required ?? POINT_COSTS.character}
        current={shortfall?.current ?? 0}
        action="Vẽ biểu cảm"
        onFunded={() => {
          const resume = shortfall?.resume;
          setShortfall(null);
          if (resume === "anchor") void runAnchor();
          if (resume === "batch") void runBatch();
        }}
      />
    </>
  );
}
