"use client";

import Button from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg-primary)" }}>
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--danger-light)" }}>
          <AlertTriangle size={32} style={{ color: "var(--danger)" }} />
        </div>
        <h2 className="text-xl font-bold th-text-primary mb-2">Có lỗi xảy ra</h2>
        <p className="th-text-tertiary text-sm mb-6">
          {error.message || "Một lỗi không xác định đã xảy ra. Vui lòng thử lại."}
        </p>
        <Button onClick={reset}>
          <RotateCcw size={16} /> Thử lại
        </Button>
      </div>
    </div>
  );
}
