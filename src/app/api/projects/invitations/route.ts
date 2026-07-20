import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { supabaseAdmin } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: invites } = await supabase
    .from("project_invitations")
    .select("id, project_id, invited_by, status, created_at")
    .eq("invitee_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const projectIds = [...new Set((invites || []).map((i) => i.project_id))];
  const inviterIds = [...new Set((invites || []).map((i) => i.invited_by).filter(Boolean))] as string[];

  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .in("id", projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"]);

  const inviterEmails: Record<string, string> = {};
  await Promise.all(
    inviterIds.map(async (uid) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
      inviterEmails[uid] = data.user?.email || "N/A";
    })
  );

  const projectNames = Object.fromEntries((projects || []).map((p) => [p.id, p.name]));

  return NextResponse.json({
    invitations: (invites || []).map((inv) => ({
      id: inv.id,
      project_id: inv.project_id,
      project_name: projectNames[inv.project_id] || "Dự án",
      invited_by_email: inv.invited_by ? inviterEmails[inv.invited_by] || "N/A" : "N/A",
      created_at: inv.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const invitationId = String(body?.invitationId || "");
  const action = String(body?.action || "");

  if (!invitationId || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { data: invite } = await supabase
    .from("project_invitations")
    .select("id, project_id, invitee_user_id, status")
    .eq("id", invitationId)
    .eq("invitee_user_id", user.id)
    .maybeSingle();

  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "Lời mời không còn hiệu lực" }, { status: 400 });
  }

  if (action === "accept") {
    const { error: memberError } = await supabaseAdmin.from("project_members").upsert(
      {
        project_id: invite.project_id,
        user_id: user.id,
        role: "member",
      },
      { onConflict: "project_id,user_id" }
    );

    if (memberError) {
      return NextResponse.json({ error: "Không thể tham gia dự án" }, { status: 500 });
    }
  }

  const { error: inviteError } = await supabaseAdmin
    .from("project_invitations")
    .update({ status: action === "accept" ? "accepted" : "rejected", responded_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (inviteError) {
    return NextResponse.json({ error: "Không thể cập nhật lời mời" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
