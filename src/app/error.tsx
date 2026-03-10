"use client";

import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg-primary, #ffffff)" }}>
      <div className="text-center max-w-md">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--danger-light, #fef2f2)" }}
        >
          <AlertTriangle size={32} style={{ color: "var(--danger, #ef4444)" }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary, #1a1a2e)" }}>
          Có lỗi xảy ra
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-tertiary, #6b7280)" }}>
          {error.message || "Một lỗi không xác định đã xảy ra. Vui lòng thử lại."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-xl transition-all"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
          >
            <RotateCcw size={16} /> Thử lại
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border transition-all"
            style={{
              color: "var(--text-secondary, #374151)",
              borderColor: "var(--border-primary, #e5e7eb)",
              background: "var(--bg-card, #ffffff)",
            }}
          >
            <Home size={16} /> Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}
