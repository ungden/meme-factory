import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { FREE_TRIAL_POINTS } from "@/lib/point-pricing";
import { reportError } from "@/lib/observability";

/** Ensure redirect target is a relative path to prevent open-redirect attacks */
function sanitizeRedirect(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/projects";
}


/**
 * Tặng điểm dùng thử ngay khi email được xác nhận.
 *
 * RPC `claim_free_trial` đã tồn tại từ lâu nhưng không client nào gọi, nên mọi
 * tài khoản mới bắt đầu với 0 điểm sau một nút ghi "Bắt đầu miễn phí". Đây là
 * chỗ đúng để gọi: chạy đúng một lần cho mỗi lần xác nhận email, phía server,
 * và RPC tự chặn lần thứ hai bằng cờ `free_trial_claimed`.
 *
 * Không được phép làm hỏng đăng nhập: tặng điểm hỏng thì người dùng vẫn vào
 * được, và lỗi đi vào Sentry.
 */
async function grantFreeTrial(user: { id: string; email_confirmed_at?: string | null } | null) {
  if (!user?.id || !user.email_confirmed_at) return;
  try {
    const { error } = await getSupabaseAdmin().rpc("claim_free_trial", {
      _user_id: user.id,
      _free_points: FREE_TRIAL_POINTS,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    await reportError(error, { scope: "auth.free-trial", tags: { userId: user.id } });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirect(searchParams.get("next") ?? "/projects");

  // Build origin from request headers to handle Vercel proxying correctly
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "aida.vn";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const origin = `${proto}://${host}`;

  if (code) {
    const cookieStore = await cookies();

    // Collect cookies to set on the redirect response
    const pendingCookies: {
      name: string;
      value: string;
      options: CookieOptions;
    }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[],
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              pendingCookies.push({ name, value, options });
              // Also set on the cookie store so subsequent reads see them
              try {
                cookieStore.set(name, value, options);
              } catch {
                // May fail in some contexts
              }
            });
          },
        },
      },
    );

    const { data: session, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await grantFreeTrial(session?.user ?? null);
      const redirectUrl = `${origin}${next}`;
      const response = NextResponse.redirect(redirectUrl);

      // Forward auth cookies onto the redirect response
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          ...options,
          // Ensure cookies work across the domain
          path: "/",
          sameSite: "lax",
          secure: true,
        });
      });

      return response;
    }
  }

  // Return the user to login with error
  return NextResponse.redirect(
    `${origin}/login?error=auth_failed`,
  );
}
