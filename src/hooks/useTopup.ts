"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { TopupInfo } from "@/types/database";

export function useTopup() {
  const [isLoading, setIsLoading] = useState(false);
  const [topupInfo, setTopupInfo] = useState<TopupInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Lưu trữ hành động cần thực hiện sau khi nạp thành công
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);

  const toast = useToast();

  /** `packageId`: nạp để mua đúng gói đó, điểm vào ví ngay khi ngân hàng báo có. */
  const createTopup = async (amount: number, onSuccess?: () => void, packageId?: string) => {
    // Lưu callback để gọi lại sau
    onSuccessRef.current = onSuccess;

    // Làm tròn số tiền tối thiểu 10k
    const finalAmount = Math.max(amount, 10000);

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        toast.error("Bạn đăng nhập lại giúp nhé.");
        return;
      }

      const res = await fetch("/api/wallet/create-topup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(packageId ? { packageId } : { amount: finalAmount }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Chưa tạo được mã chuyển khoản. Bạn thử lại nhé.");
      }

      setTopupInfo({
        orderId: data.orderId,
        amount: data.amount,
        description: data.description,
        qrUrl: data.qrUrl,
        beneficiary: data.beneficiary,
        bankBin: data.bankBin,
        bankName: data.bankName,
        accountName: data.accountName,
      });
      setIsModalOpen(true);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Chưa tạo được mã chuyển khoản. Bạn thử lại nhé.");
    } finally {
      setIsLoading(false);
    }
  };

  const closeTopup = () => {
    setIsModalOpen(false);
    setTopupInfo(null);
    onSuccessRef.current = undefined;
  };

  return {
    createTopup,
    topupInfo,
    isModalOpen,
    closeTopup,
    isLoading,
    onSuccess: onSuccessRef.current,
  };
}
