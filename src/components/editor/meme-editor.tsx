"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, Eye, EyeOff, Loader2, Save, Undo2 } from "lucide-react";
import Button from "@/components/ui/button";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import MemeCanvas, { type MemeCanvasHandle } from "@/components/meme/meme-canvas";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { resolveTextLayout } from "@/lib/meme-doc/autofit";
import { cssFont } from "@/lib/meme-doc/fonts";
import { toPixelBox, type Measure } from "@/lib/meme-doc/layout";
import { canvasSize } from "@/lib/meme-doc/render";
import { createDocForBaseImage } from "@/lib/meme-doc/schema";
import type { MemeDoc, TextLayer, TextStyle, WatermarkLayer } from "@/lib/meme-doc/types";
import type { BaseImageWithCharacter } from "@/lib/use-templates";
import { recordMemeExport, useBaseImages, useExpressionTags } from "@/lib/use-templates";
import { useMemes } from "@/lib/use-store";
import type { MemeFormat, Project } from "@/types/database";
import BaseImagePicker from "./base-image-picker";
import CaptionSuggestions from "./caption-suggestions";
import TemplateInfo from "./template-info";
import TextControls from "./text-controls";
import WatermarkControls from "./watermark-controls";

const UNDO_LIMIT = 30;

interface MemeEditorProps {
  projectRef: string;
  project: Project | null;
  initialDoc: MemeDoc | null;
  initialBaseImageId: string | null;
  /** Caption handed over from the AI Meme page. */
  initialText?: string | null;
  sourceMemeId?: string | null;
}

