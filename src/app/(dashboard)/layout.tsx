import { ReactNode } from "react";
import { WalletProvider } from "@/contexts/WalletContext";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
        {children}
      </div>
    </WalletProvider>
  );
}
