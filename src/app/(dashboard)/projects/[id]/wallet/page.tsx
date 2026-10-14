"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { History } from "lucide-react";
import { useProject } from "@/lib/use-store";
import { useDeferredTask } from "@/lib/use-deferred-task";
import { useWallet } from "@/contexts/WalletContext";
import { trackEvent } from "@/lib/analytics";
import Alert from "@/components/ui/alert";
import Card, { CardContent } from "@/components/ui/card";
import Button, { buttonClasses } from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import { PageContainer, PageSkeleton } from "@/components/ui/page";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import { invalidateClientCache } from "@/lib/client-fetch";
import { formatDateTime, formatPoints } from "@/lib/format";
import { transactionLabel } from "@/lib/point-pricing";
import { describeTransaction } from "@/lib/wallet-text";
import { useToast } from "@/components/ui/toast";
import ChannelSettingsHeader from "@/components/layout/channel-settings-tabs";

interface ProjectWalletTransaction {
  id: string;
  amount: number;
  type: "topup" | "payment" | "refund";
  description: string | null;
  created_at: string;
}

const QUICK_POINTS = [10, 50, 120, 300];

export default function ProjectWalletPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, loading: projectLoading } = useProject(projectId);
  const { points: personalPoints, refreshBalance } = useWallet();
  const toast = useToast();

  const [projectPoints, setProjectPoints] = useState(0);
  const [projectTx, setProjectTx] = useState<ProjectWalletTransaction[]>([]);
  const [isOwner, setIsOwner] = useState(true);
  const [depositPoints, setDepositPoints] = useState("50");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [shortfall, setShortfall] = useState<{ required: number; current: number } | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/wallet?include=transactions`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      setProjectPoints(Number(data.points || 0));
      setProjectTx((data.transactions || []) as ProjectWalletTransaction[]);
      setIsOwner(data.is_owner !== false);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useDeferredTask(fetchWallet);

  const deposit = async () => {
    const points = Number(depositPoints);
    if (!Number.isSafeInteger(points) || points <= 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.code === "INSUFFICIENT_POINTS") {
        setShortfall({ required: points, current: Number(data.available ?? personalPoints) });
      } else if (!res.ok) {
        toast.error(data?.error || "Chưa chuyển được điểm. Bạn thử lại nhé.");
      } else {
        trackEvent("project_points_deposit", {
          project_id: project?.id || projectId,
          points,
        });
        toast.success(`Đã chuyển ${formatPoints(points)} vào kênh`);
        void fetchWallet();
        void refreshBalance();
        invalidateClientCache(`/api/projects/${projectId}/wallet`);
      }
    } catch {
      toast.error("Chưa chuyển được điểm. Bạn thử lại nhé.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || projectLoading) return <PageSkeleton width="form" />;

  const amount = Number(depositPoints);
  const validAmount = Number.isSafeInteger(amount) && amount > 0;

  return (
    <PageContainer width="form">
      <ChannelSettingsHeader description="Mọi bài của kênh trừ vào điểm của kênh. Chủ kênh chuyển điểm từ ví vào đây để cả nhóm dùng chung." />

      {loadFailed && (
        <Alert
          className="mb-4"
          action={<Button variant="outline" size="sm" onClick={() => void fetchWallet()}>Thử lại</Button>}
        >
          Chưa tải được điểm của kênh.
        </Alert>
      )}

      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold th-text-primary">Điểm của kênh</h2>
            <p className="mt-1 text-2xl font-bold th-text-primary">{formatPoints(projectPoints)}</p>
            <p className="mt-1 text-sm th-text-tertiary">Ví của bạn còn {formatPoints(personalPoints)}.</p>
          </div>

          {isOwner ? (
            <>
              <p className="text-sm th-text-secondary">
                Hết điểm giữa chừng thì AIDA tự chuyển từ ví của bạn, nên thường bạn không cần làm gì ở đây.
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Số điểm hay dùng">
                {QUICK_POINTS.map((value) => (
                  <Chip key={value} selected={amount === value} onClick={() => setDepositPoints(String(value))}>
                    {formatPoints(value)}
                  </Chip>
                ))}
              </div>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void deposit();
                }}
              >
                <div className="sm:w-40">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    aria-label="Số điểm muốn chuyển"
                    value={depositPoints}
                    onChange={(e) => setDepositPoints(e.target.value)}
                  />
                </div>
                <Button type="submit" loading={busy} disabled={!validAmount}>
                  Chuyển điểm vào kênh
                </Button>
              </form>
              <Link href="/wallet" className={buttonClasses("ghost", "sm", "-ml-3")}>
                Mua thêm điểm ở Ví
              </Link>
            </>
          ) : (
            <Alert tone="info">Chỉ chủ kênh chuyển được điểm vào kênh. Kênh hết điểm thì nhờ chủ kênh thêm điểm nhé.</Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2">
          <h2 className="text-lg font-semibold th-text-primary">Lịch sử điểm của kênh</h2>
          {projectTx.length === 0 ? (
            <EmptyState icon={History} title="Chưa có giao dịch" hint="Điểm chuyển vào và điểm các bài đã dùng sẽ hiện ở đây." />
          ) : (
            <ul className="space-y-2">
              {projectTx.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 th-bg-tertiary">
                  <div className="min-w-0">
                    <p className="truncate text-sm th-text-primary">{describeTransaction(tx.description) || transactionLabel(tx.type)}</p>
                    <p className="text-xs th-text-muted">{formatDateTime(tx.created_at)}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${tx.type === "payment" ? "th-text-primary" : "th-text-success"}`}>
                    {tx.type === "payment" ? "−" : "+"}{formatPoints(Math.abs(tx.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <OutOfPointsModal
        open={!!shortfall}
        onClose={() => setShortfall(null)}
        required={shortfall?.required ?? 0}
        current={shortfall?.current ?? 0}
        action="Chuyển điểm vào kênh"
        onFunded={() => {
          setShortfall(null);
          void refreshBalance().then(deposit);
        }}
      />
    </PageContainer>
  );
}
