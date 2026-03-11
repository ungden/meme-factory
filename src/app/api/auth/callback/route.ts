import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/** Ensure redirect target is a relative path to prevent open-redirect attacks */
function sanitizeRedirect(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/projects";
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
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
