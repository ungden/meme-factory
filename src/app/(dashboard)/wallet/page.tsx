"use client";

import { useState } from "react";
import Card, { CardContent, CardHeader } from "@/components/ui/card";
import Button from "@/components/ui/button";
import ConfirmModal from "@/components/ui/confirm-modal";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import { PageContainer, PageHeader, Skeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useWallet } from "@/contexts/WalletContext";
import { useTopup } from "@/hooks/useTopup";
import BankTransferTopupModal from "@/components/wallet/BankTransferTopupModal";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { describeTransaction } from "@/lib/wallet-text";
import {
  POINT_PACKAGES,
  POINT_COSTS,
  POINT_LABELS,
  formatVND,
  transactionLabel,
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

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000];
const MIN_TOPUP = 10000;

export default function WalletPage() {
  const { balance, points, transactions, isLoading, refreshBalance } = useWallet();
  const { createTopup, topupInfo, isModalOpen, closeTopup, isLoading: topupLoading, onSuccess } = useTopup();
  const [customAmount, setCustomAmount] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [buyingPackage, setBuyingPackage] = useState<PointPackage | null>(null);
  const [purchaseKey, setPurchaseKey] = useState<string | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const toast = useToast();

  const closePurchase = () => {
    setBuyingPackage(null);
    setPurchaseKey(null);
  };

  const handleCustomTopup = () => {
    const amount = parseInt(customAmount.replace(/\D/g, ""), 10);
    if (!amount || amount < MIN_TOPUP) {
      toast.error(`Nạp tối thiểu ${formatVND(MIN_TOPUP)}.`);
      return;
    }
    void createTopup(amount);
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

    // Tiền trong ví chưa đủ thì chuyển khoản đúng giá gói: ngân hàng báo có là
    // gói được mua luôn, người dùng không phải quay lại bấm mua lần nữa.
    if (balance < buyingPackage.price) {
      const pkg = buyingPackage;
      closePurchase();
      await createTopup(pkg.price, undefined, pkg.id);
      return;
    }

    setIsBuying(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        toast.error("Bạn đăng nhập lại giúp nhé.");
        return;
      }

      const res = await fetch("/api/wallet/buy-points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId: buyingPackage.id, expectedPrice: buyingPackage.price, expectedPoints: buyingPackage.points, idempotencyKey: purchaseKey || crypto.randomUUID() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Chưa mua được điểm. Bạn thử lại nhé.");
      }

      toast.success(`Đã mua gói ${data.packageName}: +${formatPoints(Number(data.purchased) || buyingPackage.points)}`);
      await refreshBalance();
      closePurchase();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Chưa mua được điểm. Bạn thử lại nhé.");
    } finally {
      setIsBuying(false);
    }
  };

  const formatAmount = (value: string) => {
    const num = value.replace(/\D/g, "");
    if (!num) return "";
    return formatNumber(parseInt(num, 10));
  };

  const shortOfMoney = buyingPackage ? balance < buyingPackage.price : false;

  return (
    <PageContainer width="work">
      <PageHeader
        title="Ví"
        description="Nạp tiền, mua điểm và xem lịch sử giao dịch."
        actions={
          <Button variant="ghost" size="sm" onClick={handleRefresh} loading={isRefreshing}>
            {!isRefreshing && <RefreshCw size={14} />}
            Làm mới
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BalanceCard
          icon={<Wallet size={20} />}
          label="Tiền trong ví"
          loading={isLoading}
          value={formatVND(balance)}
        />
        <BalanceCard icon={<Zap size={20} />} label="Điểm" loading={isLoading} value={formatPoints(points)} />
      </div>

      <Card className="mb-8">
        <CardContent>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold th-text-primary">
            <Star size={16} className="th-text-accent" />
            Giá mỗi lần làm
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <PointCostBadge icon={<Sparkles size={16} />} label={POINT_LABELS.content} cost={POINT_COSTS.content} />
            <PointCostBadge icon={<ImageIcon size={16} />} label={POINT_LABELS.character} cost={POINT_COSTS.character} />
            <PointCostBadge icon={<ImageIcon size={16} />} label={POINT_LABELS.background} cost={POINT_COSTS.background} />
            <PointCostBadge icon={<Wand2 size={16} />} label={POINT_LABELS.meme} cost={POINT_COSTS.meme} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardContent>
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold th-text-primary">
                <ShoppingCart size={16} />
                Mua điểm
              </h2>
              <p className="mb-4 text-sm th-text-secondary">1 điểm = 500đ. Giá luôn hiện trước khi bạn bấm làm.</p>
              <div className="space-y-3">
                {POINT_PACKAGES.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => {
                      setBuyingPackage(pkg);
                      setPurchaseKey(crypto.randomUUID());
                    }}
                    className={`relative w-full rounded-xl border p-4 text-left transition-colors th-bg-hover focus:outline-none focus-visible:ring-2 th-ring-accent ${
                      pkg.popular ? "th-border-accent ring-1 th-ring-accent" : "th-border"
                    }`}
                  >
                    {pkg.popular && (
                      <span className="absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-xs font-semibold th-bg-accent th-text-on-primary">
                        Phổ biến nhất
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold th-text-primary">{pkg.name}</p>
                        <p className="mt-0.5 text-xs th-text-muted">
                          {formatPoints(pkg.points)}
                          {pkg.bonus && <span className="ml-1.5 font-bold th-text-success">{pkg.bonus}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold th-text-primary">{formatVND(pkg.price)}</p>
                        <p className="text-xs th-text-muted">{formatVND(pkg.pricePerPoint)}/điểm</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs th-text-muted">
                Trừ vào tiền trong ví. Chưa đủ tiền thì chuyển khoản đúng giá gói, điểm vào ví ngay khi ngân hàng báo có.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold th-text-primary">
                <Plus size={16} />
                Nạp tiền vào ví
              </h2>
              <div className="mb-4 grid grid-cols-2 gap-3">
                {QUICK_AMOUNTS.map((value) => (
                  <Button
                    key={value}
                    variant="outline"
                    onClick={() => void createTopup(value)}
                    disabled={topupLoading}
                    className="w-full"
                  >
                    {formatVND(value)}
                  </Button>
                ))}
              </div>

              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCustomTopup();
                }}
              >
                <div className="relative flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    aria-label="Số tiền muốn nạp"
                    placeholder="Số tiền khác…"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(formatAmount(e.target.value))}
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm th-text-muted">đ</span>
                </div>
                <Button type="submit" loading={topupLoading} disabled={!customAmount}>
                  Nạp
                </Button>
              </form>
              <p className="mt-3 text-xs th-text-muted">
                Tối thiểu {formatVND(MIN_TOPUP)}. Chuyển khoản ngân hàng bằng mã QR.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 text-base font-semibold th-text-primary">
                <Clock size={16} />
                Lịch sử giao dịch
              </h2>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <EmptyState icon={Clock} title="Chưa có giao dịch nào" hint="Nạp tiền và mua điểm để bắt đầu nhé." />
              ) : (
                <ul className="space-y-3">
                  {transactions.map((tx) => (
                    <TransactionRow key={tx.id} transaction={tx} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <BankTransferTopupModal
        open={isModalOpen}
        onClose={closeTopup}
        info={topupInfo}
        onSuccess={onSuccess}
      />

      <ConfirmModal
        isOpen={!!buyingPackage}
        onClose={() => {
          if (isBuying) return;
          closePurchase();
        }}
        onConfirm={handleBuyPoints}
        title={`Mua gói ${buyingPackage?.name ?? ""}?`}
        message={
          buyingPackage
            ? shortOfMoney
              ? `Gói ${formatPoints(buyingPackage.points)} giá ${formatVND(buyingPackage.price)}, ví đang có ${formatVND(balance)}. Chuyển khoản ${formatVND(buyingPackage.price)} để mua; ngân hàng báo có là điểm vào ví.`
              : `Bạn nhận ${formatPoints(buyingPackage.points)}, trừ ${formatVND(buyingPackage.price)} trong ví (đang có ${formatVND(balance)}).`
            : ""
        }
        confirmText={shortOfMoney && buyingPackage ? `Chuyển khoản ${formatVND(buyingPackage.price)}` : "Mua"}
        loading={isBuying || topupLoading}
      />
    </PageContainer>
  );
}

function BalanceCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl th-bg-accent-light th-text-accent">{icon}</span>
        <div>
          <p className="text-sm th-text-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-32 rounded-lg" />
          ) : (
            <p className="text-2xl font-bold th-text-primary">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PointCostBadge({ icon, label, cost }: { icon: React.ReactNode; label: string; cost: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border p-3 th-border th-bg-secondary">
      <div className="shrink-0 th-text-accent">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs th-text-secondary">{label}</p>
        <p className="text-sm font-bold th-text-primary">
          {cost === 0 ? <span className="th-text-success">Miễn phí</span> : formatPoints(cost)}
        </p>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Đã xong",
  pending: "Đang xử lý",
  failed: "Chưa thành",
};

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isCredit = transaction.type === "topup" || transaction.type === "refund";

  // Mô tả giao dịch cũ viết "points", mô tả mới viết "điểm"; nhận cả hai để
  // lịch sử không bị hiển thị sai sau khi đổi cách gọi.
  const isPointTx =
    transaction.amount === 0 &&
    (transaction.description.includes("points") || transaction.description.includes("điểm"));

  const tone = isPointTx
    ? "th-bg-accent-light th-text-accent"
    : isCredit
      ? "th-bg-success-light th-text-success"
      : "th-bg-danger-light th-text-danger";

  const statusIcon =
    transaction.status === "completed" ? (
      <CheckCircle size={14} className="th-text-success" aria-hidden />
    ) : transaction.status === "pending" ? (
      <Clock size={14} className="th-text-warning" aria-hidden />
    ) : transaction.status === "failed" ? (
      <XCircle size={14} className="th-text-danger" aria-hidden />
    ) : null;

  return (
    <li className="flex items-center gap-4 rounded-xl border p-4 th-border th-bg-secondary">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        {isPointTx ? <Zap size={20} /> : isCredit ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium th-text-primary">{transactionLabel(transaction.type)}</p>
          {statusIcon}
          <span className="sr-only">{STATUS_LABELS[transaction.status] ?? ""}</span>
        </div>
        <p className="mt-0.5 truncate text-xs th-text-muted">
          {describeTransaction(transaction.description) || STATUS_LABELS[transaction.status]}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {!isPointTx && (
          <p className={`text-sm font-bold ${isCredit ? "th-text-success" : "th-text-danger"}`}>
            {isCredit ? "+" : "−"}
            {formatVND(Math.abs(transaction.amount))}
          </p>
        )}
        <p className="text-xs th-text-muted">{formatDateTime(transaction.created_at)}</p>
      </div>
    </li>
  );
}
