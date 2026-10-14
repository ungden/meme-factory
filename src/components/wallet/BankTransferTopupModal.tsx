"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Copy, Check, AlertCircle, RefreshCw } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useWallet } from "@/contexts/WalletContext";
import { formatPoints } from "@/lib/format";
import { formatVND } from "@/lib/point-pricing";
import type { TopupInfo } from "@/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  info: TopupInfo | null;
  /** Số tiền ví cần có sau khi nạp (nạp tiền thường, không mua gói). */
  requiredAmount?: number;
  onSuccess?: () => void;
}

/** Sau 15 phút không thấy tiền về thì thôi hỏi máy chủ; người dùng bấm kiểm tra tay được. */
const WAIT_MS = 15 * 60 * 1000;
const POLL_MS = 3000;

/**
 * Hộp chuyển khoản: QR, số tài khoản, nội dung chuyển khoản, rồi tự hỏi ví cho
 * tới khi giao dịch của đúng lần nạp này xuất hiện.
 *
 * Dò theo mã giao dịch (`topup_<orderId>`) chứ không so số dư: nạp để mua gói
 * thì máy chủ đổi tiền ra điểm ngay lúc xác nhận nên tiền trong ví không tăng,
 * và một số dư cũ trong bộ nhớ dễ bị nhầm là tiền vừa về.
 */
export default function BankTransferTopupModal({ open, onClose, info, requiredAmount, onSuccess }: Props) {
  const title = info?.points ? `Chuyển khoản để nhận ${formatPoints(info.points)}` : "Chuyển khoản để nạp tiền";
  return (
    <Modal isOpen={open && !!info} onClose={onClose} title={title} size="xl">
      {info && (
        <TransferDetails key={info.orderId} info={info} requiredAmount={requiredAmount} onSuccess={onSuccess} onClose={onClose} />
      )}
    </Modal>
  );
}

