"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, TrendingUp, Coins, FolderOpen, Image, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import EmptyState from "@/components/ui/empty-state";
import { PageContainer, PageHeader, Skeleton } from "@/components/ui/page";
import { formatDate, formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { actionLabel, signedTone, transactionType } from "@/components/admin/admin-labels";
import { Badge, TableCard, TableHead, TEXT_TONES, Th, adminFetch, readError } from "@/components/admin/admin-ui";

interface Overview {
  finance: {
    cashCollectedVnd: number;
    providerCostVnd: number;
    grossProfitVnd: number;
    grossMarginPercent: number;
    outstandingPoints: number;
    outstandingLiabilityVnd: number;
    pointsConsumed: number;
    refundedPoints: number;
    refundedCalls: number;
    cost: {
      measuredUsd: number;
      measuredCalls: number;
      reconstructedUsd: number;
      reconstructedCalls: number;
      unattributedCalls: number;
      totalUsd: number;
      totalVnd: number;
      measuredCoverage: number;
    };
    spendByAction: { action: string | null; calls: number; points: number }[];
  };
  assets: {
    projects: number;
    mascots: number;
    poses: number;
    templates: number;
    templatesReady: number;
    memes: number;
    memesComposedLocally: number;
    exports: number;
    users: number;
  };
  health: {
    failedJobs: number;
    jobsByProvider: Record<string, number>;
    integrity: {
      jobsMissingCost: number;
      stuckJobs: number;
      chargesWithoutJob: number;
      chargesWithoutAction: number;
    };
  };
}

interface Stats {
  totalUsers: number;
  totalRevenue: number;
  totalPointsSpent: number;
  totalWalletBalance: number;
  totalWalletPoints: number;
  totalProjects: number;
  totalMemes: number;
  dailyRevenue: Record<string, number>;
  recentTransactions: {
    id: string;
    user_id: string;
    user_email: string;
    amount: number;
    type: string;
    description: string;
    status: string;
    created_at: string;
  }[];
  recentUsers: {
    user_id: string;
    email: string;
    balance: number;
    points: number;
    created_at: string;
  }[];
}

type Operations = {
  worker: { ok: boolean; detail?: string };
  alerts: { key: string; level: "error" | "warning"; message: string }[];
};

function formatVnd(value: number) {
  return `${formatNumber(value)}đ`;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, overviewRes, operationsRes] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/overview"),
        adminFetch("/api/admin/operations"),
      ]);
      if (!statsRes.ok) throw new Error(await readError(statsRes, "Chưa tải được số liệu."));
      setStats(await statsRes.json());
      // Phần tổng quan chỉ là chi tiết thêm; hỏng ở đây không được làm trắng cả trang.
      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (operationsRes.ok) setOperations(await operationsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa tải được số liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const statCards = stats
    ? [
        { label: "Người dùng", value: formatNumber(stats.totalUsers), icon: Users },
        { label: "Doanh thu", value: formatVnd(stats.totalRevenue), icon: TrendingUp },
        { label: "Điểm đã dùng", value: formatNumber(stats.totalPointsSpent), icon: Coins },
        { label: "Kênh", value: formatNumber(stats.totalProjects), icon: FolderOpen },
        { label: "Meme", value: formatNumber(stats.totalMemes), icon: Image },
      ]
    : [];

  const dailyData = stats
    ? Object.entries(stats.dailyRevenue).map(([date, amount]) => ({
        label: formatDate(date).slice(0, 5),
        value: amount,
      }))
    : [];
  const maxRevenue = Math.max(...dailyData.map((d) => d.value), 1);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Tổng quan"
        description="Số liệu toàn hệ thống AIDA."
        actions={
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Làm mới
          </Button>
        }
      />

      {error && (
        <Alert
          className="mb-6"
          action={
            <Button size="sm" variant="outline" onClick={fetchStats}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {operations && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold th-text-primary">Vận hành</h2>
          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm th-text-secondary">
              {operations.worker.ok ? (
                <CheckCircle2 size={16} aria-hidden className="shrink-0 th-text-success" />
              ) : (
                <XCircle size={16} aria-hidden className="shrink-0 th-text-danger" />
              )}
              Worker {operations.worker.ok ? "đang chạy" : "không phản hồi"}
              {operations.worker.detail ? ` — ${operations.worker.detail}` : ""}
            </p>
            {operations.alerts.length === 0 ? (
              <p className="mt-3 text-sm th-text-tertiary">Không có cảnh báo nào.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {operations.alerts.map((alert) => (
                  <Alert key={alert.key} tone={alert.level === "error" ? "danger" : "warning"}>
                    {alert.message}
                  </Alert>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {overview && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold th-text-primary">Tiền vào, tiền ra</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MoneyCard label="Tiền mặt đã thu" value={formatVnd(overview.finance.cashCollectedVnd)} tone="neutral" />
              <MoneyCard label="Chi phí AI" value={formatVnd(overview.finance.providerCostVnd)} tone="cost" />
              <MoneyCard
                label="Lãi gộp"
                value={formatVnd(overview.finance.grossProfitVnd)}
                hint={`biên ${overview.finance.grossMarginPercent.toFixed(1)}%`}
                tone={overview.finance.grossProfitVnd >= 0 ? "profit" : "cost"}
              />
              <MoneyCard
                label="Điểm khách chưa tiêu"
                value={formatPoints(overview.finance.outstandingPoints)}
                hint={`còn phải phục vụ ~${formatVnd(overview.finance.outstandingLiabilityVnd)}`}
                tone="neutral"
              />
            </div>

            <p className="mt-2 text-xs th-text-muted">
              Chi phí AI: {(overview.finance.cost.measuredCoverage * 100).toFixed(1)}% đo được từ{" "}
              {formatNumber(overview.finance.cost.measuredCalls)} lần gọi có bản ghi; phần còn lại (
              {formatNumber(overview.finance.cost.reconstructedCalls)} lần) tính lại theo loại hành động vì bản ghi
              chi phí chỉ có từ 22/07/2026.
              {overview.finance.cost.unattributedCalls > 0 &&
                ` ${formatNumber(overview.finance.cost.unattributedCalls)} lần không rõ loại nên chưa tính được.`}
            </p>
          </section>

          {overview.finance.spendByAction.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold th-text-primary">Điểm tiêu theo tính năng</h2>
              <Card className="overflow-hidden">
                {overview.finance.spendByAction.map((row) => {
                  const share = overview.finance.pointsConsumed
                    ? (row.points / overview.finance.pointsConsumed) * 100
                    : 0;
                  return (
                    <div
                      key={row.action ?? "unknown"}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 th-border last:border-b-0 sm:flex-nowrap"
                    >
                      <span className="w-32 shrink-0 text-sm th-text-primary">{actionLabel(row.action)}</span>
                      <div className="order-last h-1.5 w-full overflow-hidden rounded-full th-bg-tertiary sm:order-none sm:flex-1">
                        {/* Bề rộng thanh là số liệu, không có lớp th-* tương ứng. */}
                        <div className="h-full rounded-full th-bg-accent" style={{ width: `${share}%` }} />
                      </div>
                      <span className="ml-auto shrink-0 text-right text-xs th-text-tertiary sm:w-44">
                        {formatPoints(row.points)} · {formatNumber(row.calls)} lần · {share.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </Card>
              {overview.finance.refundedPoints > 0 && (
                <p className="mt-2 text-xs th-text-muted">
                  Đã hoàn {formatPoints(overview.finance.refundedPoints)} cho {formatNumber(overview.finance.refundedCalls)} lần
                  làm hỏng. Những lần này không tính chi phí vì provider không trả ảnh.
                </p>
              )}
            </section>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold th-text-primary">Tài sản trên hệ thống</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <AssetCard label="Người dùng" value={overview.assets.users} />
              <AssetCard label="Kênh" value={overview.assets.projects} />
              <AssetCard label="Nhân vật" value={overview.assets.mascots} />
              <AssetCard label="Biểu cảm" value={overview.assets.poses} />
              <AssetCard
                label="Mẫu meme"
                value={overview.assets.templatesReady}
                hint={`/${formatNumber(overview.assets.templates)} dùng được`}
                warn={overview.assets.templates > 0 && overview.assets.templatesReady === 0}
              />
              <AssetCard
                label="Meme"
                value={overview.assets.memes}
                hint={`${formatNumber(overview.assets.memesComposedLocally)} ghép chữ`}
              />
              <AssetCard label="Lượt tải về" value={overview.assets.exports} />
            </div>
            {overview.health.failedJobs > 0 && (
              <p className="mt-2 text-xs th-text-muted">
                {formatNumber(overview.health.failedJobs)} lần làm hỏng đã ghi nhận và hoàn điểm.
              </p>
            )}
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold th-text-primary">Toàn vẹn sổ sách</h2>
            {(() => {
              const checks = [
                { label: "Job xong nhưng thiếu số chi phí", value: overview.health.integrity.jobsMissingCost },
                { label: "Job treo quá 10 phút (đã trừ điểm, chưa hoàn)", value: overview.health.integrity.stuckJobs },
                { label: "Lần trừ điểm không có bản ghi job", value: overview.health.integrity.chargesWithoutJob },
                { label: "Lần trừ điểm không rõ loại", value: overview.health.integrity.chargesWithoutAction },
              ];
              const clean = checks.every((check) => check.value === 0);
              return clean ? (
                <Alert tone="success">Không có sai lệch. Mọi lần trừ điểm đều có bản ghi job và số chi phí đi kèm.</Alert>
              ) : (
                <Card className="space-y-1.5 p-4">
                  {checks.map((check) => (
                    <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
                      <span className={check.value > 0 ? "th-text-danger" : "th-text-tertiary"}>{check.label}</span>
                      <span className={`font-medium tabular-nums ${check.value > 0 ? "th-text-danger" : "th-text-tertiary"}`}>
                        {formatNumber(check.value)}
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-xs th-text-muted">
                    Số liệu cũ trước 22/07/2026 không có bản ghi job nên luôn nằm ở dòng thứ ba; từ mốc đó về sau con
                    số này phải đứng yên.
                  </p>
                </Card>
              );
            })()}
          </section>
        </>
      )}

      {loading && !stats ? (
        <div role="status" aria-label="Đang tải" className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {statCards.map((card) => (
              <Card key={card.label} className="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium th-text-tertiary">{card.label}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg th-bg-accent-light th-text-accent">
                    <card.icon size={16} />
                  </span>
                </div>
                <p className="text-2xl font-bold th-text-primary">{card.value}</p>
              </Card>
            ))}
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h2 className="mb-4 text-sm font-semibold th-text-primary">Doanh thu 7 ngày qua</h2>
              <div className="flex h-40 items-end gap-2">
                {dailyData.map((d) => (
                  <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="hidden text-xs th-text-muted sm:block">{d.value > 0 ? formatVnd(d.value) : ""}</span>
                    {/* Chiều cao cột là số liệu, không có lớp th-* tương ứng. */}
                    <div
                      className={`min-h-1 w-full rounded-t-lg transition-all ${d.value > 0 ? "th-bg-accent" : "th-bg-tertiary"}`}
                      style={{ height: `${Math.max((d.value / maxRevenue) * 100, 4)}%` }}
                    />
                    <span className="text-xs th-text-muted">{d.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="mb-4 text-sm font-semibold th-text-primary">Người dùng mới</h2>
              {stats.recentUsers.length === 0 ? (
                <p className="py-4 text-center text-sm th-text-muted">Chưa có người dùng.</p>
              ) : (
                <div className="space-y-3">
                  {stats.recentUsers.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm th-text-primary">{u.email}</p>
                        <p className="text-xs th-text-muted">{formatDateTime(u.created_at)}</p>
                      </div>
                      <span className="ml-2 whitespace-nowrap text-xs font-medium th-text-accent">{formatPoints(u.points)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <h2 className="mb-3 text-sm font-semibold th-text-primary">Giao dịch gần đây</h2>
          {stats.recentTransactions.length === 0 ? (
            <EmptyState title="Chưa có giao dịch" />
          ) : (
            <TableCard>
              <TableHead>
                <Th>Thời gian</Th>
                <Th>Email</Th>
                <Th>Loại</Th>
                <Th>Mô tả</Th>
                <Th align="right">Số tiền</Th>
              </TableHead>
              <tbody>
                {stats.recentTransactions.map((tx) => {
                  const type = transactionType(tx.type);
                  const amount = Number(tx.amount);
                  return (
                    <tr key={tx.id} className="border-t th-border">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs th-text-muted">{formatDateTime(tx.created_at)}</td>
                      <td className="max-w-40 truncate px-4 py-2.5 th-text-primary">{tx.user_email}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={type.tone}>{type.label}</Badge>
                      </td>
                      <td className="max-w-52 truncate px-4 py-2.5 text-xs th-text-secondary">{tx.description}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${TEXT_TONES[signedTone(amount)]}`}>
                        {amount >= 0 ? "+" : ""}
                        {formatVnd(amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}

function MoneyCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "neutral" | "cost" | "profit";
}) {
  const color = tone === "profit" ? "th-text-success" : tone === "cost" ? "th-text-warning" : "th-text-primary";
  return (
    <Card className="p-4">
      <p className="text-xs th-text-tertiary">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {hint && <p className="text-xs th-text-muted">{hint}</p>}
    </Card>
  );
}

function AssetCard({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border p-3 th-bg-card th-border">
      <p className="text-xs th-text-tertiary">{label}</p>
      <p className={`text-lg font-semibold ${warn ? "th-text-danger" : "th-text-primary"}`}>{formatNumber(value)}</p>
      {hint && <p className="text-xs th-text-muted">{hint}</p>}
    </div>
  );
}
