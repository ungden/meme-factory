"use client";

import { useEffect, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";

/**
 * Đặt lại mật khẩu sau khi bấm link trong email.
 *
 * Link đi qua /api/auth/callback nên tới đây người dùng đã có phiên tạm; việc
 * còn lại chỉ là đổi mật khẩu. Nếu không có phiên (link hết hạn hoặc mở ở trình
 * duyệt khác) thì nói thẳng thay vì để form báo lỗi khó hiểu lúc bấm lưu.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (active) setReady(Boolean(data.user));
      } catch {
        if (active) setReady(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Hai ô mật khẩu chưa giống nhau.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      window.location.href = "/projects";
    }, 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl th-bg-accent shadow-lg th-shadow-accent">
            <Sparkles size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold th-text-primary">Đặt mật khẩu mới</h1>
        </div>

        <div className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}>
          {ready === false ? (
            <div className="space-y-4">
              <p className="th-text-secondary">
                Link đặt lại mật khẩu đã hết hạn hoặc được mở ở trình duyệt khác. Hãy yêu cầu một link mới.
              </p>
              <Button className="w-full" onClick={() => (window.location.href = "/login")}>
                Quay lại đăng nhập
              </Button>
            </div>
          ) : done ? (
            <p className="th-text-success">Đã đổi mật khẩu. Đang đưa bạn vào AIDA…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 mt-3 -translate-y-1/2 th-text-tertiary" />
                <Input
                  id="new-password"
                  label="Mật khẩu mới"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
              <div className="relative">
                <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 mt-3 -translate-y-1/2 th-text-tertiary" />
                <Input
                  id="confirm-password"
                  label="Nhập lại mật khẩu mới"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
              {error && (
                <div className="rounded-xl border p-3 text-sm th-border-danger th-bg-danger-light th-text-danger">{error}</div>
              )}
              <Button type="submit" className="w-full" size="lg" loading={saving} disabled={ready === null}>
                Lưu mật khẩu mới
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
