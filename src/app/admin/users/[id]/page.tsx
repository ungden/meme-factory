"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Plus, Minus, Shield, UserCog, User } from "lucide-react";
import Link from "next/link";

interface UserDetail {
  user: { id: string; email: string; created_at: string; last_sign_in_at: string };
  role: string;
  wallet: { balance: number; points: number; free_trial_claimed: boolean };
  transactions: {
    id: string;
    amount: number;
    type: string;
    description: string;
    status: string;
    created_at: string;
  }[];
  projects: { id: string; name: string; created_at: string }[];
}

function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const toast = useToast();

  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Adjust points modal
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Role change
  const [changingRole, setChangingRole] = useState(false);

  const getToken = async () => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token ?? "";
  };

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleAdjustPoints = async () => {
    const amount = parseInt(adjustAmount);
    if (!amount || !adjustReason.trim()) return;
    setAdjusting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${userId}/adjust-points`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: adjustReason.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(result.message);
      setShowAdjust(false);
      setAdjustAmount("");
      setAdjustReason("");
      fetchUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setAdjusting(false);
    }
  };

  const handleRoleChange = async (newRole: string) => {
    setChangingRole(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Đã đổi role thành ${newRole}`);
      fetchUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thay đổi role thất bại");
    } finally {
      setChangingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <AdminSidebar />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 th-bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex">
        <AdminSidebar />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <p className="th-text-muted">Không tìm thấy người dùng</p>
        </main>
      </div>
    );
  }

  const roles = [
    { value: "user", label: "User", icon: User, color: "#6b7280" },
    { value: "moderator", label: "Moderator", icon: UserCog, color: "#f59e0b" },
    { value: "admin", label: "Admin", icon: Shield, color: "#ef4444" },
  ];

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Back link */}
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm th-text-muted hover:underline mb-6">
          <ArrowLeft size={14} /> Danh sách người dùng
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">{data.user.email}</h1>
            <p className="th-text-tertiary mt-1">
              Tham gia {formatDate(data.user.created_at)}
              {data.user.last_sign_in_at && ` | Đăng nhập lần cuối ${formatDate(data.user.last_sign_in_at)}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Wallet Card */}
          <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
            <h2 className="text-sm font-semibold th-text-primary mb-4">Ví</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="th-text-secondary text-sm">Points</span>
                <span className="text-xl font-bold th-text-primary">{data.wallet.points}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="th-text-secondary text-sm">Số dư VNĐ</span>
                <span className="text-lg font-semibold th-text-primary">{formatVND(data.wallet.balance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="th-text-secondary text-sm">Dùng thử</span>
                <span className={`text-sm font-medium ${data.wallet.free_trial_claimed ? "th-text-muted" : ""}`} style={{ color: data.wallet.free_trial_claimed ? undefined : "#22c55e" }}>
                  {data.wallet.free_trial_claimed ? "Đã dùng" : "Chưa dùng"}
                </span>
              </div>
              <div className="pt-2 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => { setAdjustAmount(""); setShowAdjust(true); }}>
                  <Plus size={14} /> Cộng points
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setAdjustAmount("-"); setShowAdjust(true); }}>
                  <Minus size={14} /> Trừ points
                </Button>
              </div>
            </div>
          </div>

          {/* Role Card */}
          <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
            <h2 className="text-sm font-semibold th-text-primary mb-4">Quyền</h2>
            <div className="space-y-2">
              {roles.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleRoleChange(r.value)}
                  disabled={changingRole || data.role === r.value}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                    data.role === r.value
                      ? "th-border-accent th-bg-accent-light"
                      : "th-bg-hover th-border"
                  }`}
                  style={{
                    borderColor: data.role === r.value ? r.color : undefined,
                    color: data.role === r.value ? r.color : undefined,
                  }}
                >
                  <r.icon size={18} />
                  {r.label}
                  {data.role === r.value && <span className="ml-auto text-xs">(hiện tại)</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Projects Card */}
          <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
            <h2 className="text-sm font-semibold th-text-primary mb-4">Dự án ({data.projects.length})</h2>
            <div className="space-y-2">
              {data.projects.length === 0 ? (
                <p className="text-sm th-text-muted py-4 text-center">Chưa có dự án</p>
              ) : (
                data.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg th-bg-tertiary">
                    <span className="text-sm th-text-primary truncate">{p.name}</span>
                    <span className="text-xs th-text-muted">{new Date(p.created_at).toLocaleDateString("vi-VN")}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border-primary)" }}>
            <h2 className="text-sm font-semibold th-text-primary">Lịch sử giao dịch ({data.transactions.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Thời gian</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Loại</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Mô tả</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Trạng thái</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                    <td className="py-2.5 px-4 th-text-muted text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                    <td className="py-2.5 px-4">
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
                    <td className="py-2.5 px-4 th-text-secondary text-xs truncate max-w-[250px]">{tx.description}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-xs" style={{ color: tx.status === "completed" ? "#22c55e" : tx.status === "failed" ? "#ef4444" : "#f59e0b" }}>
                        {tx.status === "completed" ? "Hoàn thành" : tx.status === "failed" ? "Thất bại" : "Đang xử lý"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium" style={{ color: Number(tx.amount) >= 0 ? "#22c55e" : "#ef4444" }}>
                      {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
                {data.transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center th-text-muted">Chưa có giao dịch</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Adjust Points Modal */}
        <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Điều chỉnh points">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Số points</label>
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="VD: 10 (cộng) hoặc -5 (trừ)"
                className="w-full px-4 py-2.5 rounded-xl text-sm th-bg-tertiary th-text-primary th-border"
                style={{ border: "1px solid var(--border-primary)" }}
              />
              <p className="text-xs th-text-muted mt-1">Số dương = cộng, số âm = trừ</p>
            </div>
            <div>
              <label className="block text-sm font-medium th-text-secondary mb-1.5">Lý do</label>
              <textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="VD: Bồi thường lỗi hệ thống, Quà tặng, ..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl text-sm th-bg-tertiary th-text-primary th-border"
                style={{ border: "1px solid var(--border-primary)" }}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowAdjust(false)}>Huỷ</Button>
              <Button onClick={handleAdjustPoints} loading={adjusting} disabled={!adjustAmount || adjustAmount === "0" || adjustAmount === "-" || !adjustReason.trim()}>
                Xác nhận
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}
