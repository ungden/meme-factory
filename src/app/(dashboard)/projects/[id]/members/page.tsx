"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "@/lib/use-store";
import { useDeferredTask } from "@/lib/use-deferred-task";
import Sidebar from "@/components/layout/sidebar";
import Card, { CardContent } from "@/components/ui/card";
import Button from "@/components/ui/button";
import { UserPlus, Trash2 } from "lucide-react";

interface ProjectMember {
  user_id: string;
  email: string;
  role: string;
  is_owner: boolean;
}

interface ProjectInvitation {
  id: string;
  invitee_user_id: string;
  invitee_email: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
}

export default function ProjectMembersPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, loading: projectLoading } = useProject(projectId);

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const membersRes = await fetch(`/api/projects/${projectId}/members`);

      const membersData = await membersRes.json().catch(() => ({}));

      if (membersRes.ok) {
        setMembers(membersData.members || []);
        setInvitations(membersData.invitations || []);
        setIsOwner(Boolean(membersData.isOwner));
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useDeferredTask(fetchData);

  const addMember = async () => {
    const email = memberEmail.trim();
    if (!email) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Không thể gửi lời mời");
      } else {
        setMemberEmail("");
        void fetchData();
      }
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    const ok = window.confirm("Xoá thành viên này khỏi dự án?");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Không thể xoá thành viên");
      } else {
        void fetchData();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    const ok = window.confirm("Huỷ lời mời này?");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members?invitationId=${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Không thể huỷ lời mời");
      } else {
        void fetchData();
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading || projectLoading) {
    return (
      <div className="flex">
        <Sidebar projectId={projectId} />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-72 th-bg-tertiary rounded-lg" />
            <div className="h-40 th-bg-card rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold th-text-primary">Thành viên dự án</h1>
          <p className="th-text-tertiary mt-1">Mời thành viên và quản lý quyền truy cập</p>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold th-text-primary">Danh sách thành viên</h2>
              <span className="text-xs th-text-muted">{members.length} người</span>
            </div>

            {isOwner && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  placeholder="Nhập email để gửi lời mời"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-sm th-bg-card th-text-primary"
                  style={{ border: "1px solid var(--border-primary)" }}
                />
                <Button onClick={addMember} disabled={!memberEmail.trim() || busy}>
                  <UserPlus size={14} /> Gửi lời mời
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
                  <div>
                    <p className="text-sm th-text-primary">{m.email}</p>
                    <p className="text-xs th-text-muted">{m.is_owner ? "Owner" : "Member"}</p>
                  </div>
                  {isOwner && !m.is_owner && (
                    <button
                      onClick={() => removeMember(m.user_id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
                      disabled={busy}
                    >
                      <Trash2 size={12} /> Xoá
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isOwner && invitations.filter((i) => i.status === "pending").length > 0 && (
              <div className="pt-2">
                <p className="text-xs th-text-muted mb-2">Lời mời đang chờ phản hồi</p>
                <div className="space-y-2">
                  {invitations
                    .filter((i) => i.status === "pending")
                    .map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
                        <div>
                          <p className="text-sm th-text-primary">{inv.invitee_email}</p>
                          <p className="text-xs th-text-muted">Đã mời lúc {new Date(inv.created_at).toLocaleString("vi-VN")}</p>
                        </div>
                        <button
                          onClick={() => cancelInvitation(inv.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
                          disabled={busy}
                        >
                          <Trash2 size={12} /> Huỷ mời
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
