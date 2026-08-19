import { redirect } from "next/navigation";

/** Retired route: the mascot library is now the single place mascots live. */
export default async function LegacyCharactersRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/mascots`);
}
