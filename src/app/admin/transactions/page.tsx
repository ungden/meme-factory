"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, XCircle } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { signedTone, topupStatus, transactionStatus, transactionType } from "@/components/admin/admin-labels";
import {
  Badge,
  EmptyRow,
  Pagination,
  SkeletonRows,
  TableCard,
  TableHead,
  TEXT_TONES,
  Th,
  adminFetch,
  readError,
} from "@/components/admin/admin-ui";

type Tab = "transactions" | "projectPoints" | "topups";

interface Transaction {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  type: string;
  description: string;
  status: string;
  created_at: string;
  project_name?: string;
}

interface UsageSummary {
  email: string;
  total_points: number;
  tx_count: number;
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

const TABS: { value: Tab; label: string }[] = [
  { value: "transactions", label: "Giao dịch ví" },
  { value: "projectPoints", label: "Điểm kênh đã tiêu" },
  { value: "topups", label: "Đơn nạp tiền" },
];

const TX_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "topup", label: "Nạp" },
  { value: "payment", label: "Chi" },
  { value: "refund", label: "Hoàn" },
];

const ORDER_FILTERS = [
  { value: "pending", label: "Chờ xác nhận" },
  { value: "completed", label: "Đã xác nhận" },
  { value: "rejected", label: "Đã từ chối" },
  { value: "", label: "Tất cả" },
];

function formatVnd(value: number) {
  return `${formatNumber(value)}đ`;
}

