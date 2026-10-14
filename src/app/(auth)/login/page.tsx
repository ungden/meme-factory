"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loginWithGoogleAction } from "@/app/(auth)/auth/actions";
import { IS_MOCK_MODE } from "@/lib/use-store";
import { FREE_TRIAL_POINTS } from "@/lib/point-pricing";
import Button from "@/components/ui/button";
import Alert from "@/components/ui/alert";
import Input from "@/components/ui/input";
import { Sparkles, Mail, Lock, Zap } from "lucide-react";

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && url.startsWith("https://") && !url.includes("placeholder");
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  // "reset" là màn quên mật khẩu: chỉ hỏi email, không hỏi mật khẩu.
  const [mode, setMode] = useState<"auth" | "reset">("auth");
  const [accepted, setAccepted] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const redirectPath = useMemo(() => {
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/projects";
  }, [searchParams]);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode) return;

    if (errorCode === "auth_failed") {
      setError("Chưa đăng nhập được. Bạn thử lại nhé.");
    } else if (errorCode === "oauth_failed") {
      setError("Chưa đăng nhập được bằng Google, hoặc bạn đã huỷ giữa chừng.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!configured) {
      setError("Chưa đăng nhập được lúc này. Bạn thử lại sau ít phút.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setNeedsConfirmation(false);

    const supabase = createClient();
    const authBase = typeof window !== "undefined" ? window.location.origin : "";

    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${authBase}/api/auth/callback?next=${encodeURIComponent("/auth/reset")}`,
        });
        if (error) throw error;
        // Không tiết lộ email có tồn tại hay không: cùng một câu trả lời cho mọi
        // địa chỉ, nếu không trang này thành công cụ dò tài khoản.
        setMessage("Nếu email này có tài khoản, chúng tôi vừa gửi link đặt lại mật khẩu.");
      } else if (isSignUp) {
        // For email signup, redirectTo goes through API callback route (server-side code exchange)
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${authBase}/api/auth/callback?next=${encodeURIComponent(redirectPath)}`,
          },
        });
        if (error) throw error;
        setMessage("Mở email và bấm link xác nhận để vào tài khoản nhé.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Hard navigation ensures middleware picks up fresh session cookies
        // router.replace + refresh causes flash because RSC fetch races with middleware
        window.location.href = redirectPath;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Translate common Supabase errors
      if (msg.includes("Invalid login credentials")) {
        setError("Email hoặc mật khẩu chưa đúng.");
      } else if (msg.includes("Email not confirmed")) {
        setError("Bạn cần bấm link xác nhận trong email trước đã.");
        setNeedsConfirmation(true);
      } else if (msg.includes("already registered")) {
        setError("Email này đã có tài khoản. Bạn đăng nhập nhé.");
      } else if (/password/i.test(msg)) {
        setError("Mật khẩu cần ít nhất 6 ký tự.");
      } else if (/rate limit|too many/i.test(msg)) {
        setError("Bạn thử hơi nhiều lần. Chờ vài phút rồi thử lại nhé.");
      } else {
        setError("Chưa đăng nhập được. Bạn thử lại nhé.");
      }
    } finally {
      setLoading(false);
    }
  };

  async function handleResendConfirmation() {
    if (!email) return;
    setResending(true);
    setError(null);
    try {
      const authBase = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${authBase}/api/auth/callback?next=${encodeURIComponent(redirectPath)}` },
      });
      if (error) throw error;
      setMessage("Đã gửi lại email xác nhận. Kiểm tra cả hộp thư rác nhé.");
      setNeedsConfirmation(false);
    } catch (err) {
      setError(
        err instanceof Error && /rate limit|too many/i.test(err.message)
          ? "Bạn vừa gửi lại rồi. Chờ vài phút rồi thử lại nhé."
          : "Chưa gửi lại được email xác nhận. Bạn thử lại nhé.",
      );
    } finally {
      setResending(false);
    }
  }

  const handleGoogleLogin = () => {
    if (!configured) {
      setError("Chưa đăng nhập được lúc này. Bạn thử lại sau ít phút.");
      return;
    }

    setGoogleLoading(true);
    setError(null);

    // Submit via hidden form to call Server Action
    // This stores code_verifier in server cookies (not browser)
    const form = document.getElementById("google-login-form") as HTMLFormElement;
    if (form) form.requestSubmit();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 th-bg-primary th-glow">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl th-bg-gradient th-text-on-primary th-shadow-accent" aria-label="AIDA — trang chủ">
            <Sparkles size={20} fill="currentColor" />
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight th-text-primary">
            {mode === "reset" ? "Đặt lại mật khẩu" : isSignUp ? "Tạo tài khoản AIDA" : "Chào mừng trở lại"}
          </h1>
          <p className="th-text-secondary mt-2 leading-6">
            Meme, video, phim ngắn cho kênh của bạn — đúng nhân vật, ngày nào cũng có.
          </p>
        </div>

        {/* Dev mode - skip login */}
        {IS_MOCK_MODE && (
          <div className="mb-6">
            <Button size="lg" className="w-full" onClick={() => router.push("/projects")}>
              <Zap size={20} />
              Xem thử bằng dữ liệu mẫu (bỏ qua đăng nhập)
            </Button>
            <p className="text-center text-xs th-text-muted mt-2">
              Dùng dữ liệu mẫu để xem thử mọi màn hình
            </p>
          </div>
        )}

        {/* Setup warning */}
        {!configured && !IS_MOCK_MODE && (
          <Alert tone="warning" title="Đăng nhập đang tạm dừng" className="mb-6">
            Trang này chưa được nối với máy chủ đăng nhập. Bạn quay lại sau ít phút nhé.
          </Alert>
        )}

        {/* Form */}
        <div className="rounded-2xl border p-6 th-bg-card th-border th-shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-tertiary pointer-events-none mt-3" />
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>

            <div className={`relative ${mode === "reset" ? "hidden" : ""}`}>
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-tertiary pointer-events-none mt-3" />
              <Input
                id="password"
                label="Mật khẩu"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required={mode !== "reset"}
                minLength={6}
              />
            </div>

            {mode === "auth" && isSignUp && (
              <label className="flex items-start gap-2 text-sm th-text-tertiary">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Tôi đồng ý với{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="th-text-accent underline">
                    Điều khoản sử dụng
                  </a>{" "}
                  và{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="th-text-accent underline">
                    Chính sách bảo mật
                  </a>
                  .
                </span>
              </label>
            )}

            {error && (
              <Alert>
                {error}
                {needsConfirmation && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="mt-2 block font-semibold underline"
                  >
                    {resending ? "Đang gửi lại…" : "Gửi lại email xác nhận"}
                  </button>
                )}
              </Alert>
            )}

            {message && <Alert tone="success">{message}</Alert>}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={loading}
              disabled={googleLoading || (mode === "auth" && isSignUp && !accepted)}
            >
              {mode === "reset" ? "Gửi link đặt lại mật khẩu" : isSignUp ? "Tạo tài khoản" : "Đăng nhập"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "reset" ? "auth" : "reset");
                setError(null);
                setMessage(null);
              }}
              className="block w-full text-center text-sm th-text-tertiary hover:opacity-80"
            >
              {mode === "reset" ? "Quay lại đăng nhập" : "Quên mật khẩu?"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t th-border" />
            <span className="text-xs th-text-muted">hoặc</span>
            <div className="flex-1 border-t th-border" />
          </div>

          {/* Hidden form for Google OAuth — calls Server Action so code_verifier is stored in server cookies */}
          <form id="google-login-form" action={loginWithGoogleAction} className="hidden">
            <input type="hidden" name="next" value={redirectPath} />
          </form>

          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={handleGoogleLogin}
            loading={googleLoading}
            disabled={loading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {googleLoading ? "Đang chuyển tới Google…" : "Tiếp tục với Google"}
          </Button>

          <p className="text-center text-sm th-text-tertiary mt-5">
            {isSignUp ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              onClick={() => {
                if (loading || googleLoading) return;
                setIsSignUp(!isSignUp);
                setError(null);
                setMessage(null);
              }}
              className="th-text-accent hover:opacity-80 font-medium"
            >
              {isSignUp ? "Đăng nhập" : "Đăng ký"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-sm th-text-tertiary">
          Tài khoản mới được tặng {FREE_TRIAL_POINTS} điểm để làm thử.{" "}
          <Link href="/" className="th-text-secondary underline underline-offset-4">Về trang chủ</Link>
        </p>
      </div>
    </div>
  );
}
