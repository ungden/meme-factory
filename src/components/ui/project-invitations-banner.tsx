"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/button";
import { IS_MOCK_MODE } from "@/lib/use-store";

interface ProjectInvitation {
  id: string;
  project_id: string;
  project_name: string;
  invited_by_email: string;
  created_at: string;
}

export default function ProjectInvitationsBanner() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (IS_MOCK_MODE) return;
    try {
      const res = await fetch("/api/projects/invitations");
      const data = await res.json();
      if (!res.ok) return;
      setInvitations(data.invitations || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const respond = async (invitationId: string, action: "accept" | "reject") => {
    setBusyId(invitationId);
    try {
      const res = await fetch("/api/projects/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId, action }),
      });
      if (res.ok) {
        await fetchInvitations();
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
          style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}
        >
          <p className="text-sm th-text-primary">
            <strong>{inv.invited_by_email}</strong> mời bạn tham gia dự án <strong>{inv.project_name}</strong>
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => respond(inv.id, "accept")}
              loading={busyId === inv.id}
              disabled={busyId !== null && busyId !== inv.id}
            >
              Đồng ý
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => respond(inv.id, "reject")}
              disabled={busyId !== null && busyId !== inv.id}
            >
              Từ chối
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