export default function AdminTransactionsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("transactions");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txFilter, setTxFilter] = useState<string>("");

  const [orders, setOrders] = useState<TopupOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersFilter, setOrdersFilter] = useState<string>("pending");
  const [processingOrder, setProcessingOrder] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    try {
      const params = new URLSearchParams({ page: String(txPage) });
      if (tab === "projectPoints") params.set("scope", "project");
      if (txFilter) params.set("type", txFilter);
      const res = await adminFetch(`/api/admin/transactions?${params}`);
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được giao dịch."));
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setUsageSummary(data.usageSummary ?? []);
      setTxTotalPages(data.totalPages ?? 1);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Chưa tải được giao dịch.");
    }
    setTxLoading(false);
  }, [txPage, txFilter, tab]);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const params = new URLSearchParams({ page: String(ordersPage) });
      if (ordersFilter) params.set("status", ordersFilter);
      const res = await adminFetch(`/api/admin/topup-orders?${params}`);
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được đơn nạp tiền."));
      const data = await res.json();
      setOrders(data.orders ?? []);
      setOrdersTotalPages(data.totalPages ?? 1);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : "Chưa tải được đơn nạp tiền.");
    }
    setOrdersLoading(false);
  }, [ordersPage, ordersFilter]);

  useEffect(() => {
    if (tab === "transactions" || tab === "projectPoints") fetchTransactions();
  }, [tab, fetchTransactions]);

  useEffect(() => {
    if (tab === "topups") fetchOrders();
  }, [tab, fetchOrders]);

  const handleConfirmTopup = async (orderId: string) => {
    setProcessingOrder(orderId);
    try {
      const res = await adminFetch(`/api/admin/topup-orders/${orderId}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || "Đã xác nhận đơn nạp");
      fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Chưa xác nhận được đơn. Thử lại nhé.");
    }
    setProcessingOrder(null);
  };

  const handleRejectTopup = async (orderId: string) => {
    setProcessingOrder(orderId);
    try {
      const res = await adminFetch(`/api/admin/topup-orders/${orderId}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || "Đã từ chối đơn nạp");
      fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Chưa từ chối được đơn. Thử lại nhé.");
    }
    setProcessingOrder(null);
  };

  const isPoints = tab === "projectPoints";
  const txCols = isPoints ? 7 : 6;

  return (
    <PageContainer width="wide">
      <PageHeader title="Giao dịch" description="Mọi giao dịch ví, điểm kênh đã tiêu và đơn nạp tiền chờ xác nhận.">
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Xem">
          {TABS.map((t) => (
            <Chip key={t.value} role="radio" selected={tab === t.value} onClick={() => setTab(t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </PageHeader>

      {(tab === "transactions" || tab === "projectPoints") && (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc theo loại">
            {TX_FILTERS.map((f) => (
              <Chip
                key={f.value}
                role="radio"
                selected={txFilter === f.value}
                onClick={() => {
                  setTxFilter(f.value);
                  setTxPage(1);
                }}
              >
                {f.label}
              </Chip>
            ))}
          </div>

          {txError && (
            <Alert
              className="mb-4"
              action={
                <Button size="sm" variant="outline" onClick={fetchTransactions}>
                  Thử lại
                </Button>
              }
            >
              {txError}
            </Alert>
          )}

          {isPoints && usageSummary.length > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="mb-3 text-sm font-semibold th-text-primary">Người tiêu nhiều điểm nhất</h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {usageSummary.slice(0, 6).map((u) => (
                  <div key={u.email} className="rounded-xl px-3 py-2 th-bg-tertiary">
                    <p className="truncate text-xs th-text-secondary">{u.email}</p>
                    <p className="text-sm font-semibold th-text-primary">{formatPoints(u.total_points)}</p>
                    <p className="text-xs th-text-muted">{formatNumber(u.tx_count)} lần</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <TableCard footer={<Pagination page={txPage} totalPages={txTotalPages} onChange={setTxPage} />}>
            <TableHead>
              <Th>Thời gian</Th>
              <Th>Email</Th>
              {isPoints && <Th>Kênh</Th>}
              <Th>Loại</Th>
              <Th>Mô tả</Th>
              <Th>Trạng thái</Th>
              <Th align="right">{isPoints ? "Điểm" : "Số tiền"}</Th>
            </TableHead>
            <tbody>
              {txLoading ? (
                <SkeletonRows cols={txCols} />
              ) : transactions.length === 0 ? (
                <EmptyRow cols={txCols}>Chưa có giao dịch nào.</EmptyRow>
              ) : (
                transactions.map((tx) => {
                  const type = transactionType(tx.type);
                  const status = transactionStatus(tx.status);
                  const amount = Number(tx.amount);
                  return (
                    <tr key={tx.id} className="border-t th-border">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs th-text-muted">{formatDateTime(tx.created_at)}</td>
                      <td className="max-w-40 truncate px-4 py-2.5 text-xs th-text-primary">{tx.user_email}</td>
                      {isPoints && <td className="px-4 py-2.5 text-xs th-text-secondary">{tx.project_name || "—"}</td>}
                      <td className="px-4 py-2.5">
                        <Badge tone={type.tone}>{type.label}</Badge>
                      </td>
                      <td className="max-w-52 truncate px-4 py-2.5 text-xs th-text-secondary">{tx.description}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-xs ${TEXT_TONES[status.tone]}`}>{status.label}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${TEXT_TONES[signedTone(amount)]}`}>
                        {amount >= 0 ? "+" : ""}
                        {isPoints ? formatPoints(amount) : formatVnd(amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableCard>
        </>
      )}

      {tab === "topups" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc theo trạng thái">
            {ORDER_FILTERS.map((f) => (
              <Chip
                key={f.value}
                role="radio"
                selected={ordersFilter === f.value}
                onClick={() => {
                  setOrdersFilter(f.value);
                  setOrdersPage(1);
                }}
              >
                {f.label}
              </Chip>
            ))}
          </div>

          {ordersError && (
            <Alert
              className="mb-4"
              action={
                <Button size="sm" variant="outline" onClick={fetchOrders}>
                  Thử lại
                </Button>
              }
            >
              {ordersError}
            </Alert>
          )}

          <TableCard footer={<Pagination page={ordersPage} totalPages={ordersTotalPages} onChange={setOrdersPage} />}>
            <TableHead>
              <Th>Thời gian</Th>
              <Th>Email</Th>
              <Th align="right">Số tiền</Th>
              <Th>Trạng thái</Th>
              <Th>Mã chuyển khoản</Th>
              <Th align="center">
                <span className="sr-only">Thao tác</span>
              </Th>
            </TableHead>
            <tbody>
              {ordersLoading ? (
                <SkeletonRows cols={6} />
              ) : orders.length === 0 ? (
                <EmptyRow cols={6}>Không có đơn nạp tiền nào.</EmptyRow>
              ) : (
                orders.map((o) => {
                  const status = topupStatus(o.status);
                  return (
                    <tr key={o.id} className="border-t th-border">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs th-text-muted">{formatDateTime(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-xs th-text-primary">{o.user_email}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium th-text-primary">{formatVnd(Number(o.amount))}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs th-text-muted">{o.payment_id || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        {o.status === "pending" ? (
                          <div className="flex justify-center gap-1.5">
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
                  );
                })
              )}
            </tbody>
          </TableCard>
        </>
      )}
    </PageContainer>
  );
}
