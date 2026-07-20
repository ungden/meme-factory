import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { supabaseAdmin } from "@/lib/admin";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveProject(request: NextRequest, projectRef: string) {
  const { supabase, user } = await getRequestUser(request);

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const query = supabase.from("projects").select("id, user_id, name").limit(1);
  const { data: project } = isUuid(projectRef)
    ? await query.eq("id", projectRef).maybeSingle()
    : await query.eq("slug", projectRef).maybeSingle();

  if (!project) {
    return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  }

  return { user, project, supabase };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveProject(_req, id);
  if ("error" in resolved) return resolved.error;

  const { project, supabase } = resolved;

  const { data: wallet } = await supabase
    .from("project_wallets")
    .select("points")
    .eq("project_id", project.id)
    .maybeSingle();

  const { data: transactions } = await supabase
    .from("project_transactions")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({
    project_id: project.id,
    points: wallet?.points ?? 0,
    transactions: transactions ?? [],
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveProject(req, id);
  if ("error" in resolved) return resolved.error;

  const { user, project } = resolved;
  if (user.id !== project.user_id) {
    return NextResponse.json({ error: "Chỉ owner mới được nạp ví dự án" }, { status: 403 });
  }

  const body = await req.json();
  const points = Number(body?.points || 0);
  if (!Number.isFinite(points) || points <= 0) {
    return NextResponse.json({ error: "Số points không hợp lệ" }, { status: 400 });
  }

  const { data: result, error } = await supabaseAdmin.rpc("atomic_deposit_points_to_project", {
    _project_id: project.id,
    _owner_user_id: user.id,
    _points_to_deposit: points,
    _description: `Nạp ví dự án ${project.name}: +${points} points`,
  });

  if (error) {
    return NextResponse.json({ error: "Lỗi nạp ví dự án" }, { status: 500 });
  }

  if (!result?.success) {
    if (result?.error === "Insufficient points") {
      return NextResponse.json(
        {
          error: `Points cá nhân không đủ. Cần ${points} points, hiện có ${Number(result?.points ?? 0)} points`,
          code: "INSUFFICIENT_POINTS",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: result?.error || "Không thể nạp ví dự án" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    project_points: result.project_points,
    user_points: result.user_points,
    deposited: points,
  });
}
