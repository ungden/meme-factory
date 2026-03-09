"use client";

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import type { MemeContent, MemeFormat, SelectedCharacter, CharacterPose } from "@/types/database";
import { FORMAT_DIMENSIONS } from "@/types/database";

interface MemeCanvasProps {
  content: MemeContent | null;
  characters: (SelectedCharacter & { pose_image_url: string })[];
  format: MemeFormat;
  watermarkUrl?: string | null;
  watermarkPosition?: string;
  watermarkOpacity?: number;
  showWatermark: boolean;
  backgroundColor?: string;
}

export interface MemeCanvasHandle {
  exportImage: () => string | null;
}

const MemeCanvas = forwardRef<MemeCanvasHandle, MemeCanvasProps>(
  ({ content, characters, format, watermarkUrl, watermarkPosition = "bottom-right", watermarkOpacity = 0.8, showWatermark, backgroundColor }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
    const [watermarkImg, setWatermarkImg] = useState<HTMLImageElement | null>(null);

    const dims = FORMAT_DIMENSIONS[format];
    // Display at half size for preview
    const scale = 0.5;
    const displayWidth = dims.width * scale;
    const displayHeight = dims.height * scale;

    // Load character images
    useEffect(() => {
      const imageMap = new Map<string, HTMLImageElement>();
      let loaded = 0;
      const total = characters.length;

      if (total === 0) {
        setLoadedImages(imageMap);
        return;
      }

      characters.forEach((char) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          imageMap.set(char.pose_id, img);
          loaded++;
          if (loaded === total) setLoadedImages(new Map(imageMap));
        };
        img.onerror = () => {
          loaded++;
          if (loaded === total) setLoadedImages(new Map(imageMap));
        };
        img.src = char.pose_image_url;
      });
    }, [characters]);

    // Load watermark
    useEffect(() => {
      if (watermarkUrl && showWatermark) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => setWatermarkImg(img);
        img.src = watermarkUrl;
      } else {
        setWatermarkImg(null);
      }
    }, [watermarkUrl, showWatermark]);

    const drawCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set actual canvas size (full resolution)
      canvas.width = dims.width;
      canvas.height = dims.height;

      // Background
      ctx.fillStyle = backgroundColor || "#1a1a2e";
      ctx.fillRect(0, 0, dims.width, dims.height);

      // Draw gradient overlay
      const gradient = ctx.createLinearGradient(0, 0, 0, dims.height);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, dims.width, dims.height);

      // Draw characters
      const numChars = characters.length;
      characters.forEach((char, index) => {
        const img = loadedImages.get(char.pose_id);
        if (!img) return;

        // Calculate position based on number of characters
        let x: number, y: number, charWidth: number, charHeight: number;

        const maxCharHeight = dims.height * 0.65;
        const aspectRatio = img.width / img.height;
        charHeight = maxCharHeight;
        charWidth = charHeight * aspectRatio;

        if (numChars === 1) {
          x = (dims.width - charWidth) / 2;
          y = dims.height - charHeight - dims.height * 0.05;
        } else if (numChars === 2) {
          const spacing = dims.width * 0.1;
          if (index === 0) {
            x = spacing;
          } else {
            x = dims.width - charWidth - spacing;
          }
          y = dims.height - charHeight - dims.height * 0.05;
        } else {
          const totalWidth = numChars * charWidth;
          const spacing = (dims.width - totalWidth) / (numChars + 1);
          x = spacing + index * (charWidth + spacing);
          y = dims.height - charHeight - dims.height * 0.05;
        }

        ctx.drawImage(img, x, y, charWidth, charHeight);
      });

      // Draw text
      if (content) {
        const textPosition = content.layout_suggestion?.text_position || "top";

        // Headline
        if (content.headline) {
          const fontSize = Math.min(dims.width * 0.07, 72);
          ctx.font = `bold ${fontSize}px 'Arial', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const maxWidth = dims.width * 0.85;
          const lines = wrapText(ctx, content.headline, maxWidth);

          let textY: number;
          if (textPosition === "top") {
            textY = dims.height * 0.12;
          } else if (textPosition === "bottom") {
            textY = dims.height * 0.85;
          } else if (textPosition === "center") {
            textY = dims.height * 0.45;
          } else {
            textY = dims.height * 0.12;
          }

          lines.forEach((line, i) => {
            const lineY = textY + i * (fontSize * 1.3);

            // Text shadow/stroke for readability
            ctx.strokeStyle = "rgba(0,0,0,0.8)";
            ctx.lineWidth = fontSize * 0.12;
            ctx.lineJoin = "round";
            ctx.strokeText(line, dims.width / 2, lineY);

            // Fill text
            ctx.fillStyle = "#ffffff";
            ctx.fillText(line, dims.width / 2, lineY);
          });
        }

        // Subtext
        if (content.subtext) {
          const subFontSize = Math.min(dims.width * 0.04, 40);
          ctx.font = `600 ${subFontSize}px 'Arial', sans-serif`;

          let subY: number;
          if (textPosition === "top") {
            subY = dims.height * 0.22;
          } else if (textPosition === "bottom") {
            subY = dims.height * 0.92;
          } else {
            subY = dims.height * 0.55;
          }

          ctx.strokeStyle = "rgba(0,0,0,0.7)";
          ctx.lineWidth = subFontSize * 0.1;
          ctx.strokeText(content.subtext, dims.width / 2, subY);

          ctx.fillStyle = "#e0e0e0";
          ctx.fillText(content.subtext, dims.width / 2, subY);
        }
      }

      // Draw watermark
      if (showWatermark && watermarkImg) {
        const wmMaxSize = dims.width * 0.15;
        const wmAspect = watermarkImg.width / watermarkImg.height;
        const wmWidth = wmMaxSize;
        const wmHeight = wmWidth / wmAspect;
        const padding = dims.width * 0.03;

        let wmX: number, wmY: number;
        switch (watermarkPosition) {
          case "top-left":
            wmX = padding;
            wmY = padding;
            break;
          case "top-right":
            wmX = dims.width - wmWidth - padding;
            wmY = padding;
            break;
          case "bottom-left":
            wmX = padding;
            wmY = dims.height - wmHeight - padding;
            break;
          case "center":
            wmX = (dims.width - wmWidth) / 2;
            wmY = (dims.height - wmHeight) / 2;
            break;
          case "bottom-right":
          default:
            wmX = dims.width - wmWidth - padding;
            wmY = dims.height - wmHeight - padding;
            break;
        }

        ctx.globalAlpha = watermarkOpacity;
        ctx.drawImage(watermarkImg, wmX, wmY, wmWidth, wmHeight);
        ctx.globalAlpha = 1;
      }
    }, [content, characters, loadedImages, format, dims, showWatermark, watermarkImg, watermarkPosition, watermarkOpacity, backgroundColor]);

    useEffect(() => {
      drawCanvas();
    }, [drawCanvas]);

    useImperativeHandle(ref, () => ({
      exportImage: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.toDataURL("image/png");
      },
    }));

    return (
      <div className="relative bg-gray-800 rounded-2xl overflow-hidden inline-block">
        <canvas
          ref={canvasRef}
          style={{
            width: displayWidth,
            height: displayHeight,
          }}
          className="block"
        />
      </div>
    );
  }
);

MemeCanvas.displayName = "MemeCanvas";
export default MemeCanvas;

// Helper: wrap text into lines
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + " " + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}
