"use client";

import { useState, useEffect, useCallback } from "react";
import { notFound, useParams } from "next/navigation";
import { Plus, Minus, Shield, UserCog, User } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import Textarea from "@/components/ui/textarea";
import { PageContainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { roleLabel, signedTone, transactionStatus, transactionType } from "@/components/admin/admin-labels";
import { Badge, EmptyRow, TableCard, TableHead, TEXT_TONES, Th, adminFetch, readError } from "@/components/admin/admin-ui";

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

const BACK = { href: "/admin/users", label: "Người dùng" };

const ROLES = [
  { value: "user", icon: User },
  { value: "moderator", icon: UserCog },
  { value: "admin", icon: Shield },
];

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const toast = useToast();

  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const [changingRole, setChangingRole] = useState(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/users/${userId}`);
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được người dùng này."));
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa tải được người dùng này.");
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
      const res = await adminFetch(`/api/admin/users/${userId}/adjust-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      toast.error(err instanceof Error && err.message ? err.message : "Chưa chỉnh được điểm. Thử lại nhé.");
    } finally {
      setAdjusting(false);
    }
  };

  const handleRoleChange = async (newRole: string) => {
    setChangingRole(true);
    try {
      const res = await adminFetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error(await readError(res, "Chưa đổi được quyền. Thử lại nhé."));
      toast.success(`Đã đổi quyền thành ${roleLabel(newRole).label}`);
      fetchUser();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Chưa đổi được quyền. Thử lại nhé.");
    } finally {
      setChangingRole(false);
    }
  };

  if (missing) notFound();

  if (loading && !data) return <PageSkeleton width="wide" blocks={3} />;

  if (!data) {
    return (
      <PageContainer width="wide">
        <PageHeader title="Người dùng" back={BACK} />
        <Alert
          action={
            <Button size="sm" variant="outline" onClick={fetchUser}>
              Thử lại
            </Button>
          }
        >
          {error ?? "Chưa tải được người dùng này."}
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        back={BACK}
        title={<span className="break-all">{data.user.email}</span>}
        description={
          <>
            Tham gia {formatDateTime(data.user.created_at)}
            {data.user.last_sign_in_at && ` · Đăng nhập lần cuối ${formatDateTime(data.user.last_sign_in_at)}`}
          </>
        }
      />

      {error && <Alert className="mb-6">{error}</Alert>}

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold th-text-primary">Ví</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm th-text-secondary">Điểm</span>
              <span className="text-xl font-bold th-text-primary">{formatPoints(data.wallet.points)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm th-text-secondary">Số dư</span>
              <span className="text-lg font-semibold th-text-primary">{formatNumber(data.wallet.balance)}đ</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm th-text-secondary">Dùng thử</span>
              <span className={`text-sm font-medium ${data.wallet.free_trial_claimed ? "th-text-muted" : "th-text-success"}`}>
                {data.wallet.free_trial_claimed ? "Đã dùng" : "Chưa dùng"}
              </span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" className="flex-1" onClick={() => { setAdjustAmount(""); setShowAdjust(true); }}>
                <Plus size={14} /> Cộng điểm
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setAdjustAmount("-"); setShowAdjust(true); }}>
                <Minus size={14} /> Trừ điểm
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold th-text-primary">Quyền</h2>
          <div className="space-y-2" role="radiogroup" aria-label="Quyền">
            {ROLES.map((r) => {
              const current = data.role === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={current}
                  onClick={() => handleRoleChange(r.value)}
                  disabled={changingRole || current}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-2 text-sm font-medium transition-all disabled:cursor-default ${
                    current ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-text-secondary th-bg-hover"
                  }`}
                >
                  <r.icon size={16} />
                  {roleLabel(r.value).label}
                  {current && <span className="ml-auto text-xs">Hiện tại</span>}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold th-text-primary">Kênh ({formatNumber(data.projects.length)})</h2>
          {data.projects.length === 0 ? (
            <p className="py-4 text-center text-sm th-text-muted">Chưa có kênh nào.</p>
          ) : (
            <div className="space-y-2">
              {data.projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 th-bg-tertiary">
                  <span className="truncate text-sm th-text-primary">{p.name}</span>
                  <span className="shrink-0 text-xs th-text-muted">{formatDate(p.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold th-text-primary">
        Lịch sử giao dịch ({formatNumber(data.transactions.length)})
      </h2>
      <TableCard>
        <TableHead>
          <Th>Thời gian</Th>
          <Th>Loại</Th>
          <Th>Mô tả</Th>
          <Th>Trạng thái</Th>
          <Th align="right">Số tiền</Th>
        </TableHead>
        <tbody>
          {data.transactions.length === 0 ? (
            <EmptyRow cols={5}>Chưa có giao dịch.</EmptyRow>
          ) : (
            data.transactions.map((tx) => {
              const type = transactionType(tx.type);
              const status = transactionStatus(tx.status);
              const amount = Number(tx.amount);
              return (
                <tr key={tx.id} className="border-t th-border">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs th-text-muted">{formatDateTime(tx.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={type.tone}>{type.label}</Badge>
                  </td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-xs th-text-secondary">{tx.description}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-xs ${TEXT_TONES[status.tone]}`}>{status.label}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${TEXT_TONES[signedTone(amount)]}`}>
                    {amount >= 0 ? "+" : ""}
                    {formatNumber(amount)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableCard>

      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Chỉnh điểm">
        <div className="space-y-4">
          <div>
            <Input
              id="adjust-amount"
              label="Số điểm"
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="Ví dụ: 10 (cộng) hoặc -5 (trừ)"
              className="text-sm"
            />
            <p className="mt-1 text-xs th-text-muted">Số dương là cộng, số âm là trừ.</p>
          </div>
          <Textarea
            id="adjust-reason"
            label="Lý do"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder="Ví dụ: bù cho lần lỗi hệ thống, quà tặng…"
            rows={2}
            className="text-sm"
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowAdjust(false)}>
              Huỷ
            </Button>
            <Button
              onClick={handleAdjustPoints}
              loading={adjusting}
              disabled={!adjustAmount || adjustAmount === "0" || adjustAmount === "-" || !adjustReason.trim()}
            >
              Xác nhận
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
