import { ReactNode } from "react";
import { WalletProvider } from "@/contexts/WalletContext";
import AppShell from "@/components/layout/app-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
        <AppShell>{children}</AppShell>
      </div>
    </WalletProvider>
  );
}
