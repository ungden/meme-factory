import type { MascotBaseImage, MemeFormat, Project } from "@/types/database";
import { DEFAULT_TEXT_STYLE, parseSafeZones, parseTextStyle } from "@/lib/meme-layout-presets";
import type { BaseRef, MemeDoc, Rect, TextLayer, TextStyle, WatermarkLayer, ZoneName } from "./types";
import { MEME_DOC_SCHEMA, MEME_DOC_VERSION } from "./types";

const CREATED_WITH = "aida-editor@1";

function layerId(seed: string) {
  return `${seed}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDoc(format: MemeFormat): MemeDoc {
  return {
    schema: MEME_DOC_SCHEMA,
    version: MEME_DOC_VERSION,
    canvas: { format, background: "#111111" },
    base: null,
    layers: [],
    watermark: null,
    meta: { createdWith: CREATED_WITH },
  };
}

type ProjectBrand = Pick<
  Project,
  "name" | "watermark_url" | "watermark_position" | "watermark_opacity" | "creator_handle"
>;

function watermarkFromProject(project?: ProjectBrand | null): WatermarkLayer {
  // A logo wins; otherwise the creator handle, which is what a fanpage signs with.
  const fallbackText = project?.creator_handle?.trim() || project?.name || null;
  return {
    enabled: Boolean(project?.watermark_url) || Boolean(fallbackText),
    source: project?.watermark_url ? "project" : "text",
    imageUrl: project?.watermark_url ?? null,
    text: project?.watermark_url ? null : fallbackText,
    position: project?.watermark_position ?? "bottom-right",
    opacity: typeof project?.watermark_opacity === "number" ? project.watermark_opacity : 0.8,
    scale: 0.15,
  };
}

function textLayer(zone: ZoneName, box: Rect, style: TextStyle, text = ""): TextLayer {
  return { id: layerId(zone), type: "text", zone, text, box, style };
}

/**
 * Seeds a document from a base image: text blocks land in the image's own safe
 * zones, styled by whatever the layout preset recommends for that artwork.
 */
export function createDocForBaseImage(params: {
  baseImage: Pick<MascotBaseImage, "id" | "character_id" | "image_url" | "aspect_ratio" | "safe_zones" | "default_text_style" | "recommended_chars">;
  project?: ProjectBrand | null;
  primaryText?: string;
  secondaryText?: string;
}): MemeDoc {
  const { baseImage, project } = params;
  const format = baseImage.aspect_ratio;
  const safeZones = parseSafeZones(baseImage.safe_zones, format);
  const style = parseTextStyle(baseImage.default_text_style);

  const doc = emptyDoc(format);
  doc.base = {
    kind: "base_image",
    baseImageId: baseImage.id,
    characterId: baseImage.character_id,
    imageUrl: baseImage.image_url,
    fit: "cover",
    offset: { x: 0, y: 0 },
    scale: 1,
  };

  const primaryZone: ZoneName = safeZones.zones.top
    ? "top"
    : safeZones.zones.side
      ? "side"
      : safeZones.zones.bottom
        ? "bottom"
        : "center";
  const primaryBox = safeZones.zones[primaryZone as "top" | "bottom" | "side" | "center"];

  if (primaryBox) {
    doc.layers.push(textLayer(primaryZone, primaryBox, style, params.primaryText ?? ""));
  }

  const secondaryZone: ZoneName | null =
    primaryZone !== "bottom" && safeZones.zones.bottom ? "bottom" : null;
  if (secondaryZone && safeZones.zones.bottom) {
    doc.layers.push(
      textLayer(secondaryZone, safeZones.zones.bottom, {
        ...style,
        fontSize: style.fontSize * 0.62,
        maxFontSize: style.maxFontSize * 0.62,
        uppercase: false,
      }, params.secondaryText ?? "")
    );
  }

  doc.watermark = watermarkFromProject(project);
  doc.meta.safeZonesSnapshot = safeZones;
  doc.meta.recommendedChars = baseImage.recommended_chars;
  return doc;
}

/** Opens an already-rendered image (a legacy AI meme) as a background to overlay on. */
export function createDocForRawImage(params: {
  imageUrl: string;
  format: MemeFormat;
  project?: ProjectBrand | null;
}): MemeDoc {
  const doc = emptyDoc(params.format);
  doc.base = {
    kind: "raw_image",
    imageUrl: params.imageUrl,
    fit: "cover",
    offset: { x: 0, y: 0 },
    scale: 1,
  };
  doc.layers.push(
    textLayer("bottom", { x: 0.05, y: 0.74, w: 0.9, h: 0.2 }, DEFAULT_TEXT_STYLE, "")
  );
  doc.watermark = watermarkFromProject(params.project);
  return doc;
}

function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((key) => typeof rect[key] === "number");
}

const FORMATS: MemeFormat[] = ["1:1", "9:16", "16:9", "4:5"];

/** Parses a persisted document. Returns null rather than rendering something wrong. */
export function validateMemeDoc(raw: unknown): MemeDoc | null {
  if (!raw) return null;
  const source = (typeof raw === "string" ? safeParse(raw) : raw) as Record<string, unknown> | null;
  if (!source || source.schema !== MEME_DOC_SCHEMA) return null;
  if (source.version !== MEME_DOC_VERSION) return null;

  const canvas = source.canvas as Record<string, unknown> | undefined;
  const format = FORMATS.includes(canvas?.format as MemeFormat) ? (canvas!.format as MemeFormat) : "1:1";
  const doc = emptyDoc(format);
  if (typeof canvas?.background === "string") doc.canvas.background = canvas.background;

  const base = source.base as Record<string, unknown> | null | undefined;
  if (base && typeof base.imageUrl === "string") {
    doc.base = {
      kind: base.kind === "raw_image" ? "raw_image" : "base_image",
      baseImageId: typeof base.baseImageId === "string" ? base.baseImageId : undefined,
      characterId: typeof base.characterId === "string" ? base.characterId : undefined,
      imageUrl: base.imageUrl,
      fit: base.fit === "contain" ? "contain" : "cover",
      offset: {
        x: typeof (base.offset as Rect | undefined)?.x === "number" ? (base.offset as Rect).x : 0,
        y: typeof (base.offset as Rect | undefined)?.y === "number" ? (base.offset as Rect).y : 0,
      },
      scale: typeof base.scale === "number" ? base.scale : 1,
    } satisfies BaseRef;
  }

  if (Array.isArray(source.layers)) {
    for (const entry of source.layers) {
      const layer = entry as Record<string, unknown>;
      if (layer?.type !== "text" || !isRect(layer.box)) continue;
      doc.layers.push({
        id: typeof layer.id === "string" ? layer.id : layerId("text"),
        type: "text",
        zone: (["top", "center", "bottom", "side", "free"].includes(layer.zone as string)
          ? layer.zone
          : "free") as ZoneName,
        text: typeof layer.text === "string" ? layer.text : "",
        box: layer.box,
        style: parseTextStyle(layer.style),
      });
    }
  }

  const watermark = source.watermark as Record<string, unknown> | null | undefined;
  if (watermark && typeof watermark === "object") {
    doc.watermark = {
      enabled: Boolean(watermark.enabled),
      source: watermark.source === "custom" ? "custom" : watermark.source === "text" ? "text" : "project",
      imageUrl: typeof watermark.imageUrl === "string" ? watermark.imageUrl : null,
      text: typeof watermark.text === "string" ? watermark.text : null,
      position: (watermark.position as WatermarkLayer["position"]) ?? "bottom-right",
      opacity: typeof watermark.opacity === "number" ? watermark.opacity : 0.8,
      scale: typeof watermark.scale === "number" ? watermark.scale : 0.15,
    };
  }

  const meta = source.meta as Record<string, unknown> | undefined;
  doc.meta.createdWith = typeof meta?.createdWith === "string" ? meta.createdWith : CREATED_WITH;
  if (typeof meta?.recommendedChars === "number") doc.meta.recommendedChars = meta.recommendedChars;

  return doc;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Reserved for schema growth: v1 is the identity case, v2+ gets a branch here. */
export function migrateMemeDoc(doc: MemeDoc): MemeDoc {
  return doc;
}
