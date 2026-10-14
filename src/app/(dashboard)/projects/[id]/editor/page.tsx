"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import MemeEditor from "@/components/editor/meme-editor";
import MemeAreaHeader from "@/components/meme/meme-area-header";
import Alert from "@/components/ui/alert";
import { PageContainer } from "@/components/ui/page";
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
    <PageContainer>
      <MemeAreaHeader projectRef={projectRef} mode="text" />

      {isLegacyOverlay && (
        <Alert tone="warning" className="mb-4">
          Meme này làm trước khi có Ghép chữ, nên chữ cũ đã nằm sẵn trong ảnh. Bạn chỉ đặt được chữ mới đè lên, không
          sửa được chữ cũ.
        </Alert>
      )}

      <MemeEditor
        projectRef={projectRef}
        project={project}
        initialDoc={initialDoc}
        initialBaseImageId={baseImageId}
        initialText={initialText}
        sourceMemeId={sourceMemeId}
      />
    </PageContainer>
  );
}
