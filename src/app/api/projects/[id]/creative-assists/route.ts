import type { FamilyDevelopmentTrace } from "@/lib/family-development";
import { FAMILY_WRITING_POLICY_VERSION } from "@/lib/family-writing-policy";
import { after, NextRequest, NextResponse } from "next/server";
import {
  creativeAssistModel,
  generateCreativeAssist,
  type CreativeAssistInput,
  type CreativeAssistKind,
} from "@/lib/creative-assist";
import { getRequestUser } from "@/lib/supabase/request-auth";
import {
  seedanceImageModel,
  seedanceMaxDuration,
} from "@/lib/video-models";

export const maxDuration = 180;

const KINDS: CreativeAssistKind[] = [
  "idea_suggestions",
  "image_plan",
  "video_clip_plan",
  "video_plan",
  "scene_revision",
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function projectForRef(
  supabase: Awaited<ReturnType<typeof getRequestUser>>["supabase"],
  ref: string,
) {
  const query = supabase
    .from("projects")
    .select(
      "id, name, brand_voice, audience, content_guidelines, workspace_version",
    )
    .limit(1);
  return UUID.test(ref)
    ? query.eq("id", ref).maybeSingle()
    : query.eq("slug", ref).maybeSingle();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await getRequestUser(request);
  if (!user)
    return NextResponse.json(
      { error: "Phiên đăng nhập đã hết hạn." },
      { status: 401 },
    );
  const body = await request.json().catch(() => ({}));
  if (!KINDS.includes(body.kind))
    return NextResponse.json(
      { error: "Loại hỗ trợ AI không hợp lệ." },
      { status: 400 },
    );
  const { data: project } = await projectForRef(supabase, id);
  if (!project)
    return NextResponse.json(
      { error: "Không tìm thấy dự án hoặc bạn không có quyền." },
      { status: 404 },
    );
  if (
    Number.isInteger(body.workspaceVersion) &&
    body.workspaceVersion !== project.workspace_version
  )
    return NextResponse.json(
      {
        error: "Dự án đã được làm mới. Hãy tải lại trang trước khi soạn.",
        code: "WORKSPACE_VERSION_CONFLICT",
      },
      { status: 409 },
    );

  const { data: usage, error: usageError } = await supabase.rpc(
    "creative_assist_usage",
  );
  if (
    usageError ||
    !usage ||
    !Number.isInteger(usage.minuteCount) ||
    !Number.isInteger(usage.dayCount)
  )
    return NextResponse.json(
      { error: "Chưa kiểm tra được hạn mức soạn. Hãy thử lại." },
      { status: 503 },
    );
  const { minuteCount, dayCount } = usage;
  if ((minuteCount ?? 0) >= 5)
    return NextResponse.json(
      {
        error:
          "Bạn đã dùng 5 lượt soạn trong một phút. Hãy thử lại sau ít phút.",
        code: "RATE_LIMIT_MINUTE",
      },
      { status: 429 },
    );
  if ((dayCount ?? 0) >= 30)
    return NextResponse.json(
      {
        error: "Đã đạt giới hạn 30 lượt soạn hôm nay.",
        code: "RATE_LIMIT_DAY",
      },
      { status: 429 },
    );

  const selectedIds: string[] = Array.isArray(body.selectedCharacterIds)
    ? body.selectedCharacterIds
        .filter((value: unknown): value is string => typeof value === "string")
        .slice(0, 4)
    : [];
  const [
    { data: characters, error: charactersError },
    { data: recentSets },
    { data: channel, error: channelError },
    { data: recentPlans, error: recentPlansError },
  ] = await Promise.all([
    supabase
      .from("characters")
      .select(
        "id, name, description, personality, avatar_url, character_poses(image_url)",
      )
      .eq("project_id", project.id),
    supabase
      .from("content_sets")
      .select("title, brief, updated_at")
      .eq("project_id", project.id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", project.id)
      .eq("workspace_version", project.workspace_version)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("video_plans")
      .select("id,title,brief,story")
      .eq("project_id", project.id)
      .eq("workspace_version", project.workspace_version)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  if (channelError || recentPlansError)
    return NextResponse.json(
      {
        error:
          "Không tải được hồ sơ kênh và lịch sử; chưa gửi AI. Hãy thử lại.",
      },
      { status: 503 },
    );
  if (charactersError)
    return NextResponse.json(
      { error: charactersError.message },
      { status: 500 },
    );
  const allowedCharacters = (characters ?? []).map((character) => ({
    id: character.id,
    name: character.name,
    description: character.description,
    personality: character.personality,
    imageUrl:
      character.avatar_url || character.character_poses?.[0]?.image_url || null,
  }));
  if (
    selectedIds.some(
      (characterId) =>
        !allowedCharacters.some((character) => character.id === characterId),
    )
  )
    return NextResponse.json(
      { error: "Nhân vật được chọn không thuộc dự án này." },
      { status: 400 },
    );

  const requestedTarget = Number(
    body.targetDurationSeconds ?? (channel ? 35 : 30),
  );
  if (
    !Number.isInteger(requestedTarget) ||
    requestedTarget < 15 ||
    requestedTarget > 120
  )
    return NextResponse.json(
      { error: "Thời lượng dự kiến phải từ 15 đến 120 giây." },
      { status: 400 },
    );

  const videoModel = seedanceImageModel(body.videoModel);

  const inputSnapshot = {
    kind: body.kind,
    intent: typeof body.intent === "string" ? body.intent.slice(0, 4000) : "",
    channelProfileVersion: channel?.profile?.version ?? null,
    writingPolicyVersion: channel?.profile
      ? FAMILY_WRITING_POLICY_VERSION
      : null,
    recentPlanIds: (recentPlans || []).map((p) => p.id),
    selectedCharacterIds: selectedIds,
    targetDurationSeconds: requestedTarget,
    videoModel,
    maxVideoDurationSeconds: seedanceMaxDuration(videoModel),
    imageMode: body.imageMode,
    sourceImageDescription:
      typeof body.sourceImageDescription === "string"
        ? body.sourceImageDescription.slice(0, 1000)
        : undefined,
    currentScenes: Array.isArray(body.currentScenes)
      ? body.currentScenes
      : undefined,
    lockedSceneIndexes: Array.isArray(body.lockedSceneIndexes)
      ? body.lockedSceneIndexes
      : undefined,
  };
  const { data: job, error: insertError } = await supabase
    .from("creative_assists")
    .insert({
      project_id: project.id,
      draft_key:
        typeof body.draftKey === "string" ? body.draftKey.slice(0, 120) : null,
      kind: body.kind,
      input_snapshot: inputSnapshot,
      status: "running",
      model: creativeAssistModel(body.kind, Boolean(channel?.profile)),
      workspace_version: project.workspace_version,
      created_by: user.id,
    })
    .select("id, status")
    .single();
  if (insertError || !job)
    return NextResponse.json(
      { error: insertError?.message || "Không thể tạo lượt soạn AI." },
      { status: 500 },
    );

  after(async () => {
    const startedAt = Date.now();
    let editorial: FamilyDevelopmentTrace | undefined;
    try {
      const result = await generateCreativeAssist(
        {
          ...inputSnapshot,
          kind: body.kind,
          context: {
            projectName: project.name,
            channelProfile: channel?.profile,
            recentStories: (recentPlans || [])
              .map((p) => p.story)
              .filter(Boolean)
              .map((s) => ({
                series: s.series,
                comicPremise: s.comicPremise,
                situation: s.situation,
                mechanism: s.mechanism,
                outcome: s.outcome,
                wants: s.wants,
                payoff: s.payoff,
              })),
            brandVoice: project.brand_voice,
            audience: project.audience,
            guidelines: project.content_guidelines,
            characters: allowedCharacters,
            recentContent: (recentSets ?? [])
              .map((item) => `${item.title || ""} ${item.brief || ""}`.trim())
              .filter(Boolean),
          },
        } as CreativeAssistInput,
        {
          onEditorialProgress: async (trace) => {
            editorial = trace;
            const { error } = await supabase
              .from("creative_assists")
              .update({
                usage: {
                  duration_ms: Date.now() - startedAt,
                  profile_version: channel?.profile?.version ?? null,
                  editorial: trace,
                },
              })
              .eq("id", job.id)
              .select("id")
              .single();
            if (error) throw new Error("FAMILY_CHECKPOINT_SAVE_FAILED");
          },
        },
      );
      const { error: saveError } = await supabase
        .from("creative_assists")
        .update({
          status: "completed",
          result,
          completed_at: new Date().toISOString(),
          usage: {
            editorial,
            duration_ms: Date.now() - startedAt,
            profile_version: channel?.profile?.version ?? null,
          },
        })
        .eq("id", job.id)
        .select("id")
        .single();
      if (saveError) throw new Error("CREATIVE_RESULT_SAVE_FAILED");
    } catch (error) {
      await supabase
        .from("creative_assists")
        .update({
          status: "failed",
          error: {
            code:
              error instanceof Error ? error.message : "CREATIVE_ASSIST_FAILED",
            message: editorial
              ? "AI chưa tìm được bản đủ tốt hoặc chưa hoàn tất lượt soạn. Bản nháp trước của bạn vẫn được giữ."
              : "Không thể hoàn tất lượt soạn AI.",
          },
          completed_at: new Date().toISOString(),
          usage: {
            editorial,
            duration_ms: Date.now() - startedAt,
            profile_version: channel?.profile?.version ?? null,
          },
        })
        .eq("id", job.id);
    }
  });
  return NextResponse.json(
    { jobId: job.id, status: "accepted" },
    { status: 202 },
  );
}
