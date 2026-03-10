"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { Copy, X, Check, AlertCircle, RefreshCw } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import Image from "next/image";
import type { TopupInfo } from "@/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  info: TopupInfo | null;
  requiredAmount?: number;
  onSuccess?: () => void;
}

export default function BankTransferTopupModal({ open, onClose, info, requiredAmount, onSuccess }: Props) {
  const toast = useToast();
  const { balance, refreshBalance } = useWallet();

  const initialBalanceRef = useRef(balance);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const hasTriggeredSuccess = useRef(false);

  const handleSuccess = useCallback(() => {
    if (hasTriggeredSuccess.current) return;
    hasTriggeredSuccess.current = true;
    setIsChecking(false);

    toast.success("Nạp tiền thành công! Số dư đã cập nhật.");

    if (requiredAmount) {
      if (balance >= requiredAmount) {
        if (onSuccess) {
          toast.info("Đang tự động thanh toán...");
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1000);
        } else {
          setTimeout(() => onClose(), 1500);
        }
      } else {
        toast.warning("Số dư vẫn chưa đủ thanh toán. Vui lòng nạp thêm.");
        initialBalanceRef.current = balance;
        hasTriggeredSuccess.current = false;
      }
    } else {
      setTimeout(() => onClose(), 1500);
    }
  }, [balance, requiredAmount, onSuccess, onClose, toast]);

  // Init when modal opens
  useEffect(() => {
    if (open) {
      initialBalanceRef.current = balance;
      hasTriggeredSuccess.current = false;
      setIsChecking(true);
      setIsTimedOut(false);
      refreshBalance();

      // 15-minute timeout — stop polling after that
      timeoutRef.current = setTimeout(() => {
        setIsTimedOut(true);
        setIsChecking(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }, 15 * 60 * 1000);
    } else {
      setIsChecking(false);
      setIsTimedOut(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Polling every 3 seconds
  useEffect(() => {
    if (open) {
      pollingRef.current = setInterval(async () => {
        await refreshBalance();
      }, 3000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open, refreshBalance]);

  // Detect balance increase
  useEffect(() => {
    if (!open || hasTriggeredSuccess.current) return;

    if (balance > initialBalanceRef.current) {
      handleSuccess();
    }
  }, [balance, open, handleSuccess]);

  const handleManualCheck = async () => {
    toast.info("Đang kiểm tra giao dịch...");
    await refreshBalance();
  };

  if (!open || !info) return null;

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã sao chép ${label}`);
    } catch {
      toast.error("Không thể sao chép tự động");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "var(--bg-overlay)" }}>
      <div
        className="w-full max-w-5xl rounded-2xl overflow-hidden th-shadow-lg flex flex-col md:flex-row max-h-[90vh] border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
      >
        {/* LEFT COLUMN: QR CODE */}
        <div
          className="w-full md:w-2/5 border-b md:border-b-0 md:border-r p-6 flex flex-col items-center justify-center text-center relative"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}
        >
          <h3 className="text-xl font-bold th-text-primary mb-1">Quét mã để nạp tiền</h3>
          <p className="text-sm th-text-muted mb-6">Mở app ngân hàng và quét mã QR bên dưới</p>

          <div
            className="relative bg-white p-3 rounded-2xl th-shadow-sm border mb-6 w-full max-w-[260px] aspect-square"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <Image src={info.qrUrl} alt="Mã QR nạp tiền" fill className="object-contain p-2 rounded-xl" priority unoptimized />
          </div>

          <div className="flex flex-col gap-3 w-full max-w-[260px]">
            <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-bold" style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
              {isTimedOut ? (
                <>
                  <AlertCircle size={14} />
                  Hết thời gian chờ
                </>
              ) : isChecking ? (
                <>
                  <span className="relative flex h-2.5 w-2.5 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--accent)" }} />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "var(--accent)" }} />
                  </span>
                  Đang chờ tiền về ví...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Đã nhận tiền
                </>
              )}
            </div>

            <button
              onClick={handleManualCheck}
              className="flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-sm font-bold transition-colors th-bg-hover"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              <RefreshCw size={14} /> Tôi đã chuyển khoản
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILS */}
        <div className="w-full md:w-3/5 flex flex-col h-full">
          <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: "var(--border-primary)" }}>
            <div>
              <h3 className="text-lg font-bold th-text-primary">Chi tiết giao dịch</h3>
              {requiredAmount && (
                <p className="text-xs font-bold mt-0.5" style={{ color: "var(--danger)" }}>
                  Số dư không đủ. Cần nạp để thanh toán ngay.
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full th-bg-hover"
              aria-label="Đóng"
            >
              <X size={24} className="th-text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Calculation display when required amount is set */}
            {requiredAmount && (
              <div className="rounded-2xl p-4 border space-y-3" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
                <div className="flex justify-between text-sm">
                  <span className="th-text-muted">Tổng đơn hàng</span>
                  <span className="font-bold th-text-primary">{requiredAmount.toLocaleString("vi-VN")}đ</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="th-text-muted">Số dư hiện tại</span>
                  <span className="font-bold th-text-primary">{balance.toLocaleString("vi-VN")}đ</span>
                </div>
                <div className="h-px" style={{ background: "var(--border-primary)" }} />
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold" style={{ color: "var(--danger)" }}>Cần nạp thêm</span>
                  <span className="text-xl font-black" style={{ color: "var(--danger)" }}>
                    {info.amount.toLocaleString("vi-VN")}đ
                  </span>
                </div>

                <div className="mt-3 p-3 rounded-xl text-xs flex gap-2 items-start" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Lưu ý:</strong> Sau khi nạp thành công, hệ thống sẽ{" "}
                    <strong>tự động thanh toán</strong> đơn hàng của bạn.
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <DataField
                label="Số tiền chuyển"
                value={info.amount.toLocaleString("vi-VN")}
                suffix="đ"
                highlight="green"
                onCopy={() => handleCopy(String(info.amount), "Số tiền")}
              />
              <DataField
                label="Nội dung (Bắt buộc)"
                value={info.description}
                highlight="blue"
                warning="Nhập chính xác nội dung này"
                onCopy={() => handleCopy(info.description, "Nội dung")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DataField
                label="Số tài khoản"
                value={info.beneficiary}
                onCopy={() => handleCopy(info.beneficiary, "STK")}
              />
              {info.accountName && (
                <DataField
                  label="Chủ tài khoản"
                  value={info.accountName.toUpperCase()}
                  onCopy={() => handleCopy(info.accountName!.toUpperCase(), "Tên TK")}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DataField sub-component
// ============================================

interface DataFieldProps {
  label: string;
  value: string | number;
  suffix?: string;
  highlight?: "green" | "blue";
  warning?: string;
  onCopy: () => void;
}

function DataField({ label, value, suffix, highlight, warning, onCopy }: DataFieldProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyClick = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bgStyle = highlight === "green"
    ? { background: "var(--success-light)", borderColor: "var(--success)" }
    : highlight === "blue"
      ? { background: "var(--accent-light)", borderColor: "var(--accent)" }
      : { background: "var(--bg-card)", borderColor: "var(--border-primary)" };

  const textColor = highlight === "green"
    ? "var(--success)"
    : highlight === "blue"
      ? "var(--accent)"
      : "var(--text-primary)";

  return (
    <div
      onClick={handleCopyClick}
      className="group relative p-4 rounded-2xl border transition-all cursor-pointer select-none"
      style={bgStyle}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold th-text-muted uppercase tracking-wider mb-1.5">{label}</p>
          <div className="flex items-baseline gap-1">
            <p className="text-xl font-black" style={{ color: textColor }}>
              {value}
              {suffix && <span className="text-lg th-text-muted ml-1">{suffix}</span>}
            </p>
          </div>
          {warning && (
            <p className="text-xs font-semibold mt-1" style={{ color: "var(--danger)" }}>
              * {warning}
            </p>
          )}
        </div>
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: copied ? "var(--success-light)" : "var(--bg-secondary)",
            color: copied ? "var(--success)" : "var(--text-muted)",
          }}
        >
          {copied ? <Check size={20} /> : <Copy size={20} />}
        </div>
      </div>
    </div>
  );
}
