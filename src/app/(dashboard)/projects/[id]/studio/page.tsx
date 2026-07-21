"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ContinuityStudio } from "@/components/continuity/continuity-studio";
import { useProject } from "@/lib/use-store";

export default function ContinuityStudioPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const { project, loading } = useProject(projectId);
  const requestedMode = searchParams.get("mode");
  const initialMode = requestedMode === "fashion" || requestedMode === "product" || requestedMode === "storyboard" ? requestedMode : "social";

  return (
    <ContinuityStudio
      projectId={project?.id ?? projectId}
      projectName={loading ? "Đang tải dự án…" : (project?.name ?? "Dự án")}
      initialMode={initialMode}
    />
  );
}
