"use client";

import { useParams } from "next/navigation";
import { ContinuityStudio } from "@/components/continuity/continuity-studio";
import { useProject } from "@/lib/use-store";

export default function ContinuityStudioPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { project, loading } = useProject(projectId);

  return (
    <ContinuityStudio
      projectId={project?.id ?? projectId}
      projectName={loading ? "Đang tải dự án…" : (project?.name ?? "Dự án")}
    />
  );
}
