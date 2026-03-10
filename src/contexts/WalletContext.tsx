"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/database";

interface WalletContextType {
  balance: number;
  points: number;
  transactions: Transaction[];
  isLoading: boolean;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const refreshBalance = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setIsAuthenticated(false);
        setBalance(0);
        setPoints(0);
        setTransactions([]);
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);

      const res = await fetch("/api/wallet/balance", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Không thể tải số dư");
      }

      const data = await res.json();
      setBalance(data.balance ?? 0);
      setPoints(data.points ?? 0);
      setTransactions(data.transactions ?? []);
    } catch (error) {
      console.error("Lỗi tải số dư ví:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch balance on mount
  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Listen for auth state changes
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
      if (session) {
        setIsAuthenticated(true);
        refreshBalance();
      } else {
        setIsAuthenticated(false);
        setBalance(0);
        setPoints(0);
        setTransactions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshBalance]);

  const value = useMemo(
    () => ({
      balance,
      points,
      transactions,
      isLoading,
      refreshBalance,
    }),
    [balance, points, transactions, isLoading, refreshBalance]
  );

  // Don't render provider until we know auth state
  if (!isAuthenticated && !isLoading) {
    return <WalletContext.Provider value={{ balance: 0, points: 0, transactions: [], isLoading: false, refreshBalance }}>
      {children}
    </WalletContext.Provider>;
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet phải được sử dụng trong WalletProvider");
  }
  return context;
}
