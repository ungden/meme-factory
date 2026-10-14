import { redirect } from "next/navigation";

/** Trang Mascot cũ đã gộp vào Nhân vật; giữ đường này vì link và dấu trang cũ vẫn còn. */
export default async function LegacyMascotsRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/characters`);
}
