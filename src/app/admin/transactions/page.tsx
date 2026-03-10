"use client";

import { useState, useEffect, useCallback } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ChevronLeft, ChevronRight, Check, XCircle } from "lucide-react";

type Tab = "transactions" | "topups";

interface Transaction {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  type: string;
  description: string;
  status: string;
  created_at: string;
}

interface TopupOrder {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  status: string;
  payment_id: string;
  created_at: string;
}

function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminTransactionsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("transactions");

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txFilter, setTxFilter] = useState<string>("");

  // Topup orders state
  const [orders, setOrders] = useState<TopupOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersFilter, setOrdersFilter] = useState<string>("pending");
  const [processingOrder, setProcessingOrder] = useState<string | null>(null);

  const getToken = async () => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token ?? "";
  };

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(txPage) });
      if (txFilter) params.set("type", txFilter);
      const res = await fetch(`/api/admin/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setTxTotalPages(data.totalPages ?? 1);
    } catch { /* ignore */ }
    setTxLoading(false);
  }, [txPage, txFilter]);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(ordersPage) });
      if (ordersFilter) params.set("status", ordersFilter);
      const res = await fetch(`/api/admin/topup-orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrders(data.orders ?? []);
      setOrdersTotalPages(data.totalPages ?? 1);
    } catch { /* ignore */ }
    setOrdersLoading(false);
  }, [ordersPage, ordersFilter]);

  useEffect(() => {
    if (tab === "transactions") fetchTransactions();
  }, [tab, fetchTransactions]);

  useEffect(() => {
    if (tab === "topups") fetchOrders();
  }, [tab, fetchOrders]);

  const handleConfirmTopup = async (orderId: string) => {
    setProcessingOrder(orderId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/topup-orders/${orderId}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || "Đã xác nhận");
      fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thao tác thất bại");
    }
    setProcessingOrder(null);
  };

  const handleRejectTopup = async (orderId: string) => {
    setProcessingOrder(orderId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/topup-orders/${orderId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || "Đã từ chối");
      fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thao tác thất bại");
    }
    setProcessingOrder(null);
  };

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <h1 className="text-2xl font-bold th-text-primary mb-2">Quản lý giao dịch</h1>
        <p className="th-text-tertiary mb-6">Xem tất cả giao dịch và đơn nạp tiền</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("transactions")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tab === "transactions" ? "th-border-accent th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-secondary border-transparent"
            }`}
          >
            Giao dịch
          </button>
          <button
            onClick={() => setTab("topups")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tab === "topups" ? "th-border-accent th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-secondary border-transparent"
            }`}
          >
            Đơn nạp tiền
          </button>
        </div>

        {/* Transactions Tab */}
        {tab === "transactions" && (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { value: "", label: "Tất cả" },
                { value: "topup", label: "Nạp" },
                { value: "payment", label: "Chi" },
                { value: "refund", label: "Hoàn" },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setTxFilter(f.value); setTxPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    txFilter === f.value ? "th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-secondary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Thời gian</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Email</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Loại</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Mô tả</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Trạng thái</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}><td colSpan={6} className="py-4 px-4"><div className="h-5 th-bg-tertiary rounded animate-pulse" /></td></tr>
                      ))
                    ) : transactions.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center th-text-muted">Không có giao dịch</td></tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                          <td className="py-2.5 px-4 th-text-muted text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                          <td className="py-2.5 px-4 th-text-primary text-xs truncate max-w-[160px]">{tx.user_email}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{
                              background: tx.type === "topup" ? "rgba(34,197,94,0.15)" : tx.type === "refund" ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)",
                              color: tx.type === "topup" ? "#22c55e" : tx.type === "refund" ? "#3b82f6" : "#ef4444",
                            }}>
                              {tx.type === "topup" ? "Nạp" : tx.type === "refund" ? "Hoàn" : "Chi"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 th-text-secondary text-xs truncate max-w-[200px]">{tx.description}</td>
                          <td className="py-2.5 px-4 text-xs" style={{ color: tx.status === "completed" ? "#22c55e" : tx.status === "failed" ? "#ef4444" : "#f59e0b" }}>
                            {tx.status === "completed" ? "Hoàn thành" : tx.status === "failed" ? "Thất bại" : "Đang xử lý"}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium" style={{ color: Number(tx.amount) >= 0 ? "#22c55e" : "#ef4444" }}>
                            {Number(tx.amount) >= 0 ? "+" : ""}{formatVND(Number(tx.amount))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {txTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border-primary)" }}>
                  <span className="text-xs th-text-muted">Trang {txPage}/{txTotalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setTxPage((p) => Math.max(1, p - 1))} disabled={txPage === 1} className="p-2 rounded-lg th-bg-hover disabled:opacity-30"><ChevronLeft size={16} /></button>
                    <button onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))} disabled={txPage === txTotalPages} className="p-2 rounded-lg th-bg-hover disabled:opacity-30"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Topup Orders Tab */}
        {tab === "topups" && (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { value: "pending", label: "Chờ xác nhận" },
                { value: "completed", label: "Đã xác nhận" },
                { value: "rejected", label: "Đã từ chối" },
                { value: "", label: "Tất cả" },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setOrdersFilter(f.value); setOrdersPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ordersFilter === f.value ? "th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-secondary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Thời gian</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Email</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Số tiền</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Trạng thái</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Mã CK</th>
                      <th className="text-center py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}><td colSpan={6} className="py-4 px-4"><div className="h-5 th-bg-tertiary rounded animate-pulse" /></td></tr>
                      ))
                    ) : orders.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center th-text-muted">Không có đơn nạp tiền</td></tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                          <td className="py-2.5 px-4 th-text-muted text-xs whitespace-nowrap">{formatDate(o.created_at)}</td>
                          <td className="py-2.5 px-4 th-text-primary text-xs">{o.user_email}</td>
                          <td className="py-2.5 px-4 text-right font-medium th-text-primary">{formatVND(Number(o.amount))}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{
                              background: o.status === "completed" ? "rgba(34,197,94,0.15)" : o.status === "rejected" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                              color: o.status === "completed" ? "#22c55e" : o.status === "rejected" ? "#ef4444" : "#f59e0b",
                            }}>
                              {o.status === "completed" ? "Đã xác nhận" : o.status === "rejected" ? "Từ chối" : "Chờ xác nhận"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 th-text-muted text-xs font-mono">{o.payment_id || "—"}</td>
                          <td className="py-2.5 px-4 text-center">
                            {o.status === "pending" ? (
                              <div className="flex gap-1.5 justify-center">
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmTopup(o.id)}
                                  loading={processingOrder === o.id}
                                  disabled={!!processingOrder}
                                >
                                  <Check size={14} /> Xác nhận
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleRejectTopup(o.id)}
                                  loading={processingOrder === o.id}
                                  disabled={!!processingOrder}
                                >
                                  <XCircle size={14} /> Từ chối
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs th-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {ordersTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border-primary)" }}>
                  <span className="text-xs th-text-muted">Trang {ordersPage}/{ordersTotalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setOrdersPage((p) => Math.max(1, p - 1))} disabled={ordersPage === 1} className="p-2 rounded-lg th-bg-hover disabled:opacity-30"><ChevronLeft size={16} /></button>
                    <button onClick={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))} disabled={ordersPage === ordersTotalPages} className="p-2 rounded-lg th-bg-hover disabled:opacity-30"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
