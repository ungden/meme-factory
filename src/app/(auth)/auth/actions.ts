"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

/** Ensure redirect target is a relative path to prevent open-redirect attacks */
function sanitizeRedirect(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/projects";
}

/** Get the actual origin from request headers (respects Vercel proxying) */
async function getOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") || "https";
  if (host) {
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function loginWithGoogleAction(formData: FormData) {
  const next = sanitizeRedirect(String(formData.get("next") ?? "/projects"));
  const supabase = await createServerSupabase();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/login?error=oauth_failed&next=${encodeURIComponent(next)}`);
  }

  if (data?.url) {
    redirect(data.url);
  }
}

export async function logoutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
