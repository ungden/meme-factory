import { redirect } from "next/navigation";

// Không còn bước khởi tạo riêng: người mới gõ ý tưởng ở trang chính và AI tự
// dựng kênh. Giữ đường dẫn cũ để liên kết đã gửi đi không gãy.
export default function OnboardingPage() {
  redirect("/projects");
}
