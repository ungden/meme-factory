"use client";

import { useState, useEffect, useCallback } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  TrendingUp,
  Coins,
  FolderOpen,
  Image,
  RefreshCw,
} from "lucide-react";

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

function formatVND(amount: number) {
  return amount.toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const [statsRes, overviewRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!statsRes.ok) throw new Error((await statsRes.json()).error);
      setStats(await statsRes.json());
      // The overview is extra detail; a failure here must not blank the dashboard.
      if (overviewRes.ok) setOverview(await overviewRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const statCards = stats
    ? [
        { label: "Người dùng", value: stats.totalUsers, icon: Users, color: "#6366f1" },
        { label: "Doanh thu", value: formatVND(stats.totalRevenue), icon: TrendingUp, color: "#22c55e" },
        { label: "Points đã dùng", value: stats.totalPointsSpent.toLocaleString("vi-VN"), icon: Coins, color: "#f59e0b" },
        { label: "Dự án", value: stats.totalProjects, icon: FolderOpen, color: "#8b5cf6" },
        { label: "Memes", value: stats.totalMemes, icon: Image, color: "#ec4899" },
      ]
    : [];

  const dailyData = stats
    ? Object.entries(stats.dailyRevenue).map(([date, amount]) => ({
        label: new Date(date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
        value: amount,
      }))
    : [];
  const maxRevenue = Math.max(...dailyData.map((d) => d.value), 1);

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Tổng quan hệ thống</h1>
            <p className="th-text-tertiary mt-1">Thống kê toàn bộ AIDA platform</p>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium th-bg-hover th-text-secondary transition-all"
            style={{ border: "1px solid var(--border-primary)" }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl mb-6" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
            {error}
          </div>
        )}

        {overview && (
          <>
            {/* Lãi lỗ */}
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
                  value={`${overview.finance.outstandingPoints.toLocaleString("vi-VN")} điểm`}
                  hint={`còn phải phục vụ ~${formatVnd(overview.finance.outstandingLiabilityVnd)}`}
                  tone="neutral"
                />
              </div>

              <p className="mt-2 text-[11px] th-text-muted">
                Chi phí AI: {(overview.finance.cost.measuredCoverage * 100).toFixed(1)}% đo được từ{" "}
                {overview.finance.cost.measuredCalls} lần gọi có bản ghi; phần còn lại (
                {overview.finance.cost.reconstructedCalls} lần) dựng lại theo loại hành động vì bản ghi chi
                phí chỉ có từ 22/07/2026.
                {overview.finance.cost.unattributedCalls > 0 &&
                  ` ${overview.finance.cost.unattributedCalls} lần không rõ loại nên chưa tính được.`}
              </p>
            </section>

            {/* Điểm tiêu theo tính năng */}
            {overview.finance.spendByAction.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold th-text-primary">Điểm tiêu theo tính năng</h2>
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
                  {overview.finance.spendByAction.map((row) => {
                    const share = overview.finance.pointsConsumed
                      ? (row.points / overview.finance.pointsConsumed) * 100
                      : 0;
                    return (
                      <div key={row.action ?? "unknown"} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0" style={{ borderColor: "var(--border-primary)" }}>
                        <span className="w-32 shrink-0 text-sm th-text-primary">{ACTION_LABELS[row.action ?? "unknown"] ?? row.action}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full th-bg-tertiary">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-40 shrink-0 text-right text-xs th-text-tertiary">
                          {row.points.toLocaleString("vi-VN")} điểm · {row.calls} lần · {share.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                {overview.finance.refundedPoints > 0 && (
                  <p className="mt-2 text-[11px] th-text-muted">
                    Đã hoàn {overview.finance.refundedPoints.toLocaleString("vi-VN")} điểm cho{" "}
                    {overview.finance.refundedCalls} lần tạo lỗi — những lần này không tính chi phí vì
                    provider không xuất ảnh.
                  </p>
                )}
              </section>
            )}

            {/* Tài sản */}
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold th-text-primary">Tài sản trên hệ thống</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <AssetCard label="Người dùng" value={overview.assets.users} />
                <AssetCard label="Dự án" value={overview.assets.projects} />
                <AssetCard label="Mascot" value={overview.assets.mascots} />
                <AssetCard label="Ảnh gốc" value={overview.assets.poses} />
                <AssetCard
                  label="Mẫu meme"
                  value={overview.assets.templatesReady}
                  hint={`/${overview.assets.templates} dùng được`}
                  warn={overview.assets.templates > 0 && overview.assets.templatesReady === 0}
                />
                <AssetCard
                  label="Meme"
                  value={overview.assets.memes}
                  hint={`${overview.assets.memesComposedLocally} ghép chữ`}
                />
                <AssetCard label="Lượt tải" value={overview.assets.exports} />
              </div>
              {overview.health.failedJobs > 0 && (
                <p className="mt-2 text-[11px] th-text-muted">
                  {overview.health.failedJobs} lần tạo thất bại đã ghi nhận và hoàn điểm.
                </p>
              )}
            </section>

            {/* Toàn vẹn sổ sách */}
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
                return (
                  <div className="rounded-2xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                    {clean ? (
                      <p className="text-sm" style={{ color: "#16a34a" }}>
                        Không có sai lệch. Mọi lần trừ điểm đều có bản ghi job và số chi phí đi kèm.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {checks.map((check) => (
                          <div key={check.label} className="flex items-center justify-between text-xs">
                            <span className={check.value > 0 ? "th-text-danger" : "th-text-tertiary"}>{check.label}</span>
                            <span className={`tabular-nums font-medium ${check.value > 0 ? "th-text-danger" : "th-text-tertiary"}`}>
                              {check.value}
                            </span>
                          </div>
                        ))}
                        <p className="pt-1 text-[11px] th-text-muted">
                          Số liệu cũ trước 22/07/2026 không có bản ghi job nên luôn nằm ở dòng thứ ba; từ mốc
                          đó về sau con số này phải đứng yên.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          </>
        )}

        {loading && !stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-28 th-bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className="p-5 rounded-2xl border"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium th-text-tertiary uppercase tracking-wider">{card.label}</span>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${card.color}20` }}>
                      <card.icon size={16} style={{ color: card.color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold th-text-primary">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Revenue Chart + Recent Users */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Revenue Chart */}
              <div
                className="lg:col-span-2 p-6 rounded-2xl border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
              >
                <h2 className="text-sm font-semibold th-text-primary mb-4">Doanh thu 7 ngày qua</h2>
                <div className="flex items-end gap-2 h-40">
                  {dailyData.map((d) => (
                    <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] th-text-muted">
                        {d.value > 0 ? formatVND(d.value) : ""}
                      </span>
                      <div
                        className="w-full rounded-t-lg transition-all"
                        style={{
                          height: `${Math.max((d.value / maxRevenue) * 100, 4)}%`,
                          background: d.value > 0 ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "var(--bg-tertiary)",
                          minHeight: "4px",
                        }}
                      />
                      <span className="text-[10px] th-text-muted">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Users */}
              <div
                className="p-6 rounded-2xl border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
              >
                <h2 className="text-sm font-semibold th-text-primary mb-4">Người dùng mới</h2>
                <div className="space-y-3">
                  {stats.recentUsers.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm th-text-primary truncate">{u.email}</p>
                        <p className="text-xs th-text-muted">{formatDate(u.created_at)}</p>
                      </div>
                      <span className="text-xs font-medium th-text-accent ml-2">{u.points} pts</span>
                    </div>
                  ))}
                  {stats.recentUsers.length === 0 && (
                    <p className="text-sm th-text-muted text-center py-4">Chưa có người dùng</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div
              className="p-6 rounded-2xl border"
              style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
            >
              <h2 className="text-sm font-semibold th-text-primary mb-4">Giao dịch gần đây</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="th-text-muted text-xs uppercase tracking-wider">
                      <th className="text-left py-2 pr-4">Thời gian</th>
                      <th className="text-left py-2 pr-4">Email</th>
                      <th className="text-left py-2 pr-4">Loại</th>
                      <th className="text-left py-2 pr-4">Mô tả</th>
                      <th className="text-right py-2">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentTransactions.map((tx) => (
                      <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                        <td className="py-2.5 pr-4 th-text-muted text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                        <td className="py-2.5 pr-4 th-text-primary truncate max-w-[160px]">{tx.user_email}</td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{
                              background: tx.type === "topup" ? "rgba(34,197,94,0.15)" : tx.type === "refund" ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)",
                              color: tx.type === "topup" ? "#22c55e" : tx.type === "refund" ? "#3b82f6" : "#ef4444",
                            }}
                          >
                            {tx.type === "topup" ? "Nạp" : tx.type === "refund" ? "Hoàn" : "Chi"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 th-text-secondary text-xs truncate max-w-[200px]">{tx.description}</td>
                        <td className="py-2.5 text-right font-medium" style={{ color: Number(tx.amount) >= 0 ? "#22c55e" : "#ef4444" }}>
                          {Number(tx.amount) >= 0 ? "+" : ""}{formatVND(Number(tx.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.recentTransactions.length === 0 && (
                  <p className="text-sm th-text-muted text-center py-8">Chưa có giao dịch</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  meme: "Ảnh meme AI",
  character: "Ảnh nhân vật",
  background: "Background",
  content: "Nội dung text",
  unknown: "Không rõ loại",
};

function formatVnd(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
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
  const color = tone === "profit" ? "#16a34a" : tone === "cost" ? "#f97316" : undefined;
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
      <p className="text-xs th-text-tertiary">{label}</p>
      <p className="mt-1 text-xl font-bold th-text-primary" style={color ? { color } : undefined}>
        {value}
      </p>
      {hint && <p className="text-[11px] th-text-muted">{hint}</p>}
    </div>
  );
}

function AssetCard({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
      <p className="text-[11px] th-text-tertiary">{label}</p>
      <p className={`text-lg font-semibold ${warn ? "th-text-danger" : "th-text-primary"}`}>
        {value.toLocaleString("vi-VN")}
      </p>
      {hint && <p className="text-[10px] th-text-muted">{hint}</p>}
    </div>
  );
}
