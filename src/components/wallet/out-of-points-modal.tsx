"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import Modal from "@/components/ui/modal";
import Button from "@/components/ui/button";
import BankTransferTopupModal from "@/components/wallet/BankTransferTopupModal";
import { useTopup } from "@/hooks/useTopup";
import { formatVND } from "@/lib/point-pricing";
import { suggestPackage } from "@/lib/pricing-examples";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Số điểm việc này cần. */
  required: number;
  /** Số điểm người dùng đang có. */
  current: number;
  /** Việc đang định làm, để câu thông báo nói đúng chuyện gì. */
  action?: string;
  /** Chạy lại việc đó sau khi nạp xong. */
  onFunded?: () => void;
};

/**
 * Màn "cần thêm điểm" ngay trong luồng đang làm.
 *
 * Trước đây hết điểm chỉ hiện một toast đỏ rồi biến mất: người dùng phải tự
 * hiểu là mình hết điểm, tự tìm đường sang ví, tự đoán nạp bao nhiêu. Ở đây nói
 * thẳng thiếu bao nhiêu, gợi ý đúng một gói, và mở QR tại chỗ.
 */
export default function OutOfPointsModal({ open, onClose, required, current, action, onFunded }: Props) {
  const { createTopup, isLoading, topupInfo, isModalOpen, closeTopup, onSuccess } = useTopup();
  const [started, setStarted] = useState(false);
  const shortfall = Math.max(1, required - current);
  const pkg = suggestPackage(shortfall);

  return (
    <>
      <Modal isOpen={open && !started} onClose={onClose} title="Cần thêm điểm" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl th-bg-accent-light th-text-accent">
              <Coins size={18} />
            </span>
            <div className="min-w-0">
              <p className="th-text-primary">
                {action ? `${action} cần ` : "Việc này cần "}
                <strong>{required} điểm</strong>, bạn đang có <strong>{current} điểm</strong>.
              </p>
              <p className="mt-1 text-sm th-text-tertiary">Thiếu {shortfall} điểm.</p>
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
            <p className="font-semibold th-text-primary">
              Gói {pkg.name} — {pkg.points} điểm
            </p>
            <p className="mt-1 text-sm th-text-tertiary">
              {formatVND(pkg.price)} · chuyển khoản quét QR, điểm vào ngay khi ngân hàng báo có.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>Để sau</Button>
            <Button
              loading={isLoading}
              onClick={async () => {
                setStarted(true);
                await createTopup(pkg.price, () => {
                  setStarted(false);
                  onClose();
                  onFunded?.();
                });
              }}
            >
              Nạp {formatVND(pkg.price)}
            </Button>
          </div>
        </div>
      </Modal>

      <BankTransferTopupModal
        open={isModalOpen}
        onClose={() => {
          closeTopup();
          setStarted(false);
        }}
        info={topupInfo}
        requiredAmount={pkg.price}
        onSuccess={onSuccess}
      />
    </>
  );
}
