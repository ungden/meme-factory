import { redirect } from "next/navigation";

/** Trang chi tiết Mascot cũ đã gộp vào trang chi tiết nhân vật; giữ đường này cho link cũ. */
export default async function LegacyMascotRedirect({
  params,
}: {
  params: Promise<{ id: string; characterId: string }>;
}) {
  const { id, characterId } = await params;
  redirect(`/projects/${id}/characters/${characterId}`);
}
