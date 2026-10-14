import { redirect } from "next/navigation";

// Gợi ý 6 câu giờ nằm trong Ghép chữ, nơi câu được dán lên ảnh. Giữ đường dẫn
// cũ cho các link đã chia sẻ.
export default async function AiMemeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/editor`);
}
