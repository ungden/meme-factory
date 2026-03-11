"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function ClientCallbackPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/projects";

    if (!code) {
      setError("Không nhận được mã xác thực từ Google");
      return;
    }

    const exchange = async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("[Client Callback] Exchange failed:", error.message);
          setError(error.message);
          return;
        }

        // Success — redirect to target page
        const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
        window.location.replace(safePath);
      } catch (err) {
        console.error("[Client Callback] Unexpected error:", err);
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
      }
    };

    exchange();
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center max-w-md">
          <div className="p-4 rounded-2xl mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}>
            <p className="th-text-danger text-sm mb-3">Đăng nhập Google thất bại: {error}</p>
            <button
              onClick={() => window.location.replace("/login")}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Quay lại đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="text-center">
        <Loader2 size={32} className="animate-spin mx-auto mb-3" style={{ color: "var(--accent)" }} />
        <p className="th-text-secondary text-sm">Đang xác thực tài khoản Google...</p>
      </div>
    </div>
  );
}
