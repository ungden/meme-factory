import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import type { GenerationJobRecord } from "@/types/database";

// Client-facing progress for a persisted generation job. The provider call is a
// single blocking request, so progress is derived from the persisted status
// instead of a provider-reported percentage.
const STATUS_PROGRESS: Record<GenerationJobRecord["status"], number> = {
  queued: 12,
  running: 55,
  completed: 100,
  failed: 100,
  cancelled: 100,
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Job id không hợp lệ" }, { status: 400 });
  }

  const { supabase, user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  }

  // RLS keeps this scoped to projects the caller owns or collaborates on.
  const { data: job, error } = await supabase
    .from("generation_jobs")
    .select(
      "id, project_id, creation_kind, source_entity_type, source_entity_id, workflow_version, provider, model, continuity_policy, status, compiled_prompt, reference_manifest, dropped_references, manifest_hash, requested_output, estimated_points, actual_points, estimated_cost_usd, actual_cost_usd, error, created_at, started_at, completed_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Generation job read failed:", error.message);
    return NextResponse.json({ error: "Không đọc được tiến trình tạo ảnh." }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "Không tìm thấy tiến trình tạo ảnh." }, { status: 404 });
  }

  const { data: outputs } = await supabase
    .from("generation_outputs")
    .select("id, variant_index, object_url, review_status, metadata, created_at")
    .eq("generation_job_id", job.id)
    .order("variant_index");

  const requestedOutput = (job.requested_output ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: STATUS_PROGRESS[job.status as GenerationJobRecord["status"]] ?? 0,
    projectId: job.project_id,
    creationKind: job.creation_kind,
    manifestHash: job.manifest_hash,
    recipe: {
      shotVersionId: job.source_entity_id ?? "draft",
      provider: job.provider,
      model: job.model,
      prompt: job.compiled_prompt,
      references: job.reference_manifest ?? [],
      droppedReferences: job.dropped_references ?? [],
      policy: job.continuity_policy,
      output: {
        width: Number(requestedOutput.width ?? 1024),
        height: Number(requestedOutput.height ?? 1024),
        quality: (requestedOutput.quality as string) ?? "standard",
        count: Number(requestedOutput.count ?? 1),
      },
    },
    estimatedPoints: job.estimated_points,
    actualPoints: job.actual_points,
    estimatedCostUsd: job.estimated_cost_usd === null ? 0 : Number(job.estimated_cost_usd),
    actualCostUsd: job.actual_cost_usd === null ? undefined : Number(job.actual_cost_usd),
    error: job.error ?? undefined,
    outputs: outputs ?? [],
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  });
}
