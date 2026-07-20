import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const dynamic = "force-dynamic";

function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith("https://") && !url.includes("placeholder"));
}

export default async function ProjectScopedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The client store already ships with realistic mock projects. Keep the
  // project shell reachable in local preview when provider credentials are not
  // configured; production always takes the authenticated/RLS path below.
  if (!hasSupabaseConfig()) {
    return <>{children}</>;
  }

  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const query = supabase.from("projects").select("id").limit(1);
  const { data: project } = isUuid(id)
    ? await query.eq("id", id).maybeSingle()
    : await query.eq("slug", id).maybeSingle();

  // RLS decides visibility (owner or shared member). If not visible -> 404.
  if (!project) {
    notFound();
  }

  return <>{children}</>;
}
