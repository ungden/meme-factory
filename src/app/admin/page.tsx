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

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setStats(await res.json());
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
