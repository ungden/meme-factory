"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "@/lib/use-store";
import { useDeferredTask } from "@/lib/use-deferred-task";
import Card, { CardContent } from "@/components/ui/card";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { UserPlus, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/ui/confirm-modal";
import { PageContainer, PageSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import ChannelSettingsHeader from "@/components/layout/channel-settings-tabs";
import { formatDateTime } from "@/lib/format";

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

const DANGER_LINK =
  "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium th-text-danger th-bg-hover disabled:opacity-50";

export default function ProjectMembersPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { loading: projectLoading } = useProject(projectId);

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  /** Một hộp xác nhận theo chủ đề thay cho window.confirm. */
  const [confirmState, setConfirm] = useState<{
    title: string;
    message: string;
    confirmText: string;
    action: () => void;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

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
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
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
        toast.error(data?.error || "Chưa gửi được lời mời. Bạn thử lại nhé.");
      } else {
        toast.success(`Đã gửi lời mời tới ${email}`);
        setMemberEmail("");
        void fetchData();
      }
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setConfirm(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Chưa xoá được thành viên. Bạn thử lại nhé.");
      } else {
        void fetchData();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    setConfirm(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members?invitationId=${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Chưa huỷ được lời mời. Bạn thử lại nhé.");
      } else {
        void fetchData();
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading || projectLoading) return <PageSkeleton width="form" blocks={1} />;

  const pending = invitations.filter((i) => i.status === "pending");

  return (
    <PageContainer width="form">
      <ChannelSettingsHeader description="Mời người khác cùng làm kênh này." />

      {loadFailed && (
        <Alert
          className="mb-4"
          action={<Button variant="outline" size="sm" onClick={() => void fetchData()}>Thử lại</Button>}
        >
          Chưa tải được danh sách thành viên.
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold th-text-primary">Thành viên</h2>
            <span className="text-xs th-text-muted">{members.length} người</span>
          </div>

          {isOwner && (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void addMember();
              }}
            >
              <Input
                type="email"
                aria-label="Email người được mời"
                placeholder="Nhập email để gửi lời mời"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
              />
              <Button type="submit" loading={busy} disabled={!memberEmail.trim()} className="shrink-0">
                <UserPlus size={14} /> Gửi lời mời
              </Button>
            </form>
          )}

          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 th-bg-tertiary">
                <div className="min-w-0">
                  <p className="truncate text-sm th-text-primary">{m.email}</p>
                  <p className="text-xs th-text-muted">{m.is_owner ? "Chủ kênh" : "Thành viên"}</p>
                </div>
                {isOwner && !m.is_owner && (
                  <button
                    type="button"
                    className={DANGER_LINK}
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "Xoá thành viên?",
                        message: `${m.email} sẽ không mở được kênh này nữa.`,
                        confirmText: "Xoá thành viên",
                        action: () => removeMember(m.user_id),
                      })
                    }
                  >
                    <Trash2 size={14} /> Xoá
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isOwner && pending.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-xs th-text-muted">Lời mời đang chờ trả lời</p>
              <ul className="space-y-2">
                {pending.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 th-bg-tertiary">
                    <div className="min-w-0">
                      <p className="truncate text-sm th-text-primary">{inv.invitee_email}</p>
                      <p className="text-xs th-text-muted">Đã mời lúc {formatDateTime(inv.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      className={DANGER_LINK}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          title: "Huỷ lời mời?",
                          message: `Lời mời gửi tới ${inv.invitee_email} sẽ không còn dùng được.`,
                          confirmText: "Huỷ lời mời",
                          action: () => cancelInvitation(inv.id),
                        })
                      }
                    >
                      <Trash2 size={14} /> Huỷ mời
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirmState?.action()}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmText={confirmState?.confirmText}
        variant="danger"
        loading={busy}
      />
    </PageContainer>
  );
}
