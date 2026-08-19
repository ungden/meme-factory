import { redirect } from "next/navigation";

/**
 * Retired route. Pose management lives on the mascot page as the "Ảnh gốc" tab,
 * so one mascot is one page. Kept as a redirect because links and bookmarks to
 * this URL are in the wild.
 */
export default async function LegacyCharacterDetailRedirect({
  params,
}: {
  params: Promise<{ id: string; characterId: string }>;
}) {
  const { id, characterId } = await params;
  redirect(`/projects/${id}/mascots/${characterId}`);
}
