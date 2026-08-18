"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import MemeEditor from "@/components/editor/meme-editor";
import { createDocForRawImage, validateMemeDoc } from "@/lib/meme-doc/schema";
import { useMemes, useProject } from "@/lib/use-store";
import type { MemeDoc } from "@/lib/meme-doc/types";

export default function MemeEditorPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectRef = params.id;

  const { project } = useProject(projectRef);
  const { memes } = useMemes(projectRef);

  const baseImageId = searchParams.get("base");
  const sourceMemeId = searchParams.get("meme");
  const initialText = searchParams.get("text");

  const sourceMeme = useMemo(
    () => (sourceMemeId ? memes.find((meme) => meme.id === sourceMemeId) ?? null : null),
    [memes, sourceMemeId]
  );

  const { initialDoc, isLegacyOverlay } = useMemo<{ initialDoc: MemeDoc | null; isLegacyOverlay: boolean }>(() => {
    if (!sourceMeme) return { initialDoc: null, isLegacyOverlay: false };

    const parsed = validateMemeDoc(sourceMeme.editor_doc);
    if (parsed) return { initialDoc: parsed, isLegacyOverlay: false };

    // A meme generated before the editor existed: its text is baked into the
    // pixels, so it can only be overlaid, never edited.
    if (!sourceMeme.image_url) return { initialDoc: null, isLegacyOverlay: false };
    return {
      initialDoc: createDocForRawImage({
        imageUrl: sourceMeme.image_url,
        format: sourceMeme.format,
        project,
      }),
      isLegacyOverlay: true,
    };
  }, [sourceMeme, project]);

  return (
    <div className="flex">
      <Sidebar projectId={projectRef} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold th-text-primary">Ghép chữ</h1>
          <p className="th-text-tertiary mt-1">
            Chọn ảnh mascot có sẵn rồi đặt chữ lên. Không gọi AI, không trừ điểm.
          </p>
        </div>

        {isLegacyOverlay && (
          <div
            className="mb-4 rounded-xl border p-3 text-sm"
            style={{ background: "var(--bg-card)", borderColor: "var(--warning, #d97706)" }}
          >
            Meme này được tạo trước khi có trình ghép chữ, nên chữ cũ đã nằm sẵn trong ảnh: bạn chỉ có thể
            đặt chữ mới đè lên, không sửa được chữ cũ.
          </div>
        )}

        <MemeEditor
          projectRef={projectRef}
          project={project}
          initialDoc={initialDoc}
          initialBaseImageId={baseImageId}
          initialText={initialText}
          sourceMemeId={sourceMemeId}
        />
      </main>
    </div>
  );
}