export default function MemeEditor({
  projectRef,
  project,
  initialDoc,
  initialBaseImageId,
  initialText,
  sourceMemeId,
}: MemeEditorProps) {
  const toast = useToast();
  const canvasRef = useRef<MemeCanvasHandle>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Every pose backfilled from the legacy library starts as a draft, so the editor
  // reads all statuses and lets the user promote the one they actually compose on.
  const { baseImages, loading: baseImagesLoading, updateBaseImage } = useBaseImages(projectRef, "all");
  const expressionTags = useExpressionTags();
  const { saveMeme } = useMemes(projectRef);

  const [doc, setDoc] = useState<MemeDoc | null>(initialDoc);
  const [history, setHistory] = useState<MemeDoc[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(initialDoc?.layers[0]?.id ?? null);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seededBaseId, setSeededBaseId] = useState<string | null>(initialBaseImageId);
  const [approving, setApproving] = useState(false);

  // Seed from a base image once the library resolves (fresh editor, or ?base= link).
  useEffect(() => {
    if (doc || baseImages.length === 0) return;
    const preferred = baseImages.find((image) => image.id === seededBaseId) ?? baseImages[0];
    setDoc(createDocForBaseImage({ baseImage: preferred, project, primaryText: initialText ?? "" }));
    setSeededBaseId(preferred.id);
  }, [doc, baseImages, seededBaseId, project, initialText]);

  useEffect(() => {
    if (doc && !activeLayerId) setActiveLayerId(doc.layers[0]?.id ?? null);
  }, [doc, activeLayerId]);

  const commit = useCallback((next: MemeDoc) => {
    setDoc((current) => {
      if (current) setHistory((stack) => [...stack.slice(-(UNDO_LIMIT - 1)), current]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setDoc(previous);
      return stack.slice(0, -1);
    });
  }, []);

  const activeLayer = useMemo(
    () => doc?.layers.find((layer) => layer.id === activeLayerId) ?? doc?.layers[0] ?? null,
    [doc, activeLayerId]
  );

  /** Mirrors the canvas measurement so the panel can warn before the export looks wrong. */
  const overflowing = useMemo(() => {
    if (!doc || !activeLayer || !activeLayer.text.trim()) return false;
    if (typeof document === "undefined") return false;

    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement("canvas");
    const ctx = measureCanvasRef.current.getContext("2d");
    if (!ctx) return false;

    const { width, height } = canvasSize(doc);
    const measure: Measure = (text, fontSizePx) => {
      ctx.font = cssFont(activeLayer.style, fontSizePx);
      return ctx.measureText(text).width;
    };

    return resolveTextLayout({
      text: activeLayer.text,
      box: toPixelBox(activeLayer.box, width, height),
      style: activeLayer.style,
      canvasHeight: height,
      measure,
    }).overflows;
  }, [doc, activeLayer]);

  const patchLayer = useCallback(
    (patch: Partial<TextLayer>) => {
      if (!doc || !activeLayer) return;
      commit({
        ...doc,
        layers: doc.layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, ...patch } : layer)),
      });
    },
    [doc, activeLayer, commit]
  );

  const patchStyle = useCallback(
    (patch: Partial<TextStyle>) => {
      if (!activeLayer) return;
      patchLayer({ style: { ...activeLayer.style, ...patch } });
    },
    [activeLayer, patchLayer]
  );

  const patchWatermark = useCallback(
    (patch: Partial<WatermarkLayer>) => {
      if (!doc?.watermark) return;
      commit({ ...doc, watermark: { ...doc.watermark, ...patch } });
    },
    [doc, commit]
  );

  const selectBaseImage = useCallback(
    (baseImage: BaseImageWithCharacter) => {
      const next = createDocForBaseImage({ baseImage, project });
      if (doc) {
        // Keep what the user typed when they swap the mascot underneath it.
        next.layers = next.layers.map((layer, index) => ({
          ...layer,
          text: doc.layers[index]?.text ?? "",
        }));
        if (doc.watermark) next.watermark = doc.watermark;
      }
      setSeededBaseId(baseImage.id);
      setActiveLayerId(next.layers[0]?.id ?? null);
      commit(next);
    },
    [doc, project, commit]
  );

  const uploadWatermark = useCallback(
    async (file: File) => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Phiên đăng nhập đã hết hạn");

        // The delete policy on this bucket keys off the first path segment.
        const extension = file.name.split(".").pop() || "png";
        const path = `${userData.user.id}/${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from("watermarks").upload(path, file, { upsert: false });
        if (error) throw new Error(error.message);

        const { data } = supabase.storage.from("watermarks").getPublicUrl(path);
        patchWatermark({ enabled: true, source: "custom", imageUrl: data.publicUrl, text: null });
        toast.success("Đã tải logo watermark");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Không tải được logo");
      }
    },
    [patchWatermark, toast]
  );

  const selectedBaseImage = useMemo(
    () => baseImages.find((image) => image.id === doc?.base?.baseImageId) ?? null,
    [baseImages, doc]
  );

  const approveTemplate = useCallback(async () => {
    if (!selectedBaseImage) return;
    setApproving(true);
    try {
      await updateBaseImage(selectedBaseImage.id, { status: "ready" });
      toast.success("Đã duyệt ảnh này làm template");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không duyệt được ảnh");
    } finally {
      setApproving(false);
    }
  }, [selectedBaseImage, updateBaseImage, toast]);

  const handleDownload = useCallback(() => {
    const dataUrl = canvasRef.current?.exportImage();
    if (!dataUrl || !doc) return;

    const link = document.createElement("a");
    link.download = `meme-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    const { width, height } = canvasSize(doc);
    const base64Length = dataUrl.length - (dataUrl.indexOf(",") + 1);
    void recordMemeExport({
      projectId: project?.id ?? "",
      memeId: sourceMemeId ?? null,
      baseImageId: doc.base?.baseImageId ?? null,
      aspectRatio: doc.canvas.format,
      width,
      height,
      // base64 carries 3 bytes per 4 characters.
      fileSizeBytes: Math.round((base64Length * 3) / 4),
      hadWatermark: Boolean(doc.watermark?.enabled),
    });
  }, [doc, project?.id, sourceMemeId]);

  const handleSave = useCallback(async () => {
    if (!doc) return;
    const dataUrl = canvasRef.current?.exportImage();
    if (!dataUrl) {
      toast.error("Chưa render được ảnh. Thử lại sau giây lát.");
      return;
    }

    setSaving(true);
    try {
      const [primary, secondary] = doc.layers;
      const saved = await saveMeme({
        original_idea: primary?.text || "Meme ghép chữ",
        generated_content: {
          headline: primary?.text ?? "",
          subtext: secondary?.text || undefined,
          layout_suggestion: { text_position: "top", character_positions: [] },
          tone: "ghép chữ",
        },
        selected_characters: [],
        format: doc.canvas.format,
        has_watermark: Boolean(doc.watermark?.enabled),
        image_base64: dataUrl,
        source_meme_id: sourceMemeId ?? null,
        editor_doc: doc,
        base_image_id: doc.base?.baseImageId ?? null,
        composed_locally: true,
      });
      const { width, height } = canvasSize(doc);
      void recordMemeExport({
        projectId: project?.id ?? "",
        memeId: saved?.id ?? sourceMemeId ?? null,
        baseImageId: doc.base?.baseImageId ?? null,
        aspectRatio: doc.canvas.format,
        width,
        height,
        fileSizeBytes: Math.round(((dataUrl.length - (dataUrl.indexOf(",") + 1)) * 3) / 4),
        hadWatermark: Boolean(doc.watermark?.enabled),
      });
      toast.success("Đã lưu vào Thư viện — không tốn điểm nào");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }, [doc, saveMeme, sourceMemeId, project?.id, toast]);

  const changeFormat = useCallback(
    (format: MemeFormat) => {
      if (!doc) return;
      commit({ ...doc, canvas: { ...doc.canvas, format } });
    },
    [doc, commit]
  );

  if (!doc) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          {baseImagesLoading ? (
            <Loader2 className="mx-auto animate-spin th-text-tertiary" size={22} />
          ) : (
            <div className="space-y-3">
              <p className="th-text-tertiary">
                Dự án chưa có ảnh mascot nào để ghép chữ.
              </p>
              <Link href={`/projects/${projectRef}/mascots`}>
                <Button variant="outline">Tạo mascot và bộ biểu cảm</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-semibold th-text-primary">Xem trước</span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setShowSafeZones((value) => !value)}>
                {showSafeZones ? <EyeOff size={14} /> : <Eye size={14} />}
                Vùng an toàn
              </Button>
              <Button size="sm" variant="ghost" onClick={undo} disabled={history.length === 0}>
                <Undo2 size={14} />
                Hoàn tác
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mx-auto max-w-[520px] overflow-hidden rounded-xl th-bg-tertiary">
              <MemeCanvas
                ref={canvasRef}
                doc={doc}
                showSafeZones={showSafeZones}
                onImageError={(message) => toast.error(message)}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={handleSave} loading={saving}>
                <Save size={16} />
                Lưu vào thư viện
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download size={16} />
                Tải PNG
              </Button>
              {selectedBaseImage?.status === "draft" && (
                <Button variant="outline" onClick={approveTemplate} loading={approving}>
                  <Check size={16} />
                  Duyệt làm template
                </Button>
              )}
              <span className="text-xs th-text-tertiary">Ghép chữ không tốn điểm.</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold th-text-primary">Cần một câu?</span>
          </CardHeader>
          <CardContent>
            <CaptionSuggestions
              projectId={project?.id ?? ""}
              seed={activeLayer?.text ?? ""}
              recommendedChars={doc.meta.recommendedChars}
              onPick={(text) => patchLayer({ text })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold th-text-primary">Chọn ảnh nền</span>
          </CardHeader>
          <CardContent>
            <BaseImagePicker
              baseImages={baseImages}
              expressionTags={expressionTags}
              selectedId={doc.base?.baseImageId ?? null}
              onSelect={selectBaseImage}
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-semibold th-text-primary">Chữ trên ảnh</span>
            {doc.layers.length > 1 && (
              <div className="flex gap-1">
                {doc.layers.map((layer, index) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setActiveLayerId(layer.id)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      activeLayer?.id === layer.id
                        ? "border-blue-600 text-blue-600 bg-blue-600/10"
                        : "th-border-secondary th-text-tertiary"
                    }`}
                  >
                    {index === 0 ? "Dòng chính" : "Dòng phụ"}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {activeLayer && (
              <TextControls
                layer={activeLayer}
                recommendedChars={doc.meta.recommendedChars}
                overflowing={overflowing}
                onChange={patchLayer}
                onStyleChange={patchStyle}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold th-text-primary">Watermark</span>
          </CardHeader>
          <CardContent>
            {doc.watermark && (
              <WatermarkControls
                watermark={doc.watermark}
                projectWatermarkUrl={project?.watermark_url ?? null}
                projectName={project?.creator_handle?.trim() || project?.name || "AIDA"}
                onChange={patchWatermark}
                onUpload={uploadWatermark}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold th-text-primary">Thông tin mẫu</span>
          </CardHeader>
          <CardContent>
            <TemplateInfo doc={doc} style={activeLayer?.style} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold th-text-primary">Khổ ảnh</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-1">
              {(["1:1", "4:5", "9:16", "16:9"] as MemeFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => changeFormat(format)}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    doc.canvas.format === format
                      ? "border-blue-600 text-blue-600 bg-blue-600/10"
                      : "th-border-secondary th-text-tertiary"
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
