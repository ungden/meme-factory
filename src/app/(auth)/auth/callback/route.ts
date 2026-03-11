import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getRedirectOrigin(fallbackOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, "");
  }
  return fallbackOrigin;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const redirectOrigin = getRedirectOrigin(origin);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/projects";
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Prevent open redirect — only allow relative paths
  const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";

  // OAuth error from provider (user cancelled, etc.)
  if (oauthError) {
    console.error("[Auth Callback] OAuth error:", oauthError, errorDescription);
    return NextResponse.redirect(
      `${redirectOrigin}/login?error=oauth_failed&next=${encodeURIComponent(safePath)}`
    );
  }

  if (code) {
    const cookieStore = await cookies();

    // Collect cookies that Supabase SDK wants to set on the response
    const cookiesToForward: { name: string; value: string; options: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach((cookie) => {
              cookiesToForward.push(cookie);
              // Also try to set on cookieStore for middleware to pick up
              try {
                cookieStore.set(cookie.name, cookie.value, cookie.options);
              } catch {
                // Ignore — Route Handler context may not allow this
              }
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(`${redirectOrigin}${safePath}`);
      // Forward all session cookies onto the redirect response
      cookiesToForward.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
      });
      return response;
    }

    // Exchange failed — log the real error for debugging
    console.error("[Auth Callback] exchangeCodeForSession failed:", error.message);

    // If PKCE code_verifier is missing, redirect to a client-side fallback
    // that can exchange using the browser's cookies
    if (error.message.includes("code verifier") || error.message.includes("code_verifier")) {
      console.error("[Auth Callback] PKCE code_verifier missing — falling back to client exchange");
      return NextResponse.redirect(
        `${redirectOrigin}/auth/callback/client?code=${code}&next=${encodeURIComponent(safePath)}`
      );
    }
  }

  return NextResponse.redirect(
    `${redirectOrigin}/login?error=auth_failed&next=${encodeURIComponent(safePath)}`
  );
}
