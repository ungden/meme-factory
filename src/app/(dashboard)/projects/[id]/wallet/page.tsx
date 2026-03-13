"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "@/lib/use-store";
import { useWallet } from "@/contexts/WalletContext";
import { trackEvent } from "@/lib/analytics";
import Sidebar from "@/components/layout/sidebar";
import Card, { CardContent } from "@/components/ui/card";
import Button from "@/components/ui/button";

interface ProjectWalletTransaction {
  id: string;
  amount: number;
  type: "topup" | "payment" | "refund";
  description: string | null;
  created_at: string;
}

export default function ProjectWalletPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, loading: projectLoading } = useProject(projectId);
  const { points: personalPoints, refreshBalance } = useWallet();

  const [projectPoints, setProjectPoints] = useState(0);
  const [projectTx, setProjectTx] = useState<ProjectWalletTransaction[]>([]);
  const [depositPoints, setDepositPoints] = useState("50");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchWallet = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/wallet`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setProjectPoints(Number(data.points || 0));
      setProjectTx((data.transactions || []) as ProjectWalletTransaction[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    fetchWallet();
  }, [projectId]);

  const deposit = async () => {
    const points = Number(depositPoints);
    if (!Number.isFinite(points) || points <= 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Không thể nạp points vào ví dự án");
      } else {
        trackEvent("project_points_deposit", {
          project_id: project?.id || projectId,
          points,
        });
        fetchWallet();
        refreshBalance();
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
            <div className="h-56 th-bg-card rounded-2xl" />
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
          <h1 className="text-2xl font-bold th-text-primary">Ví dự án</h1>
          <p className="th-text-tertiary mt-1">Nạp points từ ví cá nhân để team dùng chung</p>
        </div>

        <Card className="mb-6">
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold th-text-primary">Số dư points</h2>
              <span className="text-sm th-text-muted">{projectPoints.toLocaleString("vi-VN")} pts (cá nhân: {personalPoints.toLocaleString("vi-VN")} pts)</span>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                {[10, 50, 120, 300].map((v) => (
                  <button
                    key={v}
                    onClick={() => setDepositPoints(String(v))}
                    className="px-3 py-1.5 rounded-lg text-xs th-bg-tertiary th-text-secondary"
                  >
                    {v} pts
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={depositPoints}
                  onChange={(e) => setDepositPoints(e.target.value)}
                  className="px-3 py-2 rounded-xl text-sm th-bg-card th-text-primary"
                  style={{ border: "1px solid var(--border-primary)" }}
                />
                <Button onClick={deposit} disabled={busy || !depositPoints || Number(depositPoints) <= 0}>
                  Deposit points
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <h2 className="text-lg font-semibold th-text-primary">Lịch sử ví dự án</h2>
            {projectTx.length === 0 && <p className="text-sm th-text-muted">Chưa có giao dịch.</p>}
            {projectTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
                <div>
                  <p className="text-sm th-text-primary">{tx.description || tx.type}</p>
                  <p className="text-xs th-text-muted">{new Date(tx.created_at).toLocaleString("vi-VN")}</p>
                </div>
                <span className="text-sm font-semibold th-text-primary">{tx.type === "payment" ? "-" : "+"}{tx.amount} pts</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
