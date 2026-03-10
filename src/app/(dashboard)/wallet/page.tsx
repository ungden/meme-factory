"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import { useWallet } from "@/contexts/WalletContext";
import { useTopup } from "@/hooks/useTopup";
import BankTransferTopupModal from "@/components/wallet/BankTransferTopupModal";
import { createClient } from "@/lib/supabase/client";
import {
  POINT_PACKAGES,
  POINT_COSTS,
  POINT_LABELS,
  formatVND,
  type PointPackage,
} from "@/lib/point-pricing";
import {
  Wallet,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  Star,
  ShoppingCart,
  Sparkles,
  ImageIcon,
  Wand2,
} from "lucide-react";
import type { Transaction } from "@/types/database";

const QUICK_AMOUNTS = [
  { label: "50.000đ", value: 50000 },
  { label: "100.000đ", value: 100000 },
  { label: "200.000đ", value: 200000 },
  { label: "500.000đ", value: 500000 },
];

export default function WalletPage() {
  const { balance, points, transactions, isLoading, refreshBalance } = useWallet();
  const { createTopup, topupInfo, isModalOpen, closeTopup, isLoading: topupLoading, onSuccess } = useTopup();
  const [customAmount, setCustomAmount] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [buyingPackage, setBuyingPackage] = useState<PointPackage | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const toast = useToast();

  const handleQuickTopup = (amount: number) => {
    createTopup(amount);
  };

  const handleCustomTopup = () => {
    const amount = parseInt(customAmount.replace(/\D/g, ""), 10);
    if (!amount || amount < 10000) {
      toast.error("Số tiền tối thiểu 10.000đ");
      return;
    }
    createTopup(amount);
    setCustomAmount("");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalance();
    setIsRefreshing(false);
    toast.success("Đã cập nhật số dư");
  };

  const handleBuyPoints = async () => {
    if (!buyingPackage || isBuying) return;

    if (balance < buyingPackage.price) {
      toast.error(`Số dư không đủ. Cần ${formatVND(buyingPackage.price)}, hiện có ${formatVND(balance)}.`);
      setBuyingPackage(null);
      return;
    }

    setIsBuying(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        toast.error("Vui lòng đăng nhập lại.");
        return;
      }

      const res = await fetch("/api/wallet/buy-points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId: buyingPackage.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể mua points");
      }

      toast.success(`Đã mua gói ${data.packageName} — +${data.purchased} points!`);
      await refreshBalance();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Lỗi mua points");
    } finally {
      setIsBuying(false);
      setBuyingPackage(null);
    }
  };

  const formatAmount = (value: string) => {
    const num = value.replace(/\D/g, "");
    if (!num) return "";
    return parseInt(num, 10).toLocaleString("vi-VN");
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Ví tiền</h1>
            <p className="th-text-tertiary mt-1">Quản lý số dư, points và nạp tiền</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            loading={isRefreshing}
          >
            <RefreshCw size={16} />
            Làm mới
          </Button>
        </div>

        {/* Balance + Points Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Balance Card */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600">
                  <Wallet size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-sm th-text-muted">Số dư tài khoản</p>
                  {isLoading ? (
                    <div className="h-8 w-32 th-bg-tertiary rounded-lg animate-pulse" />
                  ) : (
                    <p className="text-2xl font-black th-text-primary">
                      {balance.toLocaleString("vi-VN")}
                      <span className="text-base th-text-muted ml-1">đ</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Points Card */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500">
                  <Zap size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-sm th-text-muted">Points khả dụng</p>
                  {isLoading ? (
                    <div className="h-8 w-32 th-bg-tertiary rounded-lg animate-pulse" />
                  ) : (
                    <p className="text-2xl font-black th-text-primary">
                      {points.toLocaleString("vi-VN")}
                      <span className="text-base th-text-muted ml-1">pts</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Point Cost Reference */}
        <Card className="mb-8">
          <div className="p-5">
            <h3 className="text-sm font-semibold th-text-primary mb-3 flex items-center gap-2">
              <Star size={16} style={{ color: "var(--accent)" }} />
              Bảng giá sử dụng Points
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <PointCostBadge icon={<Sparkles size={16} />} label={POINT_LABELS.content} cost={POINT_COSTS.content} />
              <PointCostBadge icon={<ImageIcon size={16} />} label={POINT_LABELS.character} cost={POINT_COSTS.character} />
              <PointCostBadge icon={<ImageIcon size={16} />} label={POINT_LABELS.background} cost={POINT_COSTS.background} />
              <PointCostBadge icon={<Wand2 size={16} />} label={POINT_LABELS.meme} cost={POINT_COSTS.meme} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Buy Points Packages */}
            <Card>
              <div className="p-6">
                <h3 className="text-base font-semibold th-text-primary mb-4 flex items-center gap-2">
                  <ShoppingCart size={18} />
                  Mua Points
                </h3>
                <div className="space-y-3">
                  {POINT_PACKAGES.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => setBuyingPackage(pkg)}
                      className={`w-full p-4 rounded-xl border text-left transition-all th-bg-hover relative ${
                        pkg.popular ? "ring-2" : ""
                      }`}
                      style={{
                        borderColor: pkg.popular ? "var(--accent)" : "var(--border-primary)",
                        ...(pkg.popular ? { ringColor: "var(--accent)" } : {}),
                      }}
                    >
                      {pkg.popular && (
                        <span
                          className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                          style={{ background: "var(--accent)" }}
                        >
                          Phổ biến nhất
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold th-text-primary">{pkg.name}</p>
                          <p className="text-xs th-text-muted mt-0.5">
                            {pkg.points} points
                            {pkg.bonus && (
                              <span className="ml-1.5 font-bold" style={{ color: "var(--success)" }}>
                                {pkg.bonus}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold th-text-primary">{formatVND(pkg.price)}</p>
                          <p className="text-[10px] th-text-muted">{formatVND(pkg.pricePerPoint)}/pt</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs th-text-muted mt-3">
                  Trừ trực tiếp từ số dư tài khoản. Nạp tiền trước nếu chưa đủ.
                </p>
              </div>
            </Card>

            {/* Quick Topup (VNĐ) */}
            <Card>
              <div className="p-6">
                <h3 className="text-base font-semibold th-text-primary mb-4 flex items-center gap-2">
                  <Plus size={18} />
                  Nạp tiền vào ví
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {QUICK_AMOUNTS.map((item) => (
                    <Button
                      key={item.value}
                      variant="outline"
                      size="md"
                      onClick={() => handleQuickTopup(item.value)}
                      loading={topupLoading}
                      className="w-full"
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>

                {/* Custom amount */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Số tiền khác..."
                      value={customAmount}
                      onChange={(e) => setCustomAmount(formatAmount(e.target.value))}
                      onKeyDown={(e) => e.key === "Enter" && handleCustomTopup()}
                      className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border-primary)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm th-text-muted">đ</span>
                  </div>
                  <Button
                    onClick={handleCustomTopup}
                    loading={topupLoading}
                    disabled={!customAmount}
                  >
                    Nạp
                  </Button>
                </div>
                <p className="text-xs th-text-muted mt-3">
                  Tối thiểu 10.000đ. Chuyển khoản ngân hàng qua mã QR.
                </p>
              </div>
            </Card>
          </div>

          {/* RIGHT: Transaction History */}
          <div className="lg:col-span-2">
            <Card>
              <div className="p-6 border-b" style={{ borderColor: "var(--border-primary)" }}>
                <h3 className="text-base font-semibold th-text-primary flex items-center gap-2">
                  <Clock size={18} />
                  Lịch sử giao dịch
                </h3>
              </div>
              <div className="p-6">
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-16 th-bg-tertiary rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-16 h-16 th-bg-tertiary rounded-2xl flex items-center justify-center mb-4">
                      <Clock size={28} className="th-text-muted" />
                    </div>
                    <p className="th-text-muted text-sm">Chưa có giao dịch nào</p>
                    <p className="th-text-muted text-xs mt-1">Nạp tiền và mua points để bắt đầu sử dụng</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} transaction={tx} />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Bank Transfer Modal */}
        <BankTransferTopupModal
          open={isModalOpen}
          onClose={closeTopup}
          info={topupInfo}
          onSuccess={onSuccess}
        />

        {/* Buy Points Confirm Modal */}
        <ConfirmModal
          isOpen={!!buyingPackage}
          onClose={() => setBuyingPackage(null)}
          onConfirm={handleBuyPoints}
          title={`Mua gói ${buyingPackage?.name}?`}
          message={`Bạn sẽ nhận ${buyingPackage?.points} points với giá ${buyingPackage ? formatVND(buyingPackage.price) : ""}. Số tiền sẽ được trừ từ số dư ví (hiện có ${formatVND(balance)}).`}
          confirmText={isBuying ? "Đang xử lý..." : "Xác nhận mua"}
          variant="default"
        />
      </main>
    </div>
  );
}

// ============================================
// Point Cost Badge
// ============================================

function PointCostBadge({ icon, label, cost }: { icon: React.ReactNode; label: string; cost: number }) {
  return (
    <div
      className="flex items-center gap-2.5 p-3 rounded-xl border"
      style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
    >
      <div className="th-text-accent shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs th-text-secondary truncate">{label}</p>
        <p className="text-sm font-bold th-text-primary">
          {cost === 0 ? (
            <span style={{ color: "var(--success)" }}>Miễn phí</span>
          ) : (
            <>{cost} pts</>
          )}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Transaction Row
// ============================================

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isCredit = transaction.type === "topup" || transaction.type === "refund";

  const typeLabels: Record<string, string> = {
    topup: "Nạp tiền",
    payment: "Thanh toán",
    refund: "Hoàn tiền",
  };

  const statusIcons: Record<string, React.ReactNode> = {
    completed: <CheckCircle size={16} style={{ color: "var(--success)" }} />,
    pending: <Clock size={16} style={{ color: "var(--warning)" }} />,
    failed: <XCircle size={16} style={{ color: "var(--danger)" }} />,
  };

  const statusLabels: Record<string, string> = {
    completed: "Hoàn thành",
    pending: "Đang xử lý",
    failed: "Thất bại",
  };

  // Check if this is a point transaction (amount = 0, description mentions points)
  const isPointTx = transaction.amount === 0 && transaction.description.includes("points");

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl border transition-colors"
      style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: isPointTx
            ? "var(--accent-light)"
            : isCredit
              ? "var(--success-light)"
              : "var(--danger-light)",
          color: isPointTx
            ? "var(--accent)"
            : isCredit
              ? "var(--success)"
              : "var(--danger)",
        }}
      >
        {isPointTx ? <Zap size={20} /> : isCredit ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium th-text-primary">
            {typeLabels[transaction.type] || transaction.type}
          </p>
          {statusIcons[transaction.status]}
        </div>
        <p className="text-xs th-text-muted truncate mt-0.5">
          {transaction.description || statusLabels[transaction.status]}
        </p>
      </div>

      <div className="text-right shrink-0">
        {!isPointTx && (
          <p
            className="text-sm font-bold"
            style={{ color: isCredit ? "var(--success)" : "var(--danger)" }}
          >
            {isCredit ? "+" : "-"}
            {Math.abs(transaction.amount).toLocaleString("vi-VN")}đ
          </p>
        )}
        <p className="text-xs th-text-muted">
          {new Date(transaction.created_at).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