function TransferDetails({
  info,
  requiredAmount,
  onSuccess,
  onClose,
}: {
  info: TopupInfo;
  requiredAmount?: number;
  onSuccess?: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const { balance, transactions, refreshBalance } = useWallet();
  const [isTimedOut, setIsTimedOut] = useState(false);
  const announced = useRef(false);
  const packagePoints = info.points ?? null;
  const received = transactions.some((tx) => tx.reference_id === `topup_${info.orderId}`);
  const stillShort = !packagePoints && !!requiredAmount && balance < requiredAmount;

  useEffect(() => {
    void refreshBalance();
    const poll = window.setInterval(() => void refreshBalance(), POLL_MS);
    const stop = window.setTimeout(() => {
      window.clearInterval(poll);
      setIsTimedOut(true);
    }, WAIT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [refreshBalance]);

  // Hộp cha thường truyền hàm mới mỗi lần render; giữ bản mới nhất trong ref để
  // hẹn giờ đóng hộp không bị huỷ rồi tạo lại liên tục.
  const callbacks = useRef({ onSuccess, onClose });
  useEffect(() => {
    callbacks.current = { onSuccess, onClose };
  });
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!received || announced.current) return;
    announced.current = true;
    if (packagePoints) toast.success(`Đã nhận ${formatPoints(packagePoints)}`);
    else toast.success("Đã nhận tiền, số dư đã cập nhật");
    if (stillShort) {
      toast.warning(`Ví vẫn còn thiếu ${formatVND(requiredAmount! - balance)}. Bạn nạp thêm nhé.`);
      return;
    }
    closeTimer.current = window.setTimeout(() => {
      callbacks.current.onSuccess?.();
      callbacks.current.onClose();
    }, 1200);
  }, [received, packagePoints, stillShort, requiredAmount, balance, toast]);

  const handleManualCheck = async () => {
    toast.info("Đang kiểm tra giao dịch…");
    await refreshBalance();
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã sao chép ${label}`);
    } catch {
      toast.error("Trình duyệt không cho sao chép. Bạn chép tay giúp nhé.");
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col items-center text-center">
        <p className="mb-4 text-sm th-text-tertiary">Mở app ngân hàng và quét mã QR bên dưới.</p>
        {/* Nền trắng là để app ngân hàng quét được mã QR ở giao diện tối. */}
        <div className="relative mb-4 aspect-square w-full max-w-[240px] rounded-2xl border bg-white p-3 th-border">
          <Image src={info.qrUrl} alt="Mã QR chuyển khoản" fill className="rounded-xl object-contain p-2" priority unoptimized />
        </div>

        <div className="flex w-full max-w-[240px] flex-col gap-3">
          <div
            role="status"
            className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${
              received ? "th-border-success th-bg-success-light th-text-success" : "th-border-accent th-bg-accent-light th-text-accent"
            }`}
          >
            {received ? (
              <>
                <Check size={14} /> {packagePoints ? "Đã nhận điểm" : "Đã nhận tiền"}
              </>
            ) : isTimedOut ? (
              <>
                <AlertCircle size={14} /> Chưa thấy tiền về
              </>
            ) : (
              <>
                <span className="relative mr-1 flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 th-bg-accent" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full th-bg-accent" />
                </span>
                Đang chờ tiền về…
              </>
            )}
          </div>

          <Button variant="outline" onClick={handleManualCheck} disabled={received}>
            <RefreshCw size={14} /> Tôi đã chuyển khoản
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {requiredAmount && !packagePoints ? (
          <div className="space-y-3 rounded-2xl border p-4 th-border th-bg-secondary">
            <div className="flex justify-between text-sm">
              <span className="th-text-muted">Cần có trong ví</span>
              <span className="font-bold th-text-primary">{formatVND(requiredAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="th-text-muted">Ví đang có</span>
              <span className="font-bold th-text-primary">{formatVND(balance)}</span>
            </div>
          </div>
        ) : null}

        {packagePoints ? (
          <Alert tone="info">Ngân hàng báo có là {formatPoints(packagePoints)} vào ví ngay, không cần bấm mua thêm.</Alert>
        ) : null}

        <DataField
          label="Số tiền chuyển"
          value={formatVND(info.amount)}
          highlight="success"
          onCopy={() => handleCopy(String(info.amount), "số tiền")}
        />
        <DataField
          label="Nội dung chuyển khoản (bắt buộc)"
          value={info.description}
          highlight="accent"
          warning="Ghi đúng nội dung này để tiền tự vào ví"
          onCopy={() => handleCopy(info.description, "nội dung")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DataField
            label="Số tài khoản"
            value={info.beneficiary}
            onCopy={() => handleCopy(info.beneficiary, "số tài khoản")}
          />
          {info.accountName && (
            <DataField
              label="Tên tài khoản"
              value={info.accountName.toUpperCase()}
              onCopy={() => handleCopy(info.accountName!.toUpperCase(), "tên tài khoản")}
            />
          )}
        </div>
        {info.bankName && <p className="text-xs th-text-muted">Ngân hàng: {info.bankName}</p>}
      </div>
    </div>
  );
}

interface DataFieldProps {
  label: string;
  value: string;
  highlight?: "success" | "accent";
  warning?: string;
  onCopy: () => void;
}

const FIELD_TONES = {
  success: { box: "th-border-success th-bg-success-light", text: "th-text-success" },
  accent: { box: "th-border-accent th-bg-accent-light", text: "th-text-accent" },
  plain: { box: "th-border th-bg-card", text: "th-text-primary" },
} as const;

function DataField({ label, value, highlight, warning, onCopy }: DataFieldProps) {
  const [copied, setCopied] = useState(false);
  const tone = FIELD_TONES[highlight ?? "plain"];

  const handleCopyClick = () => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopyClick}
      aria-label={`Sao chép ${label.toLowerCase()}: ${value}`}
      className={`group relative w-full rounded-2xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 th-ring-accent ${tone.box}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-xs font-semibold th-text-muted">{label}</p>
          <p className={`break-all text-xl font-bold ${tone.text}`}>{value}</p>
          {warning && <p className="mt-1 text-xs font-medium th-text-danger">{warning}</p>}
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            copied ? "th-bg-success-light th-text-success" : "th-bg-secondary th-text-muted"
          }`}
          aria-hidden
        >
          {copied ? <Check size={20} /> : <Copy size={20} />}
        </span>
      </div>
    </button>
  );
}
