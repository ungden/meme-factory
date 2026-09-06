import { redirect } from "next/navigation";

// Preserve old shared links while sending every creation entry point into the
// same dashboard shell and data flow.
export default async function ContinuityStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/projects/${id}/generate${query.size ? `?${query}` : ""}`);
}
